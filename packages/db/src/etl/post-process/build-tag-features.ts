import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { features, featureTags, tagFeatures } from '../../schema';

/**
 * Rebuilds tag_features: one roaring bitmap of feature_int_id per tag, unioned over
 * every tagger — the set a tag filter intersects with cell_features. Part of
 * rebuild-index, so tags follow the same rule as every other ingest.
 */
export async function buildTagFeatures() {
  console.log('\nRebuilding tag_features...');
  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE ${tagFeatures}`);
    const result = await tx.execute(sql`
      INSERT INTO ${tagFeatures} (tag_id, feature_ids)
      SELECT ft.tag_id, rb_build_agg(f.feature_int_id)
      FROM ${featureTags} ft
      JOIN ${features} f ON f.id = ft.feature_id
      GROUP BY ft.tag_id
    `);
    console.log(`  ${result.rowCount ?? 0} tags`);
  });
}
