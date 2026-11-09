/**
 * What each filter value is worth, for the filter panel: how many features pressing it
 * leaves. One scan of cell_features, cut to the period's bins and the scope's cells,
 * grouped by the three category columns into bitmaps; everything else is read off
 * that small table. A category's values are counted under the other two categories,
 * the search and the tags (with their operator); the tags under all three categories
 * and the search, and under the selected tags too when they combine with AND, since
 * pressing a tag then narrows rather than adds. A category given as an empty list is
 * an emptied one: it leaves the other categories' counts and the total at zero while
 * its own values are still counted, so the panel can show what pressing one gives.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { FilterCounts, TagOperator, ValueCount } from '@atm/shared';
import { db } from '../client';
import { cellFeatures, tagFeatures } from '../schema';
import { binWindow, cellRangeCondition, displayGrid, placeCellsCondition } from './cell-features';
import { boundsToBaseCellRange } from './features';
import { getTimeSliceDateRange } from './time-slices';
import { searchBitmap } from './feature-search';
import { tagBitmap } from './tag-filter';

export type FilterCountsQuery = {
  recordTypes?: string[];
  datasetIds?: string[];
  placeTypes?: string[];
  tags?: string[];
  tagOperator?: TagOperator;
  searchQuery?: string;
  // the period, as a time slice key; absent counts every bin
  timeSlice?: string;
  // the scope: a display cell's bounds, or a place's cells; absent counts the city
  bounds?: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  placeId?: string;
  cols?: number;
};

type CountRow = { id: string; count: string };

// a category's condition: absent is everything, an empty list is nothing
function selects(col: SQL, values: string[] | undefined): SQL {
  if (values === undefined) {
    return sql`TRUE`;
  }
  if (values.length === 0) {
    return sql`FALSE`;
  }
  return sql`${col} IN ${values}`;
}

// the distinct features of a group of bitmaps, within the match bitmap when there is one
function countOf(union: SQL, match: SQL | null): SQL {
  if (!match) {
    return sql`rb_cardinality(${union})`;
  }
  return sql`COALESCE(rb_and_cardinality(${union}, ${match}), 0)`;
}

// the bitmaps intersected, or null when there is none
function allOf(...bitmaps: (SQL | null)[]): SQL | null {
  return bitmaps.reduce<SQL | null>((acc, bm) => {
    if (!bm) return acc;
    if (!acc) return bm;
    return sql`rb_and(${acc}, ${bm})`;
  }, null);
}

export async function getFilterCounts(query: FilterCountsQuery): Promise<FilterCounts> {
  const { recordTypes, datasetIds, placeTypes, tags, tagOperator = 'OR', searchQuery, timeSlice, bounds, placeId, cols } = query;

  let window: SQL = sql`TRUE`;
  if (timeSlice) {
    const { startYear, endYear } = await getTimeSliceDateRange(timeSlice);
    window = binWindow(startYear, endYear);
  }
  let scope: SQL = sql`TRUE`;
  if (bounds) {
    scope = cellRangeCondition(sql`${cellFeatures.cellX}`, sql`${cellFeatures.cellY}`, await boundsToBaseCellRange(bounds));
  }
  if (placeId) {
    scope = sql`${scope} AND ${await placeCellsCondition(sql`${cellFeatures.cellX}`, sql`${cellFeatures.cellY}`, placeId, await displayGrid(cols))}`;
  }

  const search = searchQuery ? sql`(SELECT bm FROM q)` : null;
  const selectedTags = tags && tags.length > 0 ? sql`(SELECT bm FROM t)` : null;
  // a category's values: under the other categories, the search and the tags as combined
  const forCategory = allOf(search, selectedTags);
  // the tags: under every category and the search; under the selected tags too when they narrow
  const forTags = allOf(search, tagOperator === 'AND' ? selectedTags : null);

  const byType = selects(sql`record_type`, recordTypes);
  const byDataset = selects(sql`dataset_id`, datasetIds);
  const byPlaceType = selects(sql`place_type`, placeTypes);

  const result = await db.execute<CountRow & { kind: string }>(sql`
    WITH cells AS (
      SELECT ${cellFeatures.recordType} AS record_type, ${cellFeatures.datasetId} AS dataset_id, ${cellFeatures.placeType} AS place_type,
             rb_or_agg(${cellFeatures.featureIds}) AS bm
      FROM ${cellFeatures}
      WHERE ${window} AND ${scope}
      GROUP BY 1, 2, 3
    ),
    q AS (SELECT ${searchQuery ? searchBitmap(searchQuery) : sql`NULL::roaringbitmap`} AS bm),
    t AS (SELECT ${tags && tags.length > 0 ? tagBitmap(tags, tagOperator) : sql`NULL::roaringbitmap`} AS bm),
    pop AS (SELECT rb_or_agg(bm) AS bm FROM cells WHERE ${byType} AND ${byDataset} AND ${byPlaceType})
    SELECT 'recordTypes' AS kind, record_type AS id, ${countOf(sql`rb_or_agg(bm)`, forCategory)} AS count
      FROM cells WHERE ${byDataset} AND ${byPlaceType} GROUP BY record_type
    UNION ALL
    SELECT 'datasets', dataset_id, ${countOf(sql`rb_or_agg(bm)`, forCategory)}
      FROM cells WHERE ${byType} AND ${byPlaceType} GROUP BY dataset_id
    UNION ALL
    SELECT 'placeTypes', place_type, ${countOf(sql`rb_or_agg(bm)`, forCategory)}
      FROM cells WHERE ${byType} AND ${byDataset} GROUP BY place_type
    UNION ALL
    SELECT 'tags', tf.tag_id, COALESCE(rb_and_cardinality(tf.feature_ids, ${allOf(sql`pop.bm`, forTags)}), 0)
      FROM ${tagFeatures} tf CROSS JOIN pop
    UNION ALL
    SELECT 'total', '', ${countOf(sql`pop.bm`, allOf(search, selectedTags))} FROM pop
  `);

  const counts: FilterCounts = { total: 0, recordTypes: [], datasets: [], placeTypes: [], tags: [] };
  for (const row of result.rows) {
    const count = parseInt(row.count ?? '0') || 0;
    if (row.kind === 'total') {
      counts.total = count;
      continue;
    }
    const list = counts[row.kind as 'recordTypes' | 'datasets' | 'placeTypes' | 'tags'];
    if (row.kind === 'tags' || count > 0) {
      list.push({ id: row.id, count });
    }
  }
  const byCount = (a: ValueCount, b: ValueCount) => b.count - a.count || a.id.localeCompare(b.id);
  counts.recordTypes.sort(byCount);
  counts.datasets.sort(byCount);
  counts.placeTypes.sort(byCount);
  counts.tags.sort(byCount);
  return counts;
}
