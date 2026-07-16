import { sql } from 'drizzle-orm';
import { BASE_BIN_SIZE } from '@atm/shared';
import { db } from '../../client';
import { cellFeatures, features, featureToPlace, place, placeCells } from '../../schema';

type BuildStatsRow = { buckets: string; bytes: string };
type UncoveredRow = { uncovered: string };

/**
 * Rebuild cell_features: which features occupy each cell + base time bin + category.
 *
 * This runs the join the heatmap and histogram used to do per request — features ×
 * their places' cells × the base bins their date range touches — once, and stores
 * each bucket's feature set as a roaring bitmap. Requests then filter buckets and
 * union the bitmaps, which dedupes, so rolling base cells up into any display grid
 * stays an exact distinct count.
 *
 * The surrogate is the reason this works at all: roaringbitmap stores int4 and
 * features.id is a 128-bit uuid, so ids are renumbered 1..N for the build. The
 * mapping is deliberately thrown away — every consumer reads cardinality, never
 * identity. Any future bitmap that must intersect with these (e.g. per-tag sets)
 * has to be built in the same pass off the same numbering, or the ids won't line up.
 */
export async function buildCellFeatures() {
  console.log(`\nRebuilding cell_features (base bin: ${BASE_BIN_SIZE} years)...`);

  await db.execute(sql`TRUNCATE ${cellFeatures}`);

  await db.execute(sql`
    INSERT INTO ${cellFeatures} (cell_x, cell_y, time_bin, record_type, dataset_id, place_type, feature_ids)
    WITH seq AS (
      SELECT ${features.id} AS id, (row_number() OVER ())::int AS n
      FROM ${features}
      WHERE ${features.startDate} IS NOT NULL AND ${features.endDate} IS NOT NULL
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
        (FLOOR(EXTRACT(YEAR FROM f.start_date) / ${BASE_BIN_SIZE}::int) * ${BASE_BIN_SIZE}::int)::int,
        (FLOOR(EXTRACT(YEAR FROM f.end_date) / ${BASE_BIN_SIZE}::int) * ${BASE_BIN_SIZE}::int)::int,
        ${BASE_BIN_SIZE}::int
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
    WHERE f.start_date IS NOT NULL AND f.end_date IS NOT NULL
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
