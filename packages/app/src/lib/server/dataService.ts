// src/lib/server/dataService.ts
import type {
	RecordType,
	HeatmapTimeline,
	HistogramApiResponse,
	HeatmapTimelineApiResponse
} from '@atm/shared/types';
import { VisualizationBinaryHandler } from './binaryHandler';

export class VisualizationDataService {
	private binaryHandler: VisualizationBinaryHandler;
	private initialized = false;

	constructor(binaryPath: string) {
		this.binaryHandler = new VisualizationBinaryHandler(binaryPath);
	}

	async initialize(): Promise<void> {
		if (!this.initialized) {
			await this.binaryHandler.initialize();
			this.initialized = true;
			console.log('✅ VisualizationDataService initialized');
		}
	}

	/**
	 * Get histogram for specific recordTypes and optional tags
	 * If no recordTypes provided, defaults to all available recordTypes
	 */
	async getHistogram(recordTypes?: RecordType[], tags?: string[]): Promise<HistogramApiResponse> {
		const startTime = Date.now();

		try {
			await this.initialize();

			// Default to all recordTypes if none provided
			let effectiveRecordTypes: RecordType[];
			if (!recordTypes || recordTypes.length === 0) {
				const metadata = this.binaryHandler.getMetadata();
				effectiveRecordTypes = metadata.recordTypes;
				console.log(
					`📊 No recordTypes specified, defaulting to all: ${effectiveRecordTypes.join(', ')}`
				);
			} else {
				effectiveRecordTypes = recordTypes;
			}

			console.log(`📊 Fetching histogram data for recordTypes: ${effectiveRecordTypes.join(', ')}`);
			if (tags && tags.length > 0) {
				console.log(`🏷️ With tags: ${tags.join(', ')}`);
			}

			const histograms = await this.binaryHandler.readHistograms();

			// Validate all recordTypes exist
			const missingTypes = effectiveRecordTypes.filter((type) => !histograms[type]);
			if (missingTypes.length > 0) {
				throw new Error(`RecordTypes "${missingTypes.join(', ')}" not found in histograms data`);
			}

			// Return raw histogram data for client-side merging
			const histogramData: { [key: string]: any } = {};

			for (const recordType of effectiveRecordTypes) {
				if (!tags || tags.length === 0) {
					// Include base histogram
					histogramData[recordType] = {
						base: histograms[recordType].base,
						tags: histograms[recordType].tags
					};
				} else if (tags.length === 1) {
					// Include specific tag histogram
					const tag = tags[0];
					const tagHistograms = histograms[recordType].tags;

					if (!tagHistograms[tag]) {
						// Tag doesn't exist - create empty histogram with same structure as base
						const baseHistogram = histograms[recordType].base;
						const emptyHistogram = {
							bins: baseHistogram.bins.map((bin) => ({
								timeSlice: bin.timeSlice,
								count: 0
							})),
							maxCount: 0,
							timeRange: baseHistogram.timeRange,
							totalFeatures: 0
						};

						histogramData[recordType] = {
							base: histograms[recordType].base,
							tags: { [tag]: emptyHistogram }
						};
					} else {
						histogramData[recordType] = {
							base: histograms[recordType].base,
							tags: { [tag]: tagHistograms[tag] }
						};
					}
				} else {
					// Multiple tags - use combination key
					const comboKey = tags.sort().join('+');
					const tagHistograms = histograms[recordType].tags;

					if (!tagHistograms[comboKey]) {
						// Combination doesn't exist - create empty histogram with same structure as base
						const baseHistogram = histograms[recordType].base;
						const emptyHistogram = {
							bins: baseHistogram.bins.map((bin) => ({
								timeSlice: bin.timeSlice,
								count: 0
							})),
							maxCount: 0,
							timeRange: baseHistogram.timeRange,
							totalFeatures: 0
						};

						histogramData[recordType] = {
							base: histograms[recordType].base,
							tags: { [comboKey]: emptyHistogram }
						};
					} else {
						histogramData[recordType] = {
							base: histograms[recordType].base,
							tags: { [comboKey]: tagHistograms[comboKey] }
						};
					}
				}
			}

			console.log(`📊 Returning raw histogram data for ${effectiveRecordTypes.length} recordTypes`);

			const processingTime = Date.now() - startTime;

			return {
				histograms: this.binaryHandler.prepareForJsonResponse(histogramData),
				recordTypes: effectiveRecordTypes,
				tags,
				success: true,
				processingTime
			};
		} catch (error) {
			const processingTime = Date.now() - startTime;
			console.error(`❌ Failed to get histogram:`, error);

			return {
				histograms: {},
				recordTypes: recordTypes || [],
				tags,
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error',
				processingTime
			};
		}
	}

