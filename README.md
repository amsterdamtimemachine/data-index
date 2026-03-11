# Amsterdam Time Machine Data Index

Search heritage collections from multiple institutions in one platform with historical data across time and space for research and discovery.

## Architecture

Monorepo with 4 packages:

```
packages/
  shared/       Shared TypeScript types and configuration constants
  db/           PostgreSQL/PostGIS database layer (Drizzle ORM, ETL scripts)
  app/          SvelteKit web application (frontend + API routes)
  preprocessor/ Legacy binary data pipeline (deprecated)
```

### Tech stack

- **Runtime**: Bun
- **Frontend**: SvelteKit 5, Svelte 5, MapLibre GL, TailwindCSS
- **Database**: PostgreSQL 16 + PostGIS 3.4 via Drizzle ORM
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
- **feature_cells**: Pre-computed grid cells at 100m resolution for fast heatmap aggregation, displayed at 75x75 resolution
- **frequency**: Number of grid cells a feature spans — lower = more geographically specific = ranks higher in search results

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

From `packages/db/`:

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
| `GET /api/metadata` | Time slices, record types, bounds, stats | 24h |
| `GET /api/heatmaps` | Sparse heatmap data (single or timeline) | 1h |
| `GET /api/histogram` | Feature count distribution by time period | 1h |
| `GET /api/features` | Paginated features within geographic bounds | 5m |
| `GET /api/available-tags` | Tags with feature counts | 30m |
| `GET /api/tag-combinations` | Valid tag combinations for AND/OR filtering | 30m |
| `GET /api/geodata` | Legacy proxy to external API (to be removed) |

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

Edit `.env` and set `PUBLIC_MAPTILER_API_KEY` (get one from [MapTiler](https://www.maptiler.com/)).

### Start the database

```bash
docker compose up -d db
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
cp .env.example .env    # configure env vars
docker compose up --build
```

Runs two containers:
- **db**: PostgreSQL 16 + PostGIS 3.4 with persistent volume
- **app**: SvelteKit on port 3000, depends on healthy db

Data ingestion is done separately from a dev machine (see [Data ingestion](#data-ingestion)).

### Docker commands

```bash
docker compose up -d          # start
docker compose up --build     # rebuild and start
docker compose down           # stop
docker compose logs -f app    # app logs
docker compose logs -f db     # database logs
```

Adminer (database UI) available in dev profile:

```bash
docker compose --profile dev up    # includes Adminer on port 8080
```

## What's implemented

- [x] PostgreSQL/PostGIS database with full schema (sources, places, features, relations, tags, cells)
- [x] Drizzle ORM with typed queries for all data access
- [x] ETL pipeline for LPS places and Beeldbank features
- [x] Pre-computed 100m grid cells for fast heatmap aggregation
- [x] 7 API endpoints (metadata, heatmaps, histogram, features, tags, tag-combinations)
- [x] Features query with bounds filtering, pagination, tag AND/OR, time slices, interleaved sorting
- [x] MapLibre GL map with heatmap cell visualization
- [x] Interactive time period selector with histogram
- [x] Record type toggle filtering (image, text, person)
- [x] Tag filtering with AND/OR operator support
- [x] Feature cards with detail modal
- [x] Docker Compose deployment (db + app)
- [x] Migration system via Drizzle Kit

## What's missing / TODO

- [ ] **Wire up FeaturesPanel to local API** — `FeaturesPanel.svelte` still calls the legacy external API (`atmbackend.create.humanities.uva.nl`) instead of the local `/api/features` endpoint
- [ ] **Remove legacy geodata proxy** — `/api/geodata` endpoint and `externalApi.ts` utility can be removed once FeaturesPanel is migrated
- [ ] **Street geometries** — `adamlinkstraten.geojson` (street data) is not yet ingested; only point-based addresses from LPS are imported
- [ ] **Additional data sources** — only Beeldbank images are ingested; system supports text, person, video, audio record types
- [ ] **Tag data** — no tags are currently ingested; tag filtering UI exists but has no data
- [ ] **Full-text search** — `features.description` is stored but not indexed for search
- [ ] **Update root README docker commands** — some docker scripts in root package.json reference old data-init service
- [ ] **Clean up preprocessor package** — legacy binary pipeline is no longer used
- [ ] **Remove unused env vars** — `PRIVATE_VISUALIZATION_BINARY_PATH`, bounds/grid env vars (now in shared config)
