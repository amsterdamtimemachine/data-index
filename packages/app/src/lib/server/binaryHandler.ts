// src/lib/server/binary-handler.ts
import { decode } from '@msgpack/msgpack';
import type {
	VisualizationMetadata,
	HeatmapResolutions,
	Histograms,
	Heatmap,
	HeatmapTimeline,
	Histogram,
	RecordType
} from '@atm/shared/types';

export class VisualizationBinaryHandler {
	private binaryBuffer: ArrayBufferLike | null = null;
	private metadata: VisualizationMetadata | null = null;
	private dataStartOffset: number = 0;

	constructor(private binaryPath: string) {}

	async initialize(): Promise<void> {
		try {
			if (!this.binaryBuffer) {
				console.log('🔥 Opening binary file with memory mapping...');

				// Check if we're in Bun or Node.js environment
				let buffer: ArrayBufferLike;
				if (typeof Bun !== 'undefined') {
					// Bun environment - use memory mapping
					const mmap = Bun.mmap(this.binaryPath);
					buffer = mmap.buffer as ArrayBufferLike;
				} else {
					// Node.js environment - fallback to fs.readFile
					const fs = await import('fs/promises');
					const fileBuffer = await fs.readFile(this.binaryPath);
					buffer = fileBuffer.buffer.slice(
						fileBuffer.byteOffset,
						fileBuffer.byteOffset + fileBuffer.byteLength
					);
				}

				this.binaryBuffer = buffer;

				console.log(`📊 Buffer size: ${buffer.byteLength} bytes`);

				if (buffer.byteLength < 4) {
					throw new Error('Binary file too small - missing metadata size');
				}

				// Read metadata size
				const dataView = new DataView(buffer);
				const metadataSize = dataView.getUint32(0, false);
				console.log(`📋 Metadata size: ${metadataSize} bytes`);

				if (buffer.byteLength < 4 + metadataSize) {
					throw new Error(
						`Binary file truncated. Expected ${4 + metadataSize} bytes, got ${buffer.byteLength}`
					);
				}

				// Decode metadata
				try {
					const metadataBytes = new Uint8Array(buffer, 4, metadataSize);
					const metadata = decode(metadataBytes) as VisualizationMetadata;

					this.metadata = metadata;
					this.dataStartOffset = 4 + metadataSize;

					console.log('✅ Successfully decoded metadata');
					console.log(`📊 Version: ${metadata.version}`);
					console.log(`🕒 TimeSlices: ${metadata.timeSlices.length}`);
					console.log(`📈 RecordTypes: ${metadata.recordTypes.join(', ')}`);
					console.log(`🏷️ Tags: ${metadata.tags.length}`);
					console.log(`📐 Resolutions: ${metadata.resolutions.length}`);
				} catch (error) {
					console.error('❌ Failed to decode metadata:', error);
					throw error;
				}
			}
		} catch (error) {
			console.error('❌ Failed to initialize binary data:', error);
			throw error;
		}
	}

	getMetadata(): VisualizationMetadata {
		if (!this.metadata) {
			throw new Error('Metadata not initialized');
		}
		return this.metadata;
	}

	/**
	 * Read all heatmaps - reconstructs from granular sections
	 * Prefer readHeatmapsFiltered() for memory efficiency
	 */
	async readHeatmaps(): Promise<HeatmapResolutions> {
		if (!this.binaryBuffer || !this.metadata) {
			throw new Error('Binary handler not initialized');
		}

		const result: HeatmapResolutions = {};
		const index = this.metadata.sections.heatmaps.index;

		for (const [resKey, timeSlices] of Object.entries(index)) {
			result[resKey] = {};

			for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
				result[resKey][tsKey] = {} as any;

				for (const [rtKey, sections] of Object.entries(recordTypes)) {
					const base = this.readHeatmap(resKey, tsKey, rtKey);
					result[resKey][tsKey][rtKey as RecordType] = { base, tags: {} };

					for (const tagKey of Object.keys(sections.tags)) {
						result[resKey][tsKey][rtKey as RecordType].tags[tagKey] =
							this.readHeatmap(resKey, tsKey, rtKey, tagKey);
					}
				}
			}
		}

