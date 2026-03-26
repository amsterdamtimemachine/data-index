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
sources ──< features >── feature_to_place >── place (with PostGIS geometry)
                │                │
                │            relation (e.g. "isAbout", "hadLastLivingLocation")
                │
           feature_tags >── tags
                │
           feature_cells (pre-computed 100m grid for heatmaps)
```

- **place**: Geographic locations stored in RD coordinates (EPSG:28992), transformed to WGS84 for the frontend
- **features**: Content items (images, text, persons) linked to places
- **feature_cells**: Pre-computed grid cells at 100m resolution for fast heatmap aggregation
- **spatial_frequency**: Number of grid cells a feature spans — lower = more geographically specific
- **temporal_frequency**: Number of base time bins a feature spans — lower = more temporally specific

### Heatmap grid

Grid resolution is configurable per request via `rows` and `cols` query params on `/api/heatmaps` (default: 75, clamped to actual data extent). The API returns dimensions alongside the timeline data so the frontend can render the grid without a separate metadata call.

### Time slices

Time periods are computed dynamically from the data. The server queries `MIN(start_date)` and `MAX(end_date)` from features, then generates bins anchored to round boundaries (e.g. 1500, 1550, 1600). Bin size defaults to 50 years and is configurable via the `binSize` query param (min 10, max 100). Results are cached (TTL configurable via `CACHE_TTL_MINUTES`).

Features appear in all time bins they overlap — a feature spanning 1840–1920 shows up in bins 1800, 1850, and 1900.

## Data ingestion

Ingestion scripts run manually against the database. They are not part of the Docker deployment.

### Data sources

| Source | Format | Size | Contents |
|--------|--------|------|----------|
| LPS | CSV | 11 MB | ~105k address locations with WKT geometries from 7 historical registries (1832–1976) |
| Beeldbank | JSON | 2.5 GB | Amsterdam Stadsarchief — images mapped to Adamlink address URIs |
| Joods Monument | CSV | 16 MB | ~63k Holocaust victims with last known addresses (fixed date range 1940–1945) |

### Running ingestion

Order matters — places must be ingested before features, and the index must be rebuilt after all sources.

```bash
# 1. Places first (other sources link features to these by adamlink URI)
bun run db:ingest -s lps -f <path-to-lps.csv>

# 2. Features (any order between sources)
bun run db:ingest -s beeldbank -f <path-to-beeldbank.json>
bun run db:ingest -s joods-monument -f <path-to-results_jm.csv>

# 3. Rebuild index (always run after ingestion)
bun run db:rebuild-index
```

`db:rebuild-index` computes the 100m spatial grid cells, spatial frequency, and temporal frequency. Must be run after every data change.

### Adding a new data source

Copy `packages/db/src/etl/sources/template.ts`, implement the `ingest(filePath)` function, and run:

```bash
bun run db:ingest -s <source-name> -f <file-path>
```

## API endpoints

All endpoints are SvelteKit server routes in `packages/app/src/routes/api/` that query the database via `@atm/db`.

| Endpoint | Purpose | Cache |
|----------|---------|-------|
| `GET /api/metadata` | Time slices, record types, stats | 24h |
| `GET /api/heatmaps` | Sparse heatmap data with grid dimensions | 1h |
| `GET /api/histogram` | Feature count distribution by time period | 1h |
| `GET /api/features` | Paginated features within geographic bounds | 5m |
| `GET /api/available-tags` | Tags with feature counts | 30m |
| `GET /api/tag-combinations` | Valid tag combinations for AND/OR filtering | 30m |

### Heatmaps endpoint

`GET /api/heatmaps?recordTypes=image,text&rows=75&cols=75&binSize=50`

Optional params: `recordTypes`, `timeSlice` (single slice key), `rows`/`cols` (grid resolution, default 75, clamped to data extent), `binSize` (time bin in years, default 50).

Returns `{ dimensions, timeline }`. Timeline maps each time slice key to sparse `{ indices, counts }` arrays.

### Histogram endpoint

`GET /api/histogram?recordTypes=image,text&binSize=50`

Optional params: `recordTypes`, `binSize` (default 50).

Returns `{ bins, maxCount, timeRange, totalFeatures }`. The `binSize` must match the heatmap's `binSize` for time periods to align.

### Features endpoint

`GET /api/features?minLon=...&maxLon=...&minLat=...&maxLat=...`

Optional params: `recordTypes`, `tags`, `tagOperator` (AND|OR), `timeSlice`, `sort` (relevance|spatialFrequency|date), `sortDirection` (asc|desc), `page`, `pageSize` (max 200).

Default sort is `relevance` — a normalised score combining spatial and temporal frequency. Results are interleaved by record type using window functions.

## Development

### Prerequisites

- [Bun](https://bun.sh) (latest)
- [Docker](https://docker.com) with Docker Compose

### Setup

```bash
bun install
cp .env.example .env
```

### First-time setup (from scratch)

```bash
# 1. Start the database
docker compose -f docker/docker-compose.yml up -d dataindex-db

