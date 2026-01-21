// src/tests/sparseHeatmapValidation.test.ts - Validate sparse heatmap format in v4.0.0 binary

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

describe('Sparse Heatmap Validation (v4.0.0)', () => {
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
		console.log(`Binary version: ${metadata.version}`);
	});

	test('binary version is 4.0.0', () => {
		expect(binaryData.metadata.version).toBe('4.0.0');
	});

	test('all heatmaps have sparse structure', () => {
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

					// Validate sparse structure exists
					expect(baseHeatmap.indices).toBeDefined();
					expect(baseHeatmap.counts).toBeDefined();
					expect(baseHeatmap.densities).toBeDefined();
					expect(baseHeatmap.dimensions).toBeDefined();

					// Validate dimensions
					expect(baseHeatmap.dimensions.rows).toBeGreaterThan(0);
					expect(baseHeatmap.dimensions.cols).toBeGreaterThan(0);

					// Validate arrays are actually arrays
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

						expect(tagHeatmap.indices).toBeDefined();
						expect(tagHeatmap.counts).toBeDefined();
						expect(tagHeatmap.densities).toBeDefined();
						expect(tagHeatmap.dimensions).toBeDefined();
						sectionsChecked++;
					}
				}
			}
		}

		console.log(`✅ Validated sparse structure in ${sectionsChecked} heatmap sections`);
		expect(sectionsChecked).toBeGreaterThan(0);
	});

	test('sparse arrays have consistent lengths', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;
		let inconsistentSections = 0;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const baseHeatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);

					// All three arrays must have same length
					const indicesLen = baseHeatmap.indices.length;
					const countsLen = baseHeatmap.counts.length;
					const densitiesLen = baseHeatmap.densities.length;

					if (indicesLen !== countsLen || countsLen !== densitiesLen) {
						inconsistentSections++;
						console.error(`Inconsistent lengths in ${resKey}/${tsKey}/${rtKey}: indices=${indicesLen}, counts=${countsLen}, densities=${densitiesLen}`);
					}

					expect(indicesLen).toBe(countsLen);
					expect(countsLen).toBe(densitiesLen);

					// Check tag heatmaps
					for (const [tagKey, tagSection] of Object.entries(sections.tags)) {
						const tagHeatmap = readSection<Heatmap>(
							binaryData.buffer,
							binaryData.dataStartOffset,
							heatmapsOffset,
							tagSection
						);

						const tagIndicesLen = tagHeatmap.indices.length;
						const tagCountsLen = tagHeatmap.counts.length;
						const tagDensitiesLen = tagHeatmap.densities.length;

						if (tagIndicesLen !== tagCountsLen || tagCountsLen !== tagDensitiesLen) {
							inconsistentSections++;
						}

						expect(tagIndicesLen).toBe(tagCountsLen);
						expect(tagCountsLen).toBe(tagDensitiesLen);
					}
				}
			}
		}

		expect(inconsistentSections).toBe(0);
	});

	test('sparse heatmaps actually contain data (not empty)', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;
		let emptyCount = 0;
		let nonEmptyCount = 0;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const baseHeatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);

					if (baseHeatmap.indices.length === 0) {
						emptyCount++;
					} else {
						nonEmptyCount++;
					}
				}
			}
		}

		console.log(`Empty heatmaps: ${emptyCount}`);
		console.log(`Non-empty heatmaps: ${nonEmptyCount}`);

		// At least some heatmaps should have data
		expect(nonEmptyCount).toBeGreaterThan(0);
	});

	test('cell indices are valid for grid dimensions', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;
		let invalidIndices = 0;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			const [cols, rows] = resKey.split('x').map(Number);
			const maxIndex = rows * cols - 1; // 0-indexed

			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const baseHeatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);

					// Verify dimensions match resolution
					expect(baseHeatmap.dimensions.rows).toBe(rows);
					expect(baseHeatmap.dimensions.cols).toBe(cols);

					// Check all indices are within valid range
					for (const idx of baseHeatmap.indices) {
						if (idx < 0 || idx > maxIndex) {
							invalidIndices++;
							console.error(`Invalid index ${idx} in ${resKey}/${tsKey}/${rtKey} (max: ${maxIndex})`);
						}
						expect(idx).toBeGreaterThanOrEqual(0);
						expect(idx).toBeLessThanOrEqual(maxIndex);
					}
				}
			}
		}

		expect(invalidIndices).toBe(0);
	});

	test('all counts are positive (non-zero)', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;
		let zeroCountFound = 0;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const baseHeatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);

					// In sparse format, ALL counts should be > 0
					for (const count of baseHeatmap.counts) {
						if (count <= 0) {
							zeroCountFound++;
						}
						expect(count).toBeGreaterThan(0);
					}
				}
			}
		}

		expect(zeroCountFound).toBe(0);
	});

	test('all densities are in valid range [0, 1]', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;
		let invalidDensities = 0;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const baseHeatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);

					for (const density of baseHeatmap.densities) {
						if (density < 0 || density > 1) {
							invalidDensities++;
						}
						expect(density).toBeGreaterThanOrEqual(0);
						expect(density).toBeLessThanOrEqual(1);
					}
				}
			}
		}

		expect(invalidDensities).toBe(0);
	});

	test('sparse format achieves significant compression vs dense', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;

		// Get first resolution
		const firstRes = Object.keys(index)[0];
		const [cols, rows] = firstRes.split('x').map(Number);
		const totalCells = rows * cols;

		// Find first non-empty section
		let section: SectionIndex | null = null;
		let heatmap: Heatmap | null = null;

		outer: for (const timeSlices of Object.values(index[firstRes])) {
			for (const sections of Object.values(timeSlices)) {
				if (sections.base) {
					section = sections.base;
					heatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);
					if (heatmap.indices.length > 0) {
						break outer;
					}
				}
			}
		}

		if (!heatmap || !section) {
			throw new Error('No valid heatmap found for compression test');
		}

		const nonZeroCount = heatmap.indices.length;
		const sparsity = ((totalCells - nonZeroCount) / totalCells * 100).toFixed(1);

		// Dense format would be: totalCells * 2 arrays * 8 bytes (Float64)
		const denseBytes = totalCells * 2 * 8;

		// Sparse msgpack section size
		const sparseBytes = section.length;

		const compressionRatio = (denseBytes / sparseBytes).toFixed(2);

		console.log(`Resolution: ${firstRes} (${totalCells} cells)`);
		console.log(`Non-zero cells: ${nonZeroCount} (${sparsity}% sparse)`);
		console.log(`Dense would be: ${denseBytes} bytes`);
		console.log(`Sparse msgpack: ${sparseBytes} bytes`);
		console.log(`Compression ratio: ${compressionRatio}x`);

		// Sparse should be significantly smaller than dense
		expect(sparseBytes).toBeLessThan(denseBytes);

		// Non-zero count should be less than total (proving sparsity)
		expect(nonZeroCount).toBeLessThan(totalCells);
	});

	test('calculate average sparsity across all heatmaps', () => {
		const index = binaryData.metadata.sections.heatmaps.index;
		const heatmapsOffset = binaryData.metadata.sections.heatmaps.offset;

		const sparsityStats: { resolution: string; sparsity: number }[] = [];

		for (const [resKey, timeSlices] of Object.entries(index)) {
			const [cols, rows] = resKey.split('x').map(Number);
			const totalCells = rows * cols;
			let totalNonZero = 0;
			let sectionCount = 0;

			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const baseHeatmap = readSection<Heatmap>(
						binaryData.buffer,
						binaryData.dataStartOffset,
						heatmapsOffset,
						sections.base
					);

					totalNonZero += baseHeatmap.indices.length;
					sectionCount++;
				}
			}

			const avgNonZero = totalNonZero / sectionCount;
			const sparsity = ((totalCells - avgNonZero) / totalCells) * 100;

			sparsityStats.push({ resolution: resKey, sparsity });

			console.log(`${resKey}: ${sparsity.toFixed(1)}% sparse (avg ${avgNonZero.toFixed(0)} non-zero cells per heatmap)`);
		}

		// At least one resolution should show good sparsity
		const maxSparsity = Math.max(...sparsityStats.map(s => s.sparsity));
		expect(maxSparsity).toBeGreaterThan(10); // At least 10% sparse
	});

	test('sparse heatmaps section is compact', () => {
		const totalBinarySize = binaryData.buffer.byteLength;
		const heatmapsSize = binaryData.metadata.sections.heatmaps.length;
		const histogramsSize = binaryData.metadata.sections.histograms.length;
		const metadataSize = binaryData.dataStartOffset - 4;

		console.log(`Total binary: ${(totalBinarySize / 1024 / 1024).toFixed(2)} MB`);
		console.log(`Metadata: ${(metadataSize / 1024).toFixed(2)} KB (includes blueprint)`);
		console.log(`Heatmaps section: ${(heatmapsSize / 1024).toFixed(2)} KB`);
		console.log(`Histograms section: ${(histogramsSize / 1024).toFixed(2)} KB`);

		// Verify sections are reasonable size
		expect(heatmapsSize).toBeGreaterThan(0);
		expect(histogramsSize).toBeGreaterThan(0);

		// Heatmaps section should be compact due to sparse format
		// With 2442 sections averaging ~363 bytes each
		const avgSectionSize = heatmapsSize / 2442;
		console.log(`Average heatmap section size: ${avgSectionSize.toFixed(0)} bytes`);

		// Average section should be small (sparse format)
		expect(avgSectionSize).toBeLessThan(1000); // Less than 1KB per section on average
	});
});