	/**
	 * Get HeatmapTimeline for specific recordTypes and optional tags
	 * If no recordTypes provided, defaults to all available recordTypes
	 * Always returns all periods at single resolution (first available resolution)
	 * Uses granular reads (v3.0.0+) for memory efficiency when available
	 */
	async getHeatmapTimeline(
		recordTypes?: RecordType[],
		tags?: string[]
	): Promise<HeatmapTimelineApiResponse> {
		const startTime = Date.now();

		try {
			await this.initialize();

			const metadata = this.binaryHandler.getMetadata();

			// Default to all recordTypes if none provided
			let effectiveRecordTypes: RecordType[];
			if (!recordTypes || recordTypes.length === 0) {
				effectiveRecordTypes = metadata.recordTypes;
				console.log(
					`🔥 No recordTypes specified, defaulting to all: ${effectiveRecordTypes.join(', ')}`
				);
			} else {
				effectiveRecordTypes = recordTypes;
			}

			console.log(
				`🔥 Fetching heatmap timeline for recordTypes: ${effectiveRecordTypes.join(', ')}`
			);
			if (tags && tags.length > 0) {
				console.log(`🏷️ With tags: ${tags.join(', ')}`);
			}

			// Get resolution info
			const resolutionKey = `${metadata.resolutions[0].cols}x${metadata.resolutions[0].rows}`;
			const timeSliceKeys = metadata.timeSlices.map((ts) => ts.key);

			console.log(`📐 Using resolution: ${resolutionKey}`);
			console.log(`📅 Time periods: ${timeSliceKeys.length}`);

			// Determine which tag to filter by
			let tag: string | undefined;
			if (tags && tags.length === 1) {
				tag = tags[0];
			} else if (tags && tags.length > 1) {
				tag = tags.sort().join('+'); // Combination key
			}

			// Read only the sections we need (memory-efficient granular read)
			const resultTimeline = this.binaryHandler.readHeatmapsFiltered(
				resolutionKey,
				timeSliceKeys,
				effectiveRecordTypes,
				tag
			);

			console.log(`✅ Read complete: ${Object.keys(resultTimeline).length} periods`);

			const processingTime = Date.now() - startTime;

			return {
				heatmapTimeline: this.binaryHandler.prepareForJsonResponse(resultTimeline),
				recordTypes: effectiveRecordTypes,
				tags,
				resolution: resolutionKey,
				success: true,
				processingTime
			};
		} catch (error) {
			const processingTime = Date.now() - startTime;
			console.error(`❌ Failed to get heatmap timeline:`, error);

			return {
				heatmapTimeline: {},
				recordTypes: recordTypes || [],
				tags,
				resolution: '',
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error',
				processingTime
			};
		}
	}

