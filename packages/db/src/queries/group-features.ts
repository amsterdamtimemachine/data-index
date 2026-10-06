import { sql } from 'drizzle-orm';
import type { Entity, GroupFeaturesQuery, GroupFeaturesResponse } from '@atm/shared';
import { db } from '../client';

type GroupFeatureRow = {
  id: string;
  url: string | null;
  label: string;
  start_date: string;
  end_date: string;
  entity: Entity | null;
};

/**
 * The members of one group in date order: a cinema's programmes in a year. Keyed
 * on the dataset and group key index, no joins; the list query's group row names
 * the years, this fetches one of them.
 */
export async function getGroupFeatures(query: GroupFeaturesQuery): Promise<GroupFeaturesResponse> {
  const result = await db.execute<GroupFeatureRow>(sql`
    SELECT id, url, label, start_date::text AS start_date, end_date::text AS end_date, entity
    FROM features
    WHERE dataset_id = ${query.datasetId}
      AND group_key = ${query.groupKey}
      AND start_date >= ${query.start}::date
      AND start_date <= ${query.end}::date
    ORDER BY start_date, label, id
  `);
  return {
    data: result.rows.map((row) => ({
      id: row.id,
      url: row.url || undefined,
      label: row.label,
      startDate: row.start_date,
      endDate: row.end_date,
      entity: row.entity || undefined,
    })),
  };
}
