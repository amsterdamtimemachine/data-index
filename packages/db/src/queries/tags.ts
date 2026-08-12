import { sql } from 'drizzle-orm';
import type {
  RecordType,
  PlaceType,
  TagStats,
  AvailableTags,
  TagCombinations,
  TagValidation
} from '@atm/shared';
import { db } from '../client';
import type { CountRow } from '../row-types';
import { getRecordTypes } from './record-types';
import { andIn, placeTypeJoin, featureIdsWithAllTags } from './filters';
import { features, tags, featureTags } from '../schema';
import type { SQL } from 'drizzle-orm';

// Query result types (internal)
type TagStatsRow = {
  tag_id: string;
  tag_label: string;
  total_features: string;
  record_types: RecordType[];
};
type SimpleTagStatsRow = {
  tag_label: string;
  total_features: string;
};

/**
 * The shared tag-stats query: per-tag distinct feature counts under the
 * recordTypes / datasetIds / placeTypes filter triple. getAvailableTags adds the
 * record_types aggregate; getTagCombinations' no-selection branch omits it —
 * everything else is identical by construction.
 */
function tagStatsQuery(
  types: string[],
  datasetIds: string[] | undefined,
  placeTypes: string[] | undefined,
  withRecordTypes: boolean
): SQL {
  return sql`
    SELECT
      ${tags.id} as tag_id,
      ${tags.label} as tag_label,
      COUNT(DISTINCT ${featureTags.featureId}) as total_features${withRecordTypes ? sql`,
      ARRAY_AGG(DISTINCT ${features.recordType}) as record_types` : sql``}
    FROM ${tags}
    JOIN ${featureTags} ON ${tags.id} = ${featureTags.tagId}
    JOIN ${features} ON ${featureTags.featureId} = ${features.id}
    ${placeTypeJoin(placeTypes, sql`${features.id}`)}
    WHERE ${features.recordType} IN ${types}
      ${andIn(sql`${features.datasetId}`, datasetIds)}
      ${andIn(sql`p.type`, placeTypes)}
    GROUP BY ${tags.id}, ${tags.label}
    ORDER BY total_features DESC`;
}

/**
 * Get available tags with feature counts and associated record types.
 * Filters share the recordTypes / datasetIds / placeTypes triple used by the
 * heatmap, histogram and feature list, so the tag list reflects the same filters.
 */
export async function getAvailableTags(
  recordTypes?: RecordType[],
  datasetIds?: string[],
  placeTypes?: PlaceType[]
): Promise<AvailableTags> {
  const types = recordTypes || await getRecordTypes();

  if (types.length === 0) {
    return { tags: [], recordTypes: [] };
  }

  // Single query that gets tag stats with record types array
  const result = await db.execute<TagStatsRow>(tagStatsQuery(types, datasetIds, placeTypes, true));

  const tagStats: TagStats[] = result.rows.map(row => ({
    name: row.tag_label,
    totalFeatures: parseInt(row.total_features),
    recordTypes: row.record_types
  }));

  return {
    tags: tagStats,
    recordTypes: types
  };
}

/**
 * Get available tags that can be combined with already selected tags.
 * Finds tags whose features carry ALL the selected tags (AND logic).
 */
export async function getTagCombinations(
  recordTypes?: RecordType[],
  datasetIds?: string[],
  placeTypes?: PlaceType[],
  selectedTags: string[] = []
): Promise<TagCombinations> {
  const types = recordTypes || await getRecordTypes();

  if (types.length === 0) {
    return { availableTags: [], currentSelection: selectedTags, recordTypes: [] };
  }

  if (selectedTags.length === 0) {
    // No selection - return all tags
    const result = await db.execute<SimpleTagStatsRow>(tagStatsQuery(types, datasetIds, placeTypes, false));

    return {
      availableTags: result.rows.map(row => ({
        name: row.tag_label,
        totalFeatures: parseInt(row.total_features)
      })),
      currentSelection: [],
      recordTypes: types
    };
  }

  // Find features that have ALL selected tags, then find other tags on those features
  const result = await db.execute<SimpleTagStatsRow>(sql`
    WITH features_with_all_tags AS (
      ${featureIdsWithAllTags(selectedTags, { recordTypes: types, datasetIds, placeTypes })}
    )
    SELECT
      t.label as tag_label,
      COUNT(DISTINCT ft.feature_id) as total_features
    FROM ${featureTags} ft
    JOIN features_with_all_tags fwat ON ft.feature_id = fwat.feature_id
    JOIN ${tags} t ON ft.tag_id = t.id
    WHERE t.label NOT IN ${selectedTags}
    GROUP BY t.id, t.label
    ORDER BY total_features DESC
  `);

  return {
    availableTags: result.rows.map(row => ({
      name: row.tag_label,
      totalFeatures: parseInt(row.total_features)
    })),
    currentSelection: selectedTags,
    recordTypes: types
  };
}

/**
 * Validate that a tag combination has features.
 * Returns which tags are valid (have features together) and which are invalid.
 */
export async function validateTagCombination(
  recordTypes?: RecordType[],
  datasetIds?: string[],
  placeTypes?: PlaceType[],
  selectedTags: string[] = []
): Promise<TagValidation> {
  if (selectedTags.length === 0) {
    return { validTags: [], invalidTags: [] };
  }

  const types = recordTypes || await getRecordTypes();

  if (types.length === 0) {
    return { validTags: [], invalidTags: selectedTags };
  }

  const validTags: string[] = [];
  const invalidTags: string[] = [];

  // Start with all tags as potentially valid, then check incrementally
  let currentValid: string[] = [];

  for (const tag of selectedTags) {
    const tagsToCheck = [...currentValid, tag];

    // Check if there are features with all these tags
    const result = await db.execute<CountRow>(sql`
      SELECT COUNT(*) as count
      FROM (
        ${featureIdsWithAllTags(tagsToCheck, { recordTypes: types, datasetIds, placeTypes })}
        LIMIT 1
      ) sub
    `);

    if (parseInt(result.rows[0].count) > 0) {
      validTags.push(tag);
      currentValid.push(tag);
    } else {
      invalidTags.push(tag);
    }
  }

  return { validTags, invalidTags };
}
