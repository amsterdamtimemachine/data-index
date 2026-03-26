# Changelog

## 2026-03-26

### Schema
- `features.id` changed from text (source URL) to UUID (auto-generated)
- Added `features.url` column for the source URL
- Added `features.entity` JSONB column for schema.org typed data (Person, MediaObject)
- Removed `features.date_created` column (moved to entity)
- All junction table foreign keys updated from text to UUID

### ETL
- All ETL scripts now use Drizzle ORM (`db`) exclusively — removed raw `pool`/`client` usage
- `pool` no longer exported from db package
- Added Joods Monument ingestion script (63k persons, fixed date range 1940–1945, WGS84→RD coordinate transform)
- Beeldbank relation changed from `depictedIn` to `isAbout`
- Entity `dateCreated` formatted as inclusive date range (`start/end`) or single date, via shared `formatDateRange()` utility
- Removed auto-rebuild from ingest command — `db:rebuild-index` must be run separately after all sources are ingested
- Renamed `db:rebuild-cells` → `db:rebuild-index` (computes spatial grid, spatial frequency, and temporal frequency)

## 2026-03-24

### Temporal overlap
- Features now appear in all time bins they overlap, not just the bin matching their start date
- Heatmap and histogram queries use `generate_series` + range overlap join instead of `FLOOR(start_date / binSize)`
- Features query uses overlap filter (`start_date <= sliceEnd AND end_date >= sliceStart`) instead of containment
- Added `temporal_frequency` column — number of base time bins a feature spans, computed during `rebuild-index`
- Renamed `frequency` → `spatial_frequency` / `spatialFrequency` to disambiguate from temporal
- Normalised relevance score combining spatial + temporal frequency for default sort
- All config values (grid bounds, bin size bounds, cache TTL) now env-configurable
- Added unit tests for TTL cache and time slice generation

## 2026-03-19

### Data-driven configuration
- Time slices computed from actual data extent instead of hardcoded 1500–2025 array
- Bin size configurable per request (`binSize` param, default 50, range 10–100)
- TTL cache for time slices, cell bounds, and geographic extent — no server restart after data ingestion
- Grid resolution clamped to actual base cell extent
- API error messages no longer leak raw SQL queries to frontend
- Sort/sortDirection whitelist validation on features endpoint

## 2026-03-17

### Database & Schema
- Renamed `adamlink` → `place`, `featureToAdamlink` → `featureToPlace`
- Added `relation` table
- Renamed `cellCount` → `spatial_frequency`

### ETL
- LPS ingestion (105k places with WKT geometries from CSV)
- Beeldbank ingestion (streams 2.5GB JSON, inserts features + place links)
- All ETL scripts use parameterized queries

### API
- Moved heatmap dimensions into `/api/heatmaps` response
- Grid resolution configurable per request (`rows`/`cols`, default 75)
- Features interleaved by record type via SQL window functions

### Frontend
- Replaced legacy `Feature`/`RawFeature` types with `FeatureResult`
- FeaturesPanel fetches from local `/api/features` instead of external API

### Map & Tiles
- Replaced MapTiler with OpenFreeMap — no API key, inline style (water + roads only)
- Tile source configurable via `PUBLIC_TILE_SOURCE_URL` at runtime

### Environment & Build
- Zero build-time env vars — all `PUBLIC_*` vars use `$env/dynamic/public`
- Vite reads root `.env` via `envDir` — deleted `sync-env.sh`
- Dockerfile no longer copies `.env` into image
- Deleted `packages/preprocessor`, legacy types, `Dockerfile.preprocessor`
