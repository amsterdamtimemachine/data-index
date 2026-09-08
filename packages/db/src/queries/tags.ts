import { sql } from 'drizzle-orm';
import type { RecordType, PlaceType, AvailableTags } from '@atm/shared';
import { db } from '../client';
import { cellFeatures, tagFeatures } from '../schema';
import { getRecordTypes } from './record-types';
import { categoryFilter } from './cell-features';
import { searchBitmap } from './feature-search';

type TagCountRow = { tag_id: string; count: string };

/**
 * Every tag in the index with the number of features carrying it under the
 * category filters and an optional search term — the counts the filter panel
 * shows next to each tag. One query: the filtered population is a single union
 * over cell_features (the same aggregate the histogram total pays), and each
 * tag's count is that population intersected with its precomputed bitmap.
 */
export async function getAvailableTags(
  recordTypes?: RecordType[],
  datasetIds?: string[],
  placeTypes?: PlaceType[],
  searchQuery?: string
): Promise<AvailableTags> {
  const types = recordTypes || await getRecordTypes();
  if (types.length === 0) {
    return { tags: [] };
  }

  let population = sql`pop.bm`;
  if (searchQuery) {
    population = sql`rb_and(pop.bm, ${searchBitmap(searchQuery)})`;
  }

  const result = await db.execute<TagCountRow>(sql`
    WITH pop AS (
      SELECT rb_or_agg(${cellFeatures.featureIds}) AS bm
      FROM ${cellFeatures}
      WHERE ${categoryFilter(types, datasetIds, placeTypes)}
    )
    SELECT tf.tag_id, COALESCE(rb_and_cardinality(tf.feature_ids, ${population}), 0) AS count
    FROM ${tagFeatures} tf
    CROSS JOIN pop
    ORDER BY count DESC, tf.tag_id
  `);

  return {
    tags: result.rows.map(row => ({ id: row.tag_id, count: parseInt(row.count) }))
  };
}
