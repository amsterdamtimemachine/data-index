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
import { features, tags, featureTags, featureToPlace, place } from '../schema';

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
type RecordTypeRow = { record_type: RecordType };
type CountRow = { count: string };

/**
 * Get all available record types from the database
 */
async function getRecordTypes(): Promise<RecordType[]> {
  const result = await db.execute<RecordTypeRow>(
    sql`SELECT DISTINCT ${features.recordType} as record_type FROM ${features} WHERE ${features.recordType} IS NOT NULL`
  );
  return result.rows.map(r => r.record_type);
}

/**
 * Get available tags with feature counts and associated record types
 * Optionally filter by record types
 */
export async function getAvailableTags(
  recordTypes?: RecordType[],
  placeTypes?: PlaceType[]
): Promise<AvailableTags> {
  const types = recordTypes || await getRecordTypes();

  if (types.length === 0) {
    return { tags: [], recordTypes: [] };
  }

  // Single query that gets tag stats with record types array
  const result = await db.execute<TagStatsRow>(sql`
    SELECT
      ${tags.id} as tag_id,
      ${tags.label} as tag_label,
      COUNT(DISTINCT ${featureTags.featureId}) as total_features,
      ARRAY_AGG(DISTINCT ${features.recordType}) as record_types
    FROM ${tags}
    JOIN ${featureTags} ON ${tags.id} = ${featureTags.tagId}
    JOIN ${features} ON ${featureTags.featureId} = ${features.id}
    ${placeTypes && placeTypes.length > 0
      ? sql`JOIN ${featureToPlace} ON ${features.id} = ${featureToPlace.featureId} JOIN ${place} ON ${featureToPlace.placeId} = ${place.id}`
      : sql``}
    WHERE ${features.recordType} IN ${types}
      ${placeTypes && placeTypes.length > 0 ? sql`AND ${place.type} IN ${placeTypes}` : sql``}
    GROUP BY ${tags.id}, ${tags.label}
    ORDER BY total_features DESC
  `);

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
 * Get available tags that can be combined with already selected tags
 * This finds tags that have features with ALL the selected tags (AND logic)
 */
export async function getTagCombinations(
  recordTypes?: RecordType[],
  selectedTags: string[] = [],
  placeTypes?: PlaceType[]
): Promise<TagCombinations> {
  const types = recordTypes || await getRecordTypes();
  const placeJoin = placeTypes && placeTypes.length > 0
    ? sql`JOIN ${featureToPlace} ON ${features.id} = ${featureToPlace.featureId} JOIN ${place} ON ${featureToPlace.placeId} = ${place.id}`
    : sql``;
  const placeFilter = placeTypes && placeTypes.length > 0
    ? sql`AND ${place.type} IN ${placeTypes}`
    : sql``;

  if (selectedTags.length === 0) {
    // No selection - return all tags
    const result = await db.execute<SimpleTagStatsRow>(sql`
      SELECT
        ${tags.label} as tag_label,
        COUNT(DISTINCT ${featureTags.featureId}) as total_features
      FROM ${tags}
      JOIN ${featureTags} ON ${tags.id} = ${featureTags.tagId}
      JOIN ${features} ON ${featureTags.featureId} = ${features.id}
      ${placeJoin}
      WHERE ${features.recordType} IN ${types}
        ${placeFilter}
      GROUP BY ${tags.id}, ${tags.label}
      ORDER BY total_features DESC
    `);

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
  // Step 1: Get feature IDs that have ALL selected tags
  const result = await db.execute<SimpleTagStatsRow>(sql`
    WITH features_with_all_tags AS (
      SELECT ft.feature_id
      FROM ${featureTags} ft
      JOIN ${features} f ON ft.feature_id = f.id
      JOIN ${tags} t ON ft.tag_id = t.id
      ${placeTypes && placeTypes.length > 0
        ? sql`JOIN ${featureToPlace} fp ON f.id = fp.feature_id JOIN ${place} p ON fp.place_id = p.id`
        : sql``}
      WHERE f.record_type IN ${types}
        AND t.label IN ${selectedTags}
        ${placeTypes && placeTypes.length > 0 ? sql`AND p.type IN ${placeTypes}` : sql``}
      GROUP BY ft.feature_id
      HAVING COUNT(DISTINCT t.id) = ${selectedTags.length}
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
 * Validate that a tag combination has features
 * Returns which tags are valid (have features together) and which are invalid
 */
export async function validateTagCombination(
  recordTypes?: RecordType[],
  selectedTags: string[] = [],
  placeTypes?: PlaceType[]
): Promise<TagValidation> {
  if (selectedTags.length === 0) {
    return { validTags: [], invalidTags: [] };
  }

  const types = recordTypes || await getRecordTypes();
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
        SELECT ft.feature_id
        FROM ${featureTags} ft
        JOIN ${features} f ON ft.feature_id = f.id
        JOIN ${tags} t ON ft.tag_id = t.id
        ${placeTypes && placeTypes.length > 0
          ? sql`JOIN ${featureToPlace} fp ON f.id = fp.feature_id JOIN ${place} p ON fp.place_id = p.id`
          : sql``}
        WHERE f.record_type IN ${types}
          AND t.label IN ${tagsToCheck}
          ${placeTypes && placeTypes.length > 0 ? sql`AND p.type IN ${placeTypes}` : sql``}
        GROUP BY ft.feature_id
        HAVING COUNT(DISTINCT t.id) = ${tagsToCheck.length}
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
