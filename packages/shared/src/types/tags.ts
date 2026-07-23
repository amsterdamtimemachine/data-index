import type { RecordType } from './feature';

/**
 * Tag with aggregated statistics
 */
export interface TagStats {
  name: string;
  totalFeatures: number;
  recordTypes: RecordType[];
}

/**
 * Simple tag stats (without recordTypes breakdown)
 */
export interface SimpleTagStats {
  name: string;
  totalFeatures: number;
}

/**
 * Available tags response
 */
export interface AvailableTags {
  tags: TagStats[];
  recordTypes: RecordType[];
}

/**
 * Tag combinations response
 */
export interface TagCombinations {
  availableTags: SimpleTagStats[];
  currentSelection: string[];
  recordTypes: RecordType[];
}

/**
 * Tag validation result
 */
export interface TagValidation {
  validTags: string[];
  invalidTags: string[];
}