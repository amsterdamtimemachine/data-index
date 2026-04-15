# Amsterdam Time Machine Data Index

Search heritage collections from multiple institutions in one platform with historical data across time and space for research and discovery.

## Architecture

Monorepo with 3 packages:

```
packages/
  shared/       Shared TypeScript types and configuration constants
  db/           PostgreSQL/PostGIS database layer (Drizzle ORM, ETL scripts)
  app/          SvelteKit web application (frontend + API routes)
```

### Tech stack

- **Runtime**: Bun
- **Frontend**: SvelteKit 5, Svelte 5, MapLibre GL, TailwindCSS
- **Database**: PostgreSQL 16 + PostGIS 3.4 via Drizzle ORM
- **Map tiles**: OpenFreeMap (configurable via `PUBLIC_TILE_SOURCE_URL`)
- **Infrastructure**: Docker Compose

### Data model

```
organisations ──< datasets ──< features >── feature_to_place >── place
                                   │                │
                                   │            relation
                                   │
                              feature_tags >── tags
                                   │
                              feature_cells (pre-computed 100m grid)
                                                    │
                              place ──< address (historical names)
```

- **organisations**: Institutions that provide datasets (e.g. Amsterdam Stadsarchief, Koninklijke Bibliotheek)
- **datasets**: Data collections from organisations (e.g. Beeldbank, Delpher Kranten)
- **place**: Physical locations (one per LPS linked point), stored in RD coordinates (EPSG:28992)
- **address**: Historical address names linked to places, with date and registry source
- **features**: Content items (images, text, persons) with schema.org `entity` JSONB, UUID primary key
- **feature_cells**: Pre-computed 100m grid cells for heatmap aggregation
- **spatial_frequency**: Grid cells a feature spans — lower = more geographically specific
- **temporal_frequency**: Base time bins a feature spans — lower = more temporally specific

### Heatmap grid

Grid resolution configurable per request via `rows`/`cols` on `/api/heatmaps` (default 75, clamped to data extent). The API returns dimensions alongside timeline data.

### Time slices

Computed dynamically from the data. Bins are anchored to round boundaries (multiples of bin size). Bin size defaults to 50 years, configurable via `binSize` param (10–100). Bin boundaries are left-inclusive, right-exclusive: `[1900, 1950)`.

Features appear in all time bins they overlap — a feature spanning 1840–1920 shows up in bins 1800, 1850, and 1900.

## Data ingestion

Ingestion scripts run manually against the database.

### Data sources