		return result;
	}

	/**
	 * Read all histograms - reconstructs from granular sections
	 * Prefer readHistogramsFiltered() for memory efficiency
	 */
	async readHistograms(): Promise<Histograms> {
		if (!this.binaryBuffer || !this.metadata) {
			throw new Error('Binary handler not initialized');
		}

		const result: Histograms = {};
		const index = this.metadata.sections.histograms.index;

		for (const [rtKey, sections] of Object.entries(index)) {
			const base = this.readHistogram(rtKey);
			result[rtKey] = { base, tags: {} };

			for (const tagKey of Object.keys(sections.tags)) {
				result[rtKey].tags[tagKey] = this.readHistogram(rtKey, tagKey);
			}
		}

		return result;
	}

	/**
	 * Read a single heatmap by exact path (resolution/timeSlice/recordType/tag)
	 * Only decodes the specific section needed - true mmap efficiency
	 */
	readHeatmap(
		resolution: string,
		timeSlice: string,
		recordType: string,
		tag?: string
	): Heatmap {
		if (!this.binaryBuffer || !this.metadata) {
			throw new Error('Binary handler not initialized');
		}

		const index = this.metadata.sections.heatmaps.index;
		if (!index || !index[resolution]?.[timeSlice]?.[recordType]) {
			throw new Error(
				`Heatmap not found: ${resolution}/${timeSlice}/${recordType}${tag ? `/${tag}` : ''}`
			);
		}

		const section = tag
			? index[resolution][timeSlice][recordType].tags[tag]
			: index[resolution][timeSlice][recordType].base;

		if (!section) {
			throw new Error(
				`Heatmap section not found: ${resolution}/${timeSlice}/${recordType}${tag ? `/${tag}` : ''}`
			);
		}

		const bytes = new Uint8Array(
			this.binaryBuffer,
			this.dataStartOffset + this.metadata.sections.heatmaps.offset + section.offset,
			section.length
		);

		return decode(bytes) as Heatmap;
	}

	/**
	 * Read heatmaps for specific recordTypes and timeSlices
	 * Much more memory efficient than readHeatmaps() for filtered requests
	 */
	readHeatmapsFiltered(
		resolution: string,
		timeSlices: string[],
		recordTypes: string[],
		tag?: string
	): HeatmapTimeline {
		if (!this.binaryBuffer || !this.metadata) {
			throw new Error('Binary handler not initialized');
		}

		const timeline: HeatmapTimeline = {};

		for (const ts of timeSlices) {
			timeline[ts] = {} as any;

			for (const rt of recordTypes) {
				try {
					const base = this.readHeatmap(resolution, ts, rt);
					timeline[ts][rt as RecordType] = { base, tags: {} };

					if (tag) {
						try {
							const tagHeatmap = this.readHeatmap(resolution, ts, rt, tag);
							timeline[ts][rt as RecordType].tags[tag] = tagHeatmap;
						} catch {
							// Tag doesn't exist for this recordType/timeSlice - use empty heatmap
							timeline[ts][rt as RecordType].tags[tag] = {
								countArray: new Array(base.countArray.length).fill(0),
								densityArray: new Array(base.densityArray.length).fill(0)
							};
						}
					}
				} catch {
					// RecordType doesn't exist for this timeSlice - skip
					console.warn(`Skipping missing heatmap: ${resolution}/${ts}/${rt}`);
				}
			}
		}

		return timeline;
	}

	/**
	 * Read a single histogram by recordType and optional tag
	 */
	readHistogram(recordType: string, tag?: string): Histogram {
		if (!this.binaryBuffer || !this.metadata) {
			throw new Error('Binary handler not initialized');
		}

		const index = this.metadata.sections.histograms.index;
		if (!index || !index[recordType]) {
			throw new Error(`Histogram not found for recordType: ${recordType}`);
		}

		const section = tag ? index[recordType].tags[tag] : index[recordType].base;

		if (!section) {
			throw new Error(
				`Histogram section not found: ${recordType}${tag ? `/${tag}` : ''}`
			);
		}

		const bytes = new Uint8Array(
			this.binaryBuffer,
			this.dataStartOffset + this.metadata.sections.histograms.offset + section.offset,
			section.length
		);

		return decode(bytes) as Histogram;
	}

	/**
	 * Read histograms for specific recordTypes
	 */
	readHistogramsFiltered(recordTypes: string[], tags?: string[]): Histograms {
		if (!this.binaryBuffer || !this.metadata) {
			throw new Error('Binary handler not initialized');
		}

		const histograms: Histograms = {};

		for (const rt of recordTypes) {
			try {
				const base = this.readHistogram(rt);
				histograms[rt] = { base, tags: {} };

				if (tags) {
					for (const tag of tags) {
						try {
							histograms[rt].tags[tag] = this.readHistogram(rt, tag);
						} catch {
							// Tag doesn't exist - skip
						}
					}
				}
			} catch {
				console.warn(`Skipping missing histogram for recordType: ${rt}`);
			}
		}

		return histograms;
	}

	/**
	 * Convert TypedArrays to regular arrays for JSON serialization
	 */
	private convertTypedArraysForSerialization(data: any): any {
		if (data && typeof data === 'object') {
			if (
				data.constructor &&
				data.constructor.name.includes('Array') &&
				data.constructor !== Array
			) {
				return Array.from(data);
			}

			if (Array.isArray(data)) {
				return data.map((item) => this.convertTypedArraysForSerialization(item));
			}

			const result: any = {};
			for (const [key, value] of Object.entries(data)) {
				result[key] = this.convertTypedArraysForSerialization(value);
			}
			return result;
		}

		return data;
	}

	/**
	 * Prepare data for JSON response by converting TypedArrays
	 */
	prepareForJsonResponse(data: any): any {
		return this.convertTypedArraysForSerialization(data);
	}
}
