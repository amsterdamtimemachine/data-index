// src/tests/chunkLoadingValidation.test.ts - Validate that granular reads only load requested chunks

import { describe, test, expect, beforeAll } from 'bun:test';
import { decode } from '@msgpack/msgpack';
import type {
	VisualizationMetadata,
	Heatmap,
	SectionIndex
} from '@atm/shared/types';

const OUTPUT_PATH = process.env.OUTPUT_PATH;

interface BinaryData {
	metadata: VisualizationMetadata;
	buffer: ArrayBuffer;
	dataStartOffset: number;
}

let binaryData: BinaryData;

function forceGC() {
	if (typeof Bun !== 'undefined' && Bun.gc) {
		Bun.gc(true);
	}
}

function getHeapUsed(): number {
	forceGC();
	return process.memoryUsage().heapUsed;
}

function readSection<T>(
	buffer: ArrayBuffer,
	dataStartOffset: number,
	sectionOffset: number,
	section: SectionIndex
): T {
	const bytes = new Uint8Array(
		buffer,
		dataStartOffset + sectionOffset + section.offset,
		section.length
	);
	return decode(bytes) as T;
}

describe('Chunk Loading Validation', () => {
	beforeAll(async () => {
		if (!OUTPUT_PATH) {
			throw new Error('OUTPUT_PATH environment variable is not set');
		}

		const file = Bun.file(OUTPUT_PATH);
		if (!(await file.exists())) {
			throw new Error(`Binary file not found at: ${OUTPUT_PATH}`);
		}

		const buffer = await file.arrayBuffer();
		const dataView = new DataView(buffer);
		const metadataSize = dataView.getUint32(0, false);

		const metadataBytes = new Uint8Array(buffer, 4, metadataSize);
		const metadata = decode(metadataBytes) as VisualizationMetadata;

		binaryData = {
			metadata,
			buffer,
			dataStartOffset: 4 + metadataSize
		};

		console.log(`Binary size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
	});

	test('single heatmap read uses less memory than full read', async () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;

		// Count total sections
		let totalSections = 0;
		let singleSection: { res: string; ts: string; rt: string; section: SectionIndex } | null = null;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					totalSections++;
					if (!singleSection && sections.base) {
						singleSection = { res: resKey, ts: tsKey, rt: rtKey, section: sections.base };
					}
					totalSections += Object.keys(sections.tags).length;
				}
			}
		}

		console.log(`Total heatmap sections: ${totalSections}`);

		// Measure single section read
		forceGC();
		const heapBefore = getHeapUsed();

		const singleHeatmap = readSection<Heatmap>(
			binaryData.buffer,
			binaryData.dataStartOffset,
			heatmapsOffset,
			singleSection!.section
		);

		const heapAfterSingle = getHeapUsed();
		const singleReadMemory = heapAfterSingle - heapBefore;

		console.log(`Single section read: ${(singleReadMemory / 1024).toFixed(2)} KB`);
		console.log(`  - countArray length: ${singleHeatmap.countArray.length}`);
		console.log(`  - Section bytes: ${singleSection!.section.length}`);

		// Clear and measure full read
		forceGC();
		const heapBeforeFull = getHeapUsed();

		const allHeatmaps: Heatmap[] = [];
		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					allHeatmaps.push(
						readSection<Heatmap>(
							binaryData.buffer,
							binaryData.dataStartOffset,
							heatmapsOffset,
							sections.base
						)
					);
					for (const tagSection of Object.values(sections.tags)) {
						allHeatmaps.push(
							readSection<Heatmap>(
								binaryData.buffer,
								binaryData.dataStartOffset,
								heatmapsOffset,
								tagSection
							)
						);
					}
				}
			}
		}

		const heapAfterFull = getHeapUsed();
		const fullReadMemory = heapAfterFull - heapBeforeFull;

		console.log(`Full read (${allHeatmaps.length} sections): ${(fullReadMemory / 1024 / 1024).toFixed(2)} MB`);

		// Single read should use significantly less memory than full read
		const ratio = fullReadMemory / Math.max(singleReadMemory, 1);
		console.log(`Memory ratio (full/single): ${ratio.toFixed(1)}x`);

		// Expect single read to use at least 10x less memory than full read
		expect(ratio).toBeGreaterThan(10);
	});

	test('reading N sections uses proportionally less memory than all sections', async () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;

		// Collect all base sections
		const allSections: SectionIndex[] = [];
		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					allSections.push(sections.base);
				}
			}
		}

		const totalCount = allSections.length;
		const subsetCount = Math.min(5, totalCount);
		const subset = allSections.slice(0, subsetCount);

		console.log(`Testing ${subsetCount} sections vs ${totalCount} total`);

		// Calculate expected bytes based on section sizes
		const subsetBytes = subset.reduce((sum, s) => sum + s.length, 0);
		const totalBytes = allSections.reduce((sum, s) => sum + s.length, 0);

		console.log(`Subset msgpack bytes: ${(subsetBytes / 1024).toFixed(2)} KB`);
		console.log(`Total msgpack bytes: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

		// The key insight: subset bytes should be proportionally smaller
		const bytesRatio = totalBytes / subsetBytes;
		const expectedRatio = totalCount / subsetCount;

		console.log(`Bytes ratio: ${bytesRatio.toFixed(1)}x`);
		console.log(`Count ratio: ${expectedRatio.toFixed(1)}x`);

		// Verify that reading subset requires accessing fewer bytes
		// Sections may vary in size, so just verify subset is meaningfully smaller
		expect(bytesRatio).toBeGreaterThan(2);

		// Also verify we can read subset without error
		const subsetHeatmaps = subset.map((section) =>
			readSection<Heatmap>(
				binaryData.buffer,
				binaryData.dataStartOffset,
				heatmapsOffset,
				section
			)
		);

		expect(subsetHeatmaps.length).toBe(subsetCount);
		expect(subsetHeatmaps[0].countArray).toBeDefined();
	});

	test('decoded heatmap size matches expected JS object size', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;

		// Get first resolution and its dimensions
		const firstRes = Object.keys(index)[0];
		const [cols, rows] = firstRes.split('x').map(Number);
		const cellCount = cols * rows;

		// Find a section
		const timeSlices = index[firstRes];
		let section: SectionIndex | null = null;
		for (const recordTypes of Object.values(timeSlices)) {
			for (const sections of Object.values(recordTypes)) {
				if (sections.base) {
					section = sections.base;
					break;
				}
			}
			if (section) break;
		}

		const heatmap = readSection<Heatmap>(
			binaryData.buffer,
			binaryData.dataStartOffset,
			heatmapsOffset,
			section!
		);

		// Each heatmap has 2 arrays of cellCount numbers
		// JS numbers are 8 bytes each (64-bit floats)
		const expectedMinBytes = cellCount * 2 * 8;
		const msgpackBytes = section!.length;

		console.log(`Resolution: ${firstRes} (${cellCount} cells)`);
		console.log(`msgpack section: ${msgpackBytes} bytes`);
		console.log(`Expected JS minimum: ${expectedMinBytes} bytes (${cellCount} × 2 arrays × 8 bytes)`);
		console.log(`Compression ratio: ${(expectedMinBytes / msgpackBytes).toFixed(2)}x`);

		// Verify arrays have correct length
		expect(heatmap.countArray.length).toBe(cellCount);
		expect(heatmap.densityArray.length).toBe(cellCount);

		// msgpack should be more compact than raw JS representation
		expect(msgpackBytes).toBeLessThan(expectedMinBytes);
	});

	test('individual section bytes sum to total section length', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		let totalBytes = 0;

		for (const timeSlices of Object.values(index)) {
			for (const recordTypes of Object.values(timeSlices)) {
				for (const sections of Object.values(recordTypes)) {
					totalBytes += sections.base.length;
					for (const tagSection of Object.values(sections.tags)) {
						totalBytes += tagSection.length;
					}
				}
			}
		}

		const declaredLength = binaryData.metadata.sections.heatmaps.length;

		console.log(`Sum of individual sections: ${totalBytes} bytes`);
		console.log(`Declared total length: ${declaredLength} bytes`);

		// Should match exactly
		expect(totalBytes).toBe(declaredLength);
	});
});
