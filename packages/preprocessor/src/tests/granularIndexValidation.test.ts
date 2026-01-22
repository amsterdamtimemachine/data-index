// src/tests/granularIndexValidation.test.ts - Validate v3.0.0 granular binary index structure

import { describe, test, expect, beforeAll } from 'bun:test';
import { decode } from '@msgpack/msgpack';
import type {
	VisualizationMetadata,
	Heatmap,
	Histogram,
	SectionIndex,
	HeatmapIndex,
	HistogramIndex
} from '@atm/shared/types';

const OUTPUT_PATH = process.env.OUTPUT_PATH;

interface BinaryData {
	metadata: VisualizationMetadata;
	buffer: ArrayBuffer;
	dataStartOffset: number;
}

let binaryData: BinaryData;

// Helper to read a section from the binary
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

describe('Granular Index Validation (v3.0.0)', () => {
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

		console.log(`Loaded binary v${metadata.version}`);
		console.log(`Heatmaps section: ${metadata.sections.heatmaps.length} bytes`);
		console.log(`Histograms section: ${metadata.sections.histograms.length} bytes`);
	});

	test('binary version is 5.0.0', () => {
		expect(binaryData.metadata.version).toBe('5.0.0');
	});

	test('heatmap index exists and has correct structure', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		expect(index).toBeDefined();
		expect(Object.keys(index).length).toBeGreaterThan(0);

		// Check structure: resolution -> timeSlice -> recordType -> { base, tags }
		for (const [resKey, timeSlices] of Object.entries(index)) {
			expect(resKey).toMatch(/^\d+x\d+$/); // e.g., "50x50"

			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				expect(tsKey).toBeDefined();

				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					expect(sections.base).toBeDefined();
					expect(sections.base.offset).toBeGreaterThanOrEqual(0);
					expect(sections.base.length).toBeGreaterThan(0);
					expect(sections.tags).toBeDefined();
				}
			}
		}
	});

	test('histogram index exists and has correct structure', () => {
		const index = binaryData.metadata.sections.histograms.index;
		expect(index).toBeDefined();
		expect(Object.keys(index).length).toBeGreaterThan(0);

		// Check structure: recordType -> { base, tags }
		for (const [rtKey, sections] of Object.entries(index)) {
			expect(sections.base).toBeDefined();
			expect(sections.base.offset).toBeGreaterThanOrEqual(0);
			expect(sections.base.length).toBeGreaterThan(0);
			expect(sections.tags).toBeDefined();
		}
	});

	test('all heatmap index offsets point to valid msgpack data', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;
		let sectionsChecked = 0;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					// Check base heatmap
					const baseHeatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);

					expect(baseHeatmap).toBeDefined();
					expect(baseHeatmap.indices).toBeDefined();
					expect(baseHeatmap.counts).toBeDefined();
					expect(baseHeatmap.densities).toBeDefined();
					expect(baseHeatmap.dimensions).toBeDefined();
					expect(Array.isArray(baseHeatmap.indices) || ArrayBuffer.isView(baseHeatmap.indices)).toBe(true);
					expect(Array.isArray(baseHeatmap.counts) || ArrayBuffer.isView(baseHeatmap.counts)).toBe(true);
					expect(Array.isArray(baseHeatmap.densities) || ArrayBuffer.isView(baseHeatmap.densities)).toBe(true);
					sectionsChecked++;

					// Check tag heatmaps
					for (const [tagKey, tagSection] of Object.entries(sections.tags)) {
						const tagHeatmap = readSection<Heatmap>(
							binaryData.buffer,
							binaryData.dataStartOffset,
							heatmapsOffset,
							tagSection
						);

						expect(tagHeatmap).toBeDefined();
						expect(tagHeatmap.indices).toBeDefined();
						expect(tagHeatmap.counts).toBeDefined();
						expect(tagHeatmap.densities).toBeDefined();
						expect(tagHeatmap.dimensions).toBeDefined();
						sectionsChecked++;
					}
				}
			}
		}

		console.log(`✅ Validated ${sectionsChecked} heatmap sections`);
	});

	test('all histogram index offsets point to valid msgpack data', () => {
		const index = binaryData.metadata.sections.histograms.index;
		const histogramsOffset = binaryData.metadata.sections.histograms.offset;
		let sectionsChecked = 0;

		for (const [rtKey, sections] of Object.entries(index)) {
			// Check base histogram
			const baseHistogram = readSection<Histogram>(
				binaryData.buffer,
				binaryData.dataStartOffset,
				histogramsOffset,
				sections.base
			);

			expect(baseHistogram).toBeDefined();
			expect(baseHistogram.bins).toBeDefined();
			expect(baseHistogram.totalFeatures).toBeDefined();
			expect(baseHistogram.maxCount).toBeDefined();
			sectionsChecked++;

			// Check tag histograms
			for (const [tagKey, tagSection] of Object.entries(sections.tags)) {
				const tagHistogram = readSection<Histogram>(
					binaryData.buffer,
					binaryData.dataStartOffset,
					histogramsOffset,
					tagSection
				);

				expect(tagHistogram).toBeDefined();
				expect(tagHistogram.bins).toBeDefined();
				sectionsChecked++;
			}
		}

		console.log(`✅ Validated ${sectionsChecked} histogram sections`);
	});

	test('heatmap sections do not overlap', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const sections: Array<{ key: string; offset: number; length: number }> = [];

		// Collect all sections
		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sectionData] of Object.entries(recordTypes)) {
					sections.push({
						key: `${resKey}/${tsKey}/${rtKey}/base`,
						offset: sectionData.base.offset,
						length: sectionData.base.length
					});

					for (const [tagKey, tagSection] of Object.entries(sectionData.tags)) {
						sections.push({
							key: `${resKey}/${tsKey}/${rtKey}/${tagKey}`,
							offset: tagSection.offset,
							length: tagSection.length
						});
					}
				}
			}
		}

		// Sort by offset
		sections.sort((a, b) => a.offset - b.offset);

		// Check for overlaps
		for (let i = 1; i < sections.length; i++) {
			const prev = sections[i - 1];
			const curr = sections[i];
			const prevEnd = prev.offset + prev.length;

			expect(curr.offset).toBeGreaterThanOrEqual(prevEnd);
		}

		console.log(`✅ No overlaps in ${sections.length} heatmap sections`);
	});

	test('histogram sections do not overlap', () => {
		const index = binaryData.metadata.sections.histograms.index;
		const sections: Array<{ key: string; offset: number; length: number }> = [];

		// Collect all sections
		for (const [rtKey, sectionData] of Object.entries(index)) {
			sections.push({
				key: `${rtKey}/base`,
				offset: sectionData.base.offset,
				length: sectionData.base.length
			});

			for (const [tagKey, tagSection] of Object.entries(sectionData.tags)) {
				sections.push({
					key: `${rtKey}/${tagKey}`,
					offset: tagSection.offset,
					length: tagSection.length
				});
			}
		}

		// Sort by offset
		sections.sort((a, b) => a.offset - b.offset);

		// Check for overlaps
		for (let i = 1; i < sections.length; i++) {
			const prev = sections[i - 1];
			const curr = sections[i];
			const prevEnd = prev.offset + prev.length;

			expect(curr.offset).toBeGreaterThanOrEqual(prevEnd);
		}

		console.log(`✅ No overlaps in ${sections.length} histogram sections`);
	});

	test('total heatmap sections length matches declared length', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		let maxEnd = 0;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const baseEnd = sections.base.offset + sections.base.length;
					maxEnd = Math.max(maxEnd, baseEnd);

					for (const [tagKey, tagSection] of Object.entries(sections.tags)) {
						const tagEnd = tagSection.offset + tagSection.length;
						maxEnd = Math.max(maxEnd, tagEnd);
					}
				}
			}
		}

		expect(maxEnd).toBeLessThanOrEqual(binaryData.metadata.sections.heatmaps.length);
		console.log(`✅ Heatmap sections use ${maxEnd} of ${binaryData.metadata.sections.heatmaps.length} declared bytes`);
	});

	test('total histogram sections length matches declared length', () => {
		const index = binaryData.metadata.sections.histograms.index;
		let maxEnd = 0;

		for (const [rtKey, sections] of Object.entries(index)) {
			const baseEnd = sections.base.offset + sections.base.length;
			maxEnd = Math.max(maxEnd, baseEnd);

			for (const [tagKey, tagSection] of Object.entries(sections.tags)) {
				const tagEnd = tagSection.offset + tagSection.length;
				maxEnd = Math.max(maxEnd, tagEnd);
			}
		}

		expect(maxEnd).toBeLessThanOrEqual(binaryData.metadata.sections.histograms.length);
		console.log(`✅ Histogram sections use ${maxEnd} of ${binaryData.metadata.sections.histograms.length} declared bytes`);
	});

	test('heatmap array sizes match resolution dimensions', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			// Parse resolution
			const [cols, rows] = resKey.split('x').map(Number);
			const expectedSize = cols * rows;

			// Find first valid heatmap in this resolution
			let section: SectionIndex | null = null;
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sectionData] of Object.entries(recordTypes)) {
					if (sectionData?.base) {
						section = sectionData.base;
						break;
					}
				}
				if (section) break;
			}

			if (!section) {
				console.warn(`No heatmap found for resolution ${resKey}`);
				continue;
			}

			const heatmap = readSection<Heatmap>(
				binaryData.buffer,
				binaryData.dataStartOffset,
				heatmapsOffset,
				section
			);

			// Verify dimensions match resolution
			expect(heatmap.dimensions.rows).toBe(rows);
			expect(heatmap.dimensions.cols).toBe(cols);

			// Verify all arrays have same length (sparse consistency)
			const nonZeroCount = heatmap.indices.length;
			expect(heatmap.counts.length).toBe(nonZeroCount);
			expect(heatmap.densities.length).toBe(nonZeroCount);

			// Sparse heatmap should have fewer cells than total grid
			expect(nonZeroCount).toBeLessThanOrEqual(expectedSize);
			expect(nonZeroCount).toBeGreaterThan(0); // Should have some data
		}
	});

	test('metadata index matches actual data structure', () => {
		const heatmapIndex = binaryData.metadata.sections.heatmaps.index;
		const histogramIndex = binaryData.metadata.sections.histograms.index;

		// Check resolutions match metadata
		const indexResolutions = Object.keys(heatmapIndex);
		const metadataResolutions = binaryData.metadata.resolutions.map(
			(r) => `${r.cols}x${r.rows}`
		);
		expect(indexResolutions.sort()).toEqual(metadataResolutions.sort());

		// Check recordTypes in histogram index match metadata
		const indexRecordTypes = Object.keys(histogramIndex).sort();
		const metadataRecordTypes = [...binaryData.metadata.recordTypes].sort();
		expect(indexRecordTypes).toEqual(metadataRecordTypes);

		// Check timeSlices in heatmap index match metadata
		const firstRes = Object.values(heatmapIndex)[0];
		const indexTimeSlices = Object.keys(firstRes).sort();
		const metadataTimeSlices = binaryData.metadata.timeSlices.map((ts) => ts.key).sort();
		expect(indexTimeSlices).toEqual(metadataTimeSlices);
	});
});