	/**
	 * Get tags that have data for the specified recordTypes
	 * Returns individual tags (not combinations) with feature counts
	 */
	async getAvailableTags(recordTypes?: RecordType[]): Promise<{
		tags: Array<{ name: string; totalFeatures: number; recordTypes: RecordType[] }>;
		recordTypes: RecordType[];
		success: boolean;
		message?: string;
	}> {
		try {
			await this.initialize();

			// Default to all recordTypes if none provided
			let effectiveRecordTypes: RecordType[];
			if (!recordTypes || recordTypes.length === 0) {
				const metadata = this.binaryHandler.getMetadata();
				effectiveRecordTypes = metadata.recordTypes;
			} else {
				effectiveRecordTypes = recordTypes;
			}

			console.log(`🏷️ Getting available tags for recordTypes: ${effectiveRecordTypes.join(', ')}`);

			const histograms = await this.binaryHandler.readHistograms();

			// Track tags across all requested recordTypes
			const tagStats = new Map<string, { totalFeatures: number; recordTypes: Set<RecordType> }>();

			for (const recordType of effectiveRecordTypes) {
				const recordTypeData = histograms[recordType];
				if (!recordTypeData) continue;

				// Process all tags for this recordType
				for (const [tagKey, histogram] of Object.entries(recordTypeData.tags)) {
					// Skip combination tags (contain '+')
					if (tagKey.includes('+')) continue;

					// Initialize or update tag stats
					if (!tagStats.has(tagKey)) {
						tagStats.set(tagKey, { totalFeatures: 0, recordTypes: new Set() });
					}

					const stats = tagStats.get(tagKey)!;
					stats.totalFeatures += histogram.totalFeatures;
					stats.recordTypes.add(recordType);
				}
			}

			// Convert to response format, filter out zero-feature tags
			const availableTags = Array.from(tagStats.entries())
				.filter(([_, stats]) => stats.totalFeatures > 0)
				.map(([tagName, stats]) => ({
					name: tagName,
					totalFeatures: stats.totalFeatures,
					recordTypes: Array.from(stats.recordTypes).sort()
				}))
				.sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

			console.log(`✅ Found ${availableTags.length} available tags with data`);

			return {
				tags: availableTags,
				recordTypes: effectiveRecordTypes,
				success: true
			};
		} catch (error) {
			console.error(`❌ Failed to get available tags:`, error);
			return {
				tags: [],
				recordTypes: recordTypes || [],
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Validate a tag combination against precomputed data
	 * Returns which tags are valid and which are invalid
	 */
	async validateTagCombination(
		recordTypes?: RecordType[],
		selectedTags: string[] = []
	): Promise<{
		validTags: string[];
		invalidTags: string[];
		success: boolean;
		message?: string;
	}> {
		try {
			await this.initialize();

			// Default to all recordTypes if none provided
			let effectiveRecordTypes: RecordType[];
			if (!recordTypes || recordTypes.length === 0) {
				const metadata = this.binaryHandler.getMetadata();
				effectiveRecordTypes = metadata.recordTypes;
			} else {
				effectiveRecordTypes = recordTypes;
			}

			console.log(
				`🔍 Validating tag combination: ${selectedTags.join(', ')} for recordTypes: ${effectiveRecordTypes.join(', ')}`
			);

			// Single tags are always valid (they exist as individual tags)
			if (selectedTags.length <= 1) {
				return {
					validTags: selectedTags,
					invalidTags: [],
					success: true
				};
			}

			// Check if this exact combination exists in precomputed data
			const comboKey = selectedTags.sort().join('+');
			const histograms = await this.binaryHandler.readHistograms();

			let combinationExists = false;

			// Check if combination exists for any of the specified record types
			for (const recordType of effectiveRecordTypes) {
				const recordTypeData = histograms[recordType];
				if (recordTypeData?.tags[comboKey]) {
					combinationExists = true;
					console.log(`✅ Combination "${comboKey}" exists for recordType: ${recordType}`);
					break;
				}
			}

			if (combinationExists) {
				return {
					validTags: selectedTags,
					invalidTags: [],
					success: true
				};
			} else {
				console.log(`❌ Combination "${comboKey}" does not exist in precomputed data`);

				return {
					validTags: [],
					invalidTags: selectedTags,
					success: true
				};
			}
		} catch (error) {
			console.error(`❌ Failed to validate tag combination:`, error);
			return {
				validTags: [],
				invalidTags: selectedTags,
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Get tag combinations that extend the current selection
	 * Returns tags that can be added to form valid combinations
	 */
	async getTagCombinations(
		recordTypes?: RecordType[],
		selectedTags: string[] = []
	): Promise<{
		availableTags: Array<{ name: string; totalFeatures: number }>;
		currentSelection: string[];
		recordTypes: RecordType[];
		success: boolean;
		message?: string;
	}> {
		try {
			await this.initialize();

			// Default to all recordTypes if none provided
			let effectiveRecordTypes: RecordType[];
			if (!recordTypes || recordTypes.length === 0) {
				const metadata = this.binaryHandler.getMetadata();
				effectiveRecordTypes = metadata.recordTypes;
			} else {
				effectiveRecordTypes = recordTypes;
			}

			console.log(
				`🔗 Getting tag combinations for recordTypes: ${effectiveRecordTypes.join(', ')}, selected: ${selectedTags.join(', ')}`
			);

			const histograms = await this.binaryHandler.readHistograms();

			// Track available next tags with their feature counts
			const nextTagStats = new Map<string, number>();

			for (const recordType of effectiveRecordTypes) {
				const recordTypeData = histograms[recordType];
				if (!recordTypeData) continue;

				const tagKeys = Object.keys(recordTypeData.tags);

				if (selectedTags.length === 0) {
					// No selection - return all individual tags (same as available-tags but with structure)
					for (const tagKey of tagKeys) {
						if (tagKey.includes('+')) continue; // Skip combinations

						const histogram = recordTypeData.tags[tagKey];
						const currentCount = nextTagStats.get(tagKey) || 0;
						nextTagStats.set(tagKey, currentCount + histogram.totalFeatures);
					}
				} else {
					// Find combinations that extend current selection
					const validCombinations = tagKeys.filter((key) => {
						if (!key.includes('+')) return false; // Must be a combination

						const keyTags = key.split('+').sort();

						// Check if combination contains all selected tags and exactly one more
						const hasAllSelected = selectedTags.every((tag) => keyTags.includes(tag));
						const isNextLevel = keyTags.length === selectedTags.length + 1;

						return hasAllSelected && isNextLevel;
					});

					// Extract the "next" tags from valid combinations
					for (const combo of validCombinations) {
						const comboTags = combo.split('+');
						const nextTags = comboTags.filter((tag) => !selectedTags.includes(tag));

						for (const nextTag of nextTags) {
							const histogram = recordTypeData.tags[combo];
							const currentCount = nextTagStats.get(nextTag) || 0;
							nextTagStats.set(nextTag, currentCount + histogram.totalFeatures);
						}
					}
				}
			}

			// Convert to response format
			const availableTags = Array.from(nextTagStats.entries())
				.filter(([_, count]) => count > 0)
				.map(([tagName, totalFeatures]) => ({
					name: tagName,
					totalFeatures
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			console.log(`✅ Found ${availableTags.length} available next tags for current selection`);

			return {
				availableTags,
				currentSelection: selectedTags,
				recordTypes: effectiveRecordTypes,
				success: true
			};
		} catch (error) {
			console.error(`❌ Failed to get tag combinations:`, error);
			return {
				availableTags: [],
				currentSelection: selectedTags,
				recordTypes: recordTypes || [],
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Get available metadata for the client
	 */
	async getVisualizationMetadata() {
		await this.initialize();
		const metadata = this.binaryHandler.getMetadata();

		// Return relevant metadata for the client
		return {
			timeSlices: metadata.timeSlices,
			timeRange: metadata.timeRange,
			recordTypes: metadata.recordTypes,
			tags: metadata.tags,
			resolutions: metadata.resolutions,
			heatmapDimensions: metadata.heatmapDimensions,
			stats: metadata.stats
		};
	}
}
