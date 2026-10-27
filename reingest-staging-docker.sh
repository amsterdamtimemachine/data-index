#!/usr/bin/env bash
#
# Staging re-ingest, image-run. Wipes the self-hosted staging DB and rebuilds it
# from scratch through the app image, so no host bun/workspace is needed. Runs all
# ETL as one-off `docker compose run` app containers.
#
#   ./reingest-staging-docker.sh          # prompts before wiping
#   ./reingest-staging-docker.sh -y       # skip the prompt
#   DATA=/other/dir ./reingest-staging-docker.sh   # source files elsewhere
#
# Run from the clone of the deployment to rebuild: its .env names the compose project
# (whose DB volume is wiped, nothing else's) and the image tag the ETL runs from. The
# app is stopped by the wipe and restarted at the end.
#
set -euo pipefail
cd "$(dirname "$0")"

# ── config (edit for the server) ──────────────────────────────────────────────
DATA="${DATA:-/data/atm_data100/staging_data}"   # host dir holding the source files

BUURTEN="adamlinkbuurten.ttl"
STRATEN="adamlinkstraten.ttl"
LPS="20230920-lps.ttl"
ADRESSEN="20240311-adressen.ttl"
BEELDBANK="beeldbank.csv"
JM="results_jm.csv"
DELPHER="delpher_newspapers.csv"
CINEMA="cinema-context.2026-09-29.jsonl"
DIARIES="amsterdam-diaries.jsonl"
# classifier tags: one file per dataset keyed by that dataset's natural keys (the
# Beeldbank and Delpher files remapped by remap_tags_to_feature_keys.py). Each file
# names the model that tagged it by its Hugging Face name, shown on cards and linked to its page.
IMAGE_TAGGER="google/siglip2-base-patch16-224"
IMAGE_TAGGER_LABEL="google/siglip2-base-patch16-224"
IMAGE_TAGGER_URL="https://huggingface.co/google/siglip2-base-patch16-224"
TEXT_TAGGER="BAAI/bge-m3"
TEXT_TAGGER_LABEL="BAAI/bge-m3"
TEXT_TAGGER_URL="https://huggingface.co/BAAI/bge-m3"
TAGS_BEELDBANK="beeldbank-tags.jsonl"
TAGS_DELPHER="delpher-tags.jsonl"
TAGS_DIARIES="meeting-demo-complete-diaries.jsonl"   # keyed by the entry's ark already, no remap

DC="docker compose --env-file .env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.self-hosted.yml \
  -f docker/docker-compose.staging.yml"

# ro mount for ingest, rw for fetch (fetch writes the geojson/ndjson into DATA)
etl()   { $DC run --rm -v "$DATA":/data:ro app bun run db:ingest "$@"; }
fetch() { $DC run --rm -v "$DATA":/data    app bun run db:fetch  "$@"; }

# ── guards ────────────────────────────────────────────────────────────────────
case "$DATA" in /*) ;; *) echo "DATA must be an absolute path (leading /), got: $DATA" >&2; exit 1 ;; esac
[ -d "$DATA" ] || { echo "DATA dir not found: $DATA" >&2; exit 1; }

PROJECT=$($DC config --format json 2>/dev/null | sed -n 's/^ *"name": *"\([^"]*\)".*/\1/p' | head -1)
IMAGE=$($DC config --images 2>/dev/null | grep '/app:' | head -1)
[ -n "$PROJECT" ] || { echo "could not resolve the compose project name; is .env in place?" >&2; exit 1; }
echo "compose project: $PROJECT"
echo "app image:       $IMAGE"
if [ "${1:-}" != "-y" ]; then
  read -rp "This WIPES the DB volume of project '$PROJECT' and rebuilds it from scratch. Type 'yes' to continue: " ok
  [ "$ok" = "yes" ] || { echo "aborted"; exit 1; }
fi

# ── wipe + fresh DB ───────────────────────────────────────────────────────────
echo "==> Wiping staging DB (down -v) and starting a fresh one..."
$DC down -v
$DC pull dataindex-db app
$DC up -d --wait dataindex-db

echo "==> Pushing schema (retry; fresh-DB introspection can flap)..."
for a in 1 2 3 4 5; do
  if $DC run --rm app bun run db:push-schema; then break; fi
  [ "$a" = 5 ] && { echo "   schema push failed after 5 attempts" >&2; exit 1; }
  echo "   attempt $a failed; retrying in 3s..."; sleep 3
done

# ── place backbone ────────────────────────────────────────────────────────────
echo "==> Ingesting places (geometry backbone)..."
etl -s neighbourhoods-and-districts -f "/data/$BUURTEN"
etl -s streets  -f "/data/$STRATEN"
etl -s lps      -f "/data/$LPS"
etl -s adressen -f "/data/$ADRESSEN"

# PDOK gap-fills: fetch only when the ground-truth file is absent, then ingest
echo "==> PDOK layers (CBS / NWB / BAG)..."
[ -f "$DATA/cbs-areas.geojson" ]    || fetch -s cbs-areas     -o /data/cbs-areas.geojson
[ -f "$DATA/nwb-streets.geojson" ]  || fetch -s nwb-streets   -o /data/nwb-streets.geojson
# a BAG file from before the building ids were kept is fetched again
grep -qs '"buildingId"' "$DATA/bag-addresses.ndjson" || fetch -s bag-addresses -o /data/bag-addresses.ndjson
etl -s pdok-places -f /data/cbs-areas.geojson
etl -s nwb-streets -f /data/nwb-streets.geojson -x "/data/$STRATEN"
etl -s pdok-places -f /data/bag-addresses.ndjson

# ── features ──────────────────────────────────────────────────────────────────
echo "==> Ingesting features..."
etl -s beeldbank      -f "/data/$BEELDBANK"
etl -s joods-monument -f "/data/$JM"
etl -s delpher        -f "/data/$DELPHER"
if [ -f "$DATA/$CINEMA" ]; then etl -s cinema-context -f "/data/$CINEMA"; else echo "==> No $CINEMA in $DATA; skipping Cinema Context"; fi
if [ -f "$DATA/$DIARIES" ]; then etl -s amsterdam-diaries -f "/data/$DIARIES"; else echo "==> No $DIARIES in $DATA; skipping Amsterdam Diaries"; fi

# ── tags (optional) ───────────────────────────────────────────────────────────
# dataset, file, and the model that tagged it
for row in "beeldbank|$TAGS_BEELDBANK|image" "delpher|$TAGS_DELPHER|text" "amsterdam-diaries|$TAGS_DIARIES|text"; do
  IFS='|' read -r ds file model <<< "$row"
  if [ "$model" = image ]; then
    tagger="$IMAGE_TAGGER"; label="$IMAGE_TAGGER_LABEL"; url="$IMAGE_TAGGER_URL"
  else
    tagger="$TEXT_TAGGER"; label="$TEXT_TAGGER_LABEL"; url="$TEXT_TAGGER_URL"
  fi
  if [ -f "$DATA/$file" ]; then
    echo "==> Ingesting tags ($label over $ds)..."
    etl -s tags -f "/data/$file" --tagger "$tagger" --dataset "$ds" --tagger-label "$label" --tagger-url "$url"
  else
    echo "==> No tags file at $DATA/$file; skipping $ds tags"
  fi
done

# ── index + app ───────────────────────────────────────────────────────────────
echo "==> Rebuilding spatial index, tag bitmaps, frequencies + grid_config..."
$DC run --rm app bun run db:rebuild-index

echo "==> Bringing the app back up..."
$DC up -d app

echo "==> Done. Staging re-ingested from scratch."
