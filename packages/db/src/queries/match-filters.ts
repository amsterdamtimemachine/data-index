import { sql, type SQL } from 'drizzle-orm';
import type { MatchFilters } from '@atm/shared';
import { searchBitmap } from './feature-search';
import { tagBitmap } from './tag-filter';

/**
 * The one bitmap the cell_features aggregates intersect with: the search set,
 * the tag set, or their intersection. null when neither filter is active, so
 * countMatchesExpr falls back to the plain distinct count. rb_and is NULL-strict,
 * so an empty search or tag set still zeroes every count.
 */
export function matchBitmap(filters?: MatchFilters): SQL | null {
  let searchBm: SQL | null = null;
  if (filters?.searchQuery) {
    searchBm = searchBitmap(filters.searchQuery);
  }

  let tagBm: SQL | null = null;
  if (filters?.tags && filters.tags.length > 0) {
    tagBm = tagBitmap(filters.tags, filters.tagOperator ?? 'OR');
  }

  if (searchBm && tagBm) {
    return sql`rb_and(${searchBm}, ${tagBm})`;
  }
  if (searchBm) {
    return searchBm;
  }
  return tagBm;
}
