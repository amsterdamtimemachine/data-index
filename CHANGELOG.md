# Changelog

## 2026-04-13

### Schema
- Renamed `sources` → `datasets`, added `organisations` table with FK on datasets
- `features.source_id` → `features.dataset_id`
- Entity types follow schema.org: `Person`, `CreativeWork`, `MediaObject` (extends CreativeWork)
- Entity `label` renamed to `name` in schema.org types
- `CreativeWorkEntity` added with `url`, `dateCreated`, `author` fields
- API description response truncated to 128 characters (full text stays in DB)

### ETL
- Added Delpher newspaper ingestion (142k articles, spatial nearest-neighbor matching within 5m threshold)
- All ingestion scripts now create organisation + dataset records
- Delpher uses `CreativeWorkEntity`, Beeldbank uses `MediaObjectEntity`, Joods Monument uses `PersonEntity`

## 2026-04-02

### Place + Address refactor
- `place` = physical location (one per LPS linked point, 105k rows), `address` = historical names (222k rows)
- Historical address lookup via correlated subquery on `address(place_id, date)` — finds address valid at feature's time
- Feature cards show historical + current address when they differ
- Adressen ingestion enriches address names, sets `place.current_address`

### Frontend
- Dataset filter (was "source") — all selected by default
- Entity detail component, historical address display
- Unified `t()` translation function

## 2026-03-26

### Schema
- `features.id` from text to UUID, added `url`, `entity` (JSONB), removed `date_created`

### ETL
- Drizzle ORM for all scripts, Joods Monument ingestion, batched inserts
- Renamed `db:rebuild-cells` → `db:rebuild-index`

## 2026-03-24

### Temporal overlap
- Features appear in all overlapping time bins via `generate_series` + range overlap join
- `temporal_frequency` + `spatial_frequency`, normalised relevance scoring
- All config env-configurable, unit tests for cache and time slices

## 2026-03-19

### Data-driven configuration
- Dynamic time slices from data, configurable bin size, TTL cache
- Grid resolution clamped to data extent, API error sanitisation

## 2026-03-17

### Initial PostGIS migration
- Schema, ETL (LPS + Beeldbank), API endpoints, OpenFreeMap tiles
- Zero build-time env vars, Docker deployment