| Source | Format | Size | Contents |
|--------|--------|------|----------|
| [LPS](https://adamlink.nl/downloads/20230920-lps.csv.zip) | CSV | 11 MB | ~105k linked points, ~222k address IDs from 7 registries (1832–1976) |
| [Adressen](https://adamlink.nl/downloads/20230920-adressen.csv.zip) | CSV | 21 MB | ~222k address labels from Adamlink |
| Beeldbank | JSON | 2.5 GB | Amsterdam Stadsarchief images mapped to Adamlink URIs |
| Joods Monument | CSV | 16 MB | ~63k Holocaust victims with last known addresses (1900–1945) |
| Delpher | CSV | 126 MB | ~142k newspaper articles matched to places by geometry (5m threshold) |

### Running ingestion

Order matters — places and addresses first, then features.

```bash
# 1. Places + address mappings
bun run db:ingest -s lps -f <path-to-lps.csv>

# 2. Address labels
bun run db:ingest -s adressen -f <path-to-adressen.csv>

# 3. Features (any order)
bun run db:ingest -s beeldbank -f <path-to-beeldbank.json>
bun run db:ingest -s joods-monument -f <path-to-results_jm.csv>
bun run db:ingest -s delpher -f <path-to-delpher_newspapers.csv>

# 4. Rebuild index
bun run db:rebuild-index
```

### Adding a new data source

Copy `packages/db/src/etl/sources/template.ts`, implement the `ingest(filePath)` function, and run:

```bash
bun run db:ingest -s <source-name> -f <file-path>
```

## API endpoints

| Endpoint | Purpose | Cache |
|----------|---------|-------|
| `GET /api/metadata` | Time slices, record types, datasets, stats | 24h |
| `GET /api/heatmaps` | Sparse heatmap data with grid dimensions | 1h |
| `GET /api/histogram` | Feature count distribution by time period | 1h |
| `GET /api/features` | Paginated features within geographic bounds | 5m |
| `GET /api/available-tags` | Tags with feature counts | 30m |
| `GET /api/tag-combinations` | Valid tag combinations for AND/OR filtering | 30m |

### Heatmaps

`GET /api/heatmaps?recordTypes=image,text&datasets=beeldbank&rows=75&cols=75&binSize=50`

Returns `{ dimensions, timeline }`. Timeline maps each time slice key to sparse `{ indices, counts }` arrays.

### Histogram

`GET /api/histogram?recordTypes=image,text&datasets=beeldbank&binSize=50`

Returns `{ bins, maxCount, timeRange, totalFeatures }`. Must use the same `binSize` as heatmaps.

### Features

`GET /api/features?minLon=...&maxLon=...&minLat=...&maxLat=...`

Optional: `recordTypes`, `datasets`, `tags`, `tagOperator` (AND|OR), `timeSlice`, `sort` (relevance|spatialFrequency|date), `sortDirection`, `page`, `pageSize` (max 200). Description truncated to 128 characters in response.

Default sort is `relevance` — normalised score of `(spatial_frequency / max) + (temporal_frequency / max)`. Lower = more specific = ranks higher. Results interleaved by record type.

Features include `historicalAddress` (address name at the feature's time) and `currentAddress` (most recent name). When they differ, the card shows both.

## Development

### Prerequisites

- [Bun](https://bun.sh) (latest)
- [Docker](https://docker.com) with Docker Compose

### Setup

```bash
bun install
cp .env.example .env
```

### First-time setup

```bash
# 1. Start database
docker compose -f docker/docker-compose.yml up -d dataindex-db

# 2. Push schema
bun run db:push-schema

# 3. Ingest (order matters)
bun run db:ingest -s lps -f <path-to-lps.csv>
bun run db:ingest -s adressen -f <path-to-adressen.csv>
bun run db:ingest -s beeldbank -f <path-to-beeldbank.json>
bun run db:ingest -s joods-monument -f <path-to-results_jm.csv>
bun run db:ingest -s delpher -f <path-to-delpher_newspapers.csv>

# 4. Rebuild index
bun run db:rebuild-index
```

### Wiping the database

```bash
docker rm -f dataindex-db
docker volume rm docker_pgdata
docker compose -f docker/docker-compose.yml up -d dataindex-db
bun run db:push-schema
```

### Dev server

```bash
bun run dev    # http://localhost:5175
```

### Drizzle Studio

```bash
cd packages/db && bun run db:studio
```

## Production (Docker)

```bash
docker compose -f docker/docker-compose.yml up --build
```

Two containers: **dataindex-db** (PostgreSQL + PostGIS) and **app** (SvelteKit on port 3000). No `.env` in the Docker image — all config is runtime.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `DB_USER` | No | `atm` | PostgreSQL user (Docker) |
| `DB_PASSWORD` | No | `atm_dev_password` | PostgreSQL password (Docker) |
| `PUBLIC_DEFAULT_CELL` | No | — | Default cell to select on load |
| `PUBLIC_TILE_SOURCE_URL` | No | OpenFreeMap | Vector tile source URL |
| `BASE_BIN_SIZE` | No | `10` | Base time bin size (years) |
| `CELL_SIZE_METERS` | No | `100` | Base spatial cell size (meters) |
| `GRID_DEFAULT` | No | `75` | Default heatmap grid resolution |
| `GRID_MIN` / `GRID_MAX` | No | `10` / `200` | Grid resolution bounds |
| `DEFAULT_BIN_SIZE` | No | `50` | Default display bin size (years) |
| `BIN_SIZE_MIN` / `BIN_SIZE_MAX` | No | `10` / `100` | Bin size bounds (years) |
| `CACHE_TTL_MINUTES` | No | `10` | TTL for cached DB queries |

### Docker commands

```bash
docker compose -f docker/docker-compose.yml up -d              # start
docker compose -f docker/docker-compose.yml up --build         # rebuild and start
docker compose -f docker/docker-compose.yml down               # stop
docker compose -f docker/docker-compose.yml logs -f app        # app logs
docker compose -f docker/docker-compose.yml logs -f dataindex-db  # database logs
docker compose -f docker/docker-compose.yml --profile dev up    # includes Adminer on :8080
```
