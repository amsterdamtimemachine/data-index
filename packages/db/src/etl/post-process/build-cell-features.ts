import { sql } from 'drizzle-orm';
import { PRECOMP_TIME_BIN_YEARS } from '@atm/shared';
import { db } from '../../client';
import { cellFeatures, features, featureToPlace, place, placeCells } from '../../schema';
import { yearBin } from '../sql';
import { datedFeatures } from '../../queries/time-filter';

type BuildStatsRow = { buckets: string; bytes: string };
type UncoveredRow = { uncovered: string };

/**
 * Precomputes the data behind the map's heatmap and histogram so both stay fast and
 * exact at any zoom or filter, doing their spatial/temporal aggregation at ingest time
 * rather than per request.
 *
 * Rebuilds cell_features — the precomputed index the heatmap and histogram queries read.
 *
 * Each feature is exploded across its places' 100m cells and the base time bins its
 * date range spans, then grouped into buckets keyed by
 * (cell, bin, record_type, dataset, place_type). Each bucket stores the set of features
 * in it as a roaring bitmap, so a query unions the bitmaps of the buckets it selects —
 * union deduplicates, letting base cells roll up into any display grid as an exact
 * distinct count.
 *
 * Roaring bitmaps hold int4, but features.id is a uuid, so the build assigns each
 * feature a dense integer (row_number, 1..N) and packs those instead. That numbering is
 * scoped to this run and discarded — only cardinality is read back, never a feature's
 * identity. (A future bitmap that must intersect with these, e.g. per-tag sets, would
 * have to be built in the same pass off the same numbering.)
 */
export async function buildCellFeatures() {
  console.log(`\nRebuilding cell_features (base bin: ${PRECOMP_TIME_BIN_YEARS} years)...`);

  await db.execute(sql`TRUNCATE ${cellFeatures}`);

  await db.execute(sql`
    INSERT INTO ${cellFeatures} (cell_x, cell_y, time_bin, record_type, dataset_id, place_type, feature_ids)
    WITH seq AS (
      SELECT ${features.id} AS id, (row_number() OVER ())::int AS n
      FROM ${features}
      WHERE ${datedFeatures(sql`${features.startDate}`, sql`${features.endDate}`)}
    ),
    expanded AS (
      SELECT
        pc.cell_x,
        pc.cell_y,
        b.bin::smallint AS time_bin,
        f.record_type,
        f.dataset_id,
        p.type AS place_type,
        s.n
      FROM ${placeCells} pc
      JOIN ${featureToPlace} fp ON pc.place_id = fp.place_id
      JOIN ${features} f ON fp.feature_id = f.id
      JOIN ${place} p ON pc.place_id = p.id
      JOIN seq s ON s.id = f.id
      -- every base bin the feature's date range touches, floored to the bin grid so
      -- it lines up with generateTimeSlices' round boundaries
      CROSS JOIN LATERAL generate_series(
        ${yearBin(sql`f.start_date`)},
        ${yearBin(sql`f.end_date`)},
        ${PRECOMP_TIME_BIN_YEARS}::int
      ) AS b(bin)
    )
    SELECT cell_x, cell_y, time_bin, record_type, dataset_id, place_type, rb_build_agg(n)
    FROM expanded
    GROUP BY cell_x, cell_y, time_bin, record_type, dataset_id, place_type
  `);

  await db.execute(sql`ANALYZE ${cellFeatures}`);

  const stats = await db.execute<BuildStatsRow>(sql`
    SELECT COUNT(*) as buckets, pg_total_relation_size('cell_features')::text as bytes
    FROM ${cellFeatures}
  `);
  const { buckets, bytes } = stats.rows[0];
  console.log(`  ✅ ${buckets} buckets, ${(parseInt(bytes) / 1024 / 1024).toFixed(0)} MB`);

  // A feature with no cell coverage is invisible to both the heatmap and the
  // histogram, since both now read this table. That should be impossible — ingest
  // drops features that resolve to no place — but a place whose geometry is missing
  // produces no cells, and the feature would silently vanish rather than error.
  const uncovered = await db.execute<UncoveredRow>(sql`
    SELECT COUNT(*) as uncovered
    FROM ${features} f
    WHERE ${datedFeatures(sql`f.start_date`, sql`f.end_date`)}
      AND NOT EXISTS (
        SELECT 1 FROM ${featureToPlace} fp
        JOIN ${placeCells} pc ON pc.place_id = fp.place_id
        WHERE fp.feature_id = f.id
      )
  `);
  const n = parseInt(uncovered.rows[0].uncovered);
  if (n > 0) {
    console.log(`  ⚠ ${n} features have no cell coverage — they will not appear in the heatmap or histogram (their place has no geometry)`);
  }
}
