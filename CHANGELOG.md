# Changelog

## 2026-04-02

### Place + Address refactor
- `place` represents a physical location (one per LPS linked point, 105k rows) instead of one per address ID (was 222k)
- New `address` table stores historical address names linked to places via FK
- `place.current_address` holds the most recent address name
- Historical address lookup: features query finds the address name valid at the feature's time via correlated subquery on `address(place_id, date)`
- Feature cards show historical + current address when they differ (e.g. "Gaat over Buurt NN, No. 42 (nu Herengracht 518)")
- Features link to `place.id` (lp-based) via address → place lookup during ingestion
- Adressen ingestion enriches address names and sets `place.current_address` from the most recent entry
- Added `address(place_id, date)` composite index for fast historical lookup

### Frontend
- Dataset/source OR filter — all selected by default, require at least one
- Entity detail component with birth/death/date/author fields
- Historical + current address display on feature cards
- Unified `t()` translation function — single map for all UI strings
- Renamed `Map.svelte` → `Heatmap.svelte` (Svelte 5 naming conflict)

## 2026-03-26

### Schema
- `features.id` from text to UUID, added `url`, `entity` (JSONB), removed `date_created`

### ETL
- All scripts use Drizzle ORM — removed raw `pool`/`client`
- Added Joods Monument ingestion (63k persons, 1900–1945)
- Batched inserts (1000/batch), renamed `db:rebuild-cells` → `db:rebuild-index`

## 2026-03-24

### Temporal overlap
- Features appear in all time bins they overlap via `generate_series` + range overlap join
- Added `temporal_frequency`, renamed `frequency` → `spatial_frequency`
- Normalised relevance score combining spatial + temporal frequency
- All config values env-configurable, unit tests for cache and time slices

## 2026-03-19

### Data-driven configuration
- Time slices computed from data extent, bin size configurable per request
- TTL cache, grid resolution clamped to data extent
- API errors no longer leak SQL, sort params whitelist validated

## 2026-03-17

### Initial PostGIS migration
- Schema: `place`, `features`, `relation`, `tags`, junction tables, `feature_cells`
- ETL: LPS + Beeldbank ingestion with parameterized queries
- API: heatmaps (with dimensions), histogram, features (interleaved by record type)
- Frontend: `FeatureResult` types, local API, OpenFreeMap tiles
- Build: zero build-time env vars, `envDir`, Docker deployment
