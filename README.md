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
                │            relation (e.g. "depictedIn")
                │
           feature_tags >── tags
                │
           feature_cells (pre-computed 100m grid for heatmaps)
```

- **place**: Geographic locations (addresses, buildings, streets, neighbourhoods) stored in RD coordinates (EPSG:28992), transformed to WGS84 for the frontend
- **features**: Content items (images, text, persons, video, audio) linked to places
- **feature_cells**: Pre-computed grid cells at 100m resolution for fast heatmap aggregation
- **frequency**: Number of grid cells a feature spans — lower = more geographically specific = ranks higher in search results

### Heatmap grid

The heatmap grid resolution is configurable per request via `rows` and `cols` query params on `/api/heatmaps` (default: 75, min: 10, max: 200). The API returns dimensions alongside the timeline data so the frontend can render the grid without a separate metadata call.

### Time slices

11 periods covering 1500–2025 in 50-year windows (last period is 25 years: 2000–2025). Used for heatmap timeline, histogram, and feature filtering.

## Data ingestion

Data lives outside the repository in a `data/` directory (gitignored). Ingestion scripts run manually from a dev machine against the database — they are not part of the Docker deployment.

### Data sources

| File | Size | Contents |
|------|------|----------|
| `20230920-lps.csv` | 11 MB | ~105k address locations with WKT geometries (RD coordinates) from 7 historical registries (1832–1976) |
| `beeldbank-fixed.json` | 2.5 GB | Amsterdam Stadsarchief Beeldbank — images mapped to Adamlink address URIs |

**LPS (Linked Point Set)** ties together address IDs across historical registries (pw-1943, pw-1909, obelt-1920, loman-1976, bevolkingsregister-1870, wijken-1853, percelen-1832) with a single WKT coordinate per location.

**Beeldbank JSON** is structured as `{ adamlinkUri: { images: [...] } }`. Each image has an `@id`, `name`, `contentUrl`, `startDate`, `endDate`, and `dateCreated`. One image can appear under multiple Adamlink URIs (depicted at multiple locations).

### Running ingestion

```bash
# 1. Import places (addresses with geometries) — must run first
bun run db:ingest -s lps -f ../../data/20230920-lps.csv

# 2. Import features (images linked to places)
bun run db:ingest -s beeldbank -f ../../data/beeldbank-fixed.json

# 3. Compute grid cells + update frequency values
bun run db:rebuild-cells
```

Order matters: places must exist before beeldbank can link features to them.

Add `--skip-cells` to the ingest commands to skip the automatic cell rebuild (useful when ingesting multiple sources before rebuilding once).

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

### Time slices

Time periods are computed dynamically from the data rather than hardcoded. On first request, the server queries `MIN(start_date)` and `MAX(end_date)` from features, then generates bins anchored to round boundaries (e.g. 1500, 1550, 1600). The bin size defaults to 50 years and is configurable via the `binSize` query param (min 10, max 100). Results are cached for 10 minutes.

All endpoints that use time slices (`metadata`, `histogram`, `heatmaps`, `features`) call the same cached function, guaranteeing consistent periods across the API.

### Heatmaps endpoint

`GET /api/heatmaps?recordTypes=image,text&rows=75&cols=75&binSize=50`

Optional params: `recordTypes`, `timeSlice` (single slice key), `rows`/`cols` (grid resolution, default 75, clamped to data extent), `binSize` (time bin in years, default 50).

Returns `{ dimensions, timeline }`. Dimensions include the actual grid size used (may be clamped below requested if it exceeds the 100m base cell resolution). Timeline maps each time slice key to sparse `{ indices, counts }` arrays.

### Histogram endpoint

`GET /api/histogram?recordTypes=image,text&binSize=50`

Optional params: `recordTypes`, `binSize` (default 50).

Returns `{ bins, maxCount, timeRange, totalFeatures }`. Each bin contains a `timeSlice` object and a `count`. The `binSize` must match the heatmap's `binSize` for the time periods to align — the frontend ensures this by passing the same value to both endpoints.

### Features endpoint

`GET /api/features?minLon=...&maxLon=...&minLat=...&maxLat=...`

Optional params: `recordTypes`, `tags`, `tagOperator` (AND|OR), `timeSlice`, `sort` (frequency|date), `sortDirection` (asc|desc), `page`, `pageSize` (max 200).

Results are interleaved by record type (one image, one text, one person, repeat) using window functions so the UI shows variety.

## Development

### Prerequisites

- [Bun](https://bun.sh) (latest)
- [Docker](https://docker.com) with Docker Compose

### Setup

```bash
bun install
cp .env.example .env
```

### Start the database

```bash
docker compose -f docker/docker-compose.yml up -d dataindex-db
```

### Push schema (first time or after schema changes)

```bash
cd packages/db
bunx drizzle-kit generate --name <migration-name>
bunx drizzle-kit migrate
```

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

All environment variables are configured in `docker-compose.yml`. No `.env` file is needed inside the Docker image — all public env vars are read at runtime.

Data ingestion is done separately from a dev machine (see [Data ingestion](#data-ingestion)).

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PUBLIC_DEFAULT_CELL` | No | — | Default cell to select on load |
| `PUBLIC_TILE_SOURCE_URL` | No | OpenFreeMap | Vector tile source URL |
| `DB_USER` | No | `atm` | PostgreSQL user (Docker) |
| `DB_PASSWORD` | No | `atm_dev_password` | PostgreSQL password (Docker) |

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

## What's implemented

- [x] PostgreSQL/PostGIS database with full schema (sources, places, features, relations, tags, cells)
- [x] Drizzle ORM with typed queries for all data access
- [x] ETL pipeline for LPS places and Beeldbank features
- [x] Pre-computed 100m grid cells for fast heatmap aggregation
- [x] Configurable heatmap grid resolution (10–200, default 75)
- [x] 6 API endpoints (metadata, heatmaps, histogram, features, tags, tag-combinations)
- [x] Features query with bounds filtering, pagination, tag AND/OR, time slices, interleaved sorting
- [x] MapLibre GL map with heatmap cell visualization
- [x] Interactive time period selector with histogram
- [x] Record type toggle filtering (image, text, person)
- [x] Tag filtering UI with AND/OR operator support
- [x] Feature cards with detail modal
- [x] Docker Compose deployment (db + app)
- [x] Migration system via Drizzle Kit
- [x] No build-time env vars — all config is runtime

