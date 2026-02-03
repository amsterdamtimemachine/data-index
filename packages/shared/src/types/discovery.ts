import type { RecordType, MinimalFeature } from './feature';
import type { SpatialChunk } from './streaming';

/**
 * Vocabulary tracking for discovered recordTypes and tags
 */
export interface VocabularyTracker {
  recordTypes: Set<RecordType>;
  tags: Set<string>;
}

/**
 * Result from discovery streaming using minimal features
 */
export interface DiscoveryChunkResult {
  chunk: SpatialChunk;
  features: MinimalFeature[];
  stats: {
    totalRaw: number;
    validProcessed: number;
    invalidSkipped: number;
  };
  vocabulary: VocabularyTracker;
}