# 2. Push schema to the database
cd packages/db && bunx drizzle-kit push && cd ../..

# 3. Ingest data (places first, then features)
bun run db:ingest -s lps -f <path-to-lps.csv>
bun run db:ingest -s beeldbank -f <path-to-beeldbank.json>
bun run db:ingest -s joods-monument -f <path-to-results_jm.csv>

# 4. Rebuild index
bun run db:rebuild-index
```

### Wiping the database

```bash
docker rm -f dataindex-db
docker volume rm docker_pgdata
docker compose -f docker/docker-compose.yml up -d dataindex-db
cd packages/db && bunx drizzle-kit push && cd ../..
```

Then re-run the ingestion steps above.

### Run the dev server

```bash
bun run dev
```

App available at `http://localhost:5175`.

### Drizzle Studio (database UI)

```bash
cd packages/db
bun run db:studio
```

## Production (Docker)

```bash
docker compose -f docker/docker-compose.yml up --build
```

Runs two containers:
- **dataindex-db**: PostgreSQL 16 + PostGIS 3.4 with persistent volume
- **app**: SvelteKit on port 3000, depends on healthy db

All environment variables are configured in `docker/docker-compose.yml`. No `.env` file is needed inside the Docker image — all public env vars are read at runtime.

Data ingestion is done separately — either from a dev machine with `DATABASE_URL` pointed at the remote DB (via SSH tunnel), or by SSH-ing into the server and running the ingest commands directly.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `DB_USER` | No | `atm` | PostgreSQL user (Docker) |
| `DB_PASSWORD` | No | `atm_dev_password` | PostgreSQL password (Docker) |
| `PUBLIC_DEFAULT_CELL` | No | — | Default cell to select on load |
| `PUBLIC_TILE_SOURCE_URL` | No | OpenFreeMap | Vector tile source URL |
| `BASE_BIN_SIZE` | No | `10` | Base time bin size for temporal frequency (years) |
| `CELL_SIZE_METERS` | No | `100` | Base spatial cell size (meters) |
| `GRID_DEFAULT` | No | `75` | Default heatmap grid resolution |
| `GRID_MIN` | No | `10` | Minimum allowed grid resolution |
| `GRID_MAX` | No | `200` | Maximum allowed grid resolution |
| `DEFAULT_BIN_SIZE` | No | `50` | Default display bin size (years) |
| `BIN_SIZE_MIN` | No | `10` | Minimum allowed bin size (years) |
| `BIN_SIZE_MAX` | No | `100` | Maximum allowed bin size (years) |
| `CACHE_TTL_MINUTES` | No | `10` | TTL for cached DB queries (minutes) |

### Docker commands

```bash
docker compose -f docker/docker-compose.yml up -d              # start
docker compose -f docker/docker-compose.yml up --build         # rebuild and start
docker compose -f docker/docker-compose.yml down               # stop
docker compose -f docker/docker-compose.yml logs -f app        # app logs
docker compose -f docker/docker-compose.yml logs -f dataindex-db  # database logs
```

Adminer (database UI) available in dev profile:

```bash
docker compose -f docker/docker-compose.yml --profile dev up    # includes Adminer on port 8080
```
