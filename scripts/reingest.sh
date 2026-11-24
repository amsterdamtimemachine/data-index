#!/usr/bin/env bash
#
# Wipe a deployment's bundled DB and rebuild it from scratch: schema, places,
# features, tags, index. Run from the deployment's clone: its .env names the compose
# project whose DB volume is wiped, and the image the ETL runs in.
#
#   scripts/reingest.sh dev           # host bun, self-hosted DB
#   scripts/reingest.sh staging       # app image (APP_IMAGE_TAG in .env picks the lane)
#   scripts/reingest.sh production    # app image :production
#   scripts/reingest.sh staging -y    # without the prompt
#
# Settings come from reingest.env in the repo root (copy reingest.env.example; or the
# file REINGEST_CONFIG names); what it leaves out comes from the environment, then the
# defaults below. DATA is required: the absolute path of the source files.
#
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
case "$TARGET" in
  dev|staging|production) ;;
  *) echo "usage: $0 <dev|staging|production> [-y]" >&2; exit 1 ;;
esac

CONFIG="${REINGEST_CONFIG:-reingest.env}"
if [ -f "$CONFIG" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG"
fi

# ── settings ──────────────────────────────────────────────────────────────────
: "${DATA:?set DATA in $CONFIG: the absolute path of the source files}"
: "${BUURTEN:=adamlinkbuurten.ttl}"
: "${STRATEN:=adamlinkstraten.ttl}"
: "${LPS:=lps.ttl}"
: "${ADRESSEN:=adressen.ttl}"
: "${GEBOUWEN:=adamlinkgebouwen.ttl}"
: "${BEELDBANK:=beeldbank.csv}"
: "${JM:=results_jm.csv}"
: "${DELPHER:=delpher_newspapers.csv}"
: "${CINEMA:=cinema-context.jsonl}"
: "${DIARIES:=amsterdam-diaries.jsonl}"
# the dumps the two files above are extracted from when they are missing
: "${CINEMA_DUMP:=cinema-context.sql}"
: "${DIARIES_DUMP:=amsterdam-diaries-dump}"
# classifier tags, one file per dataset keyed by its natural keys, and the model that made them
: "${TAGS_BEELDBANK:=beeldbank-tags.jsonl}"
: "${TAGS_DELPHER:=delpher-tags.jsonl}"
: "${TAGS_DIARIES:=amsterdam-diaries-tags.jsonl}"
: "${IMAGE_TAGGER:=google/siglip2-base-patch16-224}"
: "${IMAGE_TAGGER_LABEL:=$IMAGE_TAGGER}"
: "${IMAGE_TAGGER_URL:=https://huggingface.co/$IMAGE_TAGGER}"
: "${TEXT_TAGGER:=BAAI/bge-m3}"
: "${TEXT_TAGGER_LABEL:=$TEXT_TAGGER}"
: "${TEXT_TAGGER_URL:=https://huggingface.co/$TEXT_TAGGER}"

case "$DATA" in /*) ;; *) echo "DATA must be an absolute path, got: $DATA" >&2; exit 1 ;; esac
[ -d "$DATA" ] || { echo "DATA dir not found: $DATA" >&2; exit 1; }

DC="docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.self-hosted.yml"
case "$TARGET" in
  staging) DC="$DC -f docker/docker-compose.staging.yml" ;;
  production) DC="$DC -f docker/docker-compose.production.yml" ;;
esac

# ── timing: every step reports how long it took, and the run ends with a summary ──
TIMINGS=()
fmt_time() { printf '%dm%02ds' $(($1 / 60)) $(($1 % 60)); }
# the step's name: its source (-s <name>) when it has one, else its db: command
step_name() {
  local prev="" arg cmd=""
  for arg in "$@"; do
    if [ "$prev" = "-s" ]; then
      [ "$cmd" = extract ] && { echo "extract $arg"; return; }
      echo "$arg"; return
    fi
    case "$arg" in db:*) cmd="${arg#db:}" ;; esac
    prev="$arg"
  done
  echo "${cmd:-step}"
}
timed() {
  local name start status
  name=$(step_name "$@"); start=$SECONDS; status=0
  "$@" || status=$?
  TIMINGS+=("$(printf '%-30s %s' "$name" "$(fmt_time $((SECONDS - start)))")")
  echo "   ⏱  $name took $(fmt_time $((SECONDS - start)))"
  return $status
}
print_timings() {
  echo "==> Time per step:"
  printf '   %s\n' "${TIMINGS[@]}"
  echo "   total                          $(fmt_time $SECONDS)"
}

# A db: command, on the host for dev and in the app image otherwise. IN is where the
# command sees the source files; the image mounts DATA read-only for an ingest.
if [ "$TARGET" = dev ]; then
  IN="$DATA"
  db() { local cmd="$1"; shift; timed bun run "db:$cmd" "$@"; }
else
  IN=/data
  db() {
    local cmd="$1" mount="$DATA:/data"; shift
    [ "$cmd" = ingest ] && mount="$DATA:/data:ro"
    timed $DC run --rm -v "$mount" app bun run "db:$cmd" "$@"
  }
fi

# ── wipe + fresh DB ───────────────────────────────────────────────────────────
PROJECT=$($DC config --format json 2>/dev/null | sed -n 's/^ *"name": *"\([^"]*\)".*/\1/p' | head -1)
[ -n "$PROJECT" ] || { echo "could not resolve the compose project name; is .env in place?" >&2; exit 1; }
echo "target:          $TARGET"
echo "compose project: $PROJECT"
echo "source files:    $DATA"
if [ "$TARGET" != dev ]; then
  echo "app image:       $($DC config --images 2>/dev/null | grep '/app:' | head -1)"
fi
if [ "${2:-}" != "-y" ]; then
  read -rp "This WIPES the DB volume of project '$PROJECT' and rebuilds it from scratch. Type 'yes' to continue: " ok
  [ "$ok" = "yes" ] || { echo "aborted"; exit 1; }
fi

echo "==> Wiping the DB (down -v) and starting a fresh one..."
$DC down -v --remove-orphans
if [ "$TARGET" = dev ]; then
  $DC pull dataindex-db
else
  $DC pull dataindex-db app
fi
$DC up -d --wait dataindex-db

echo "==> Pushing schema (retry; fresh-DB introspection can flap)..."
for attempt in 1 2 3 4 5; do
  if db push-schema; then break; fi
  [ "$attempt" = 5 ] && { echo "   schema push failed after 5 attempts" >&2; exit 1; }
  echo "   attempt $attempt failed; retrying in 3s..."; sleep 3
done

# ── places ────────────────────────────────────────────────────────────────────
echo "==> Ingesting places (geometry backbone)..."
db ingest -s neighbourhoods-and-districts -f "$IN/$BUURTEN"
db ingest -s streets  -f "$IN/$STRATEN"
db ingest -s lps      -f "$IN/$LPS"
db ingest -s adressen -f "$IN/$ADRESSEN"

# PDOK layers are fetched only when absent; delete a file to refresh it
echo "==> PDOK layers (CBS / NWB / BAG) and the municipality boundary..."
[ -f "$DATA/cbs-areas.geojson" ]    || db fetch -s cbs-areas     -o "$IN/cbs-areas.geojson"
[ -f "$DATA/nwb-streets.geojson" ]  || db fetch -s nwb-streets   -o "$IN/nwb-streets.geojson"
# a BAG file from before the building ids were kept is fetched again
grep -qs '"buildingId"' "$DATA/bag-addresses.ndjson" || db fetch -s bag-addresses -o "$IN/bag-addresses.ndjson"
[ -f "$DATA/municipality.geojson" ] || db fetch -s municipality  -o "$IN/municipality.geojson"
db ingest -s pdok-places -f "$IN/cbs-areas.geojson"
db ingest -s nwb-streets -f "$IN/nwb-streets.geojson" -x "$IN/$STRATEN"
db ingest -s pdok-places -f "$IN/bag-addresses.ndjson"
db ingest -s buildings   -f "$IN/$GEBOUWEN" -m "$IN/municipality.geojson"

# ── features ──────────────────────────────────────────────────────────────────
# Cinema Context and the Diaries: extract from their dumps when the files are missing
[ -f "$DATA/$CINEMA" ]  || [ ! -f "$DATA/$CINEMA_DUMP" ]  || db extract -s cinema-context    -i "$IN/$CINEMA_DUMP"  -o "$IN/$CINEMA"  -m "$IN/municipality.geojson"
[ -f "$DATA/$DIARIES" ] || [ ! -d "$DATA/$DIARIES_DUMP" ] || db extract -s amsterdam-diaries -i "$IN/$DIARIES_DUMP" -o "$IN/$DIARIES" -m "$IN/municipality.geojson"

echo "==> Ingesting features..."
db ingest -s beeldbank      -f "$IN/$BEELDBANK"
db ingest -s joods-monument -f "$IN/$JM"
db ingest -s delpher        -f "$IN/$DELPHER"
# a Cinema Context file from before a programme's items were named so is skipped: re-extract it
if [ ! -f "$DATA/$CINEMA" ]; then echo "==> No $CINEMA in $DATA; skipping Cinema Context"
elif ! grep -qs '"items"' "$DATA/$CINEMA"; then echo "==> $CINEMA has no programme items (from before the rename); delete it to re-extract. Skipping Cinema Context" >&2
else db ingest -s cinema-context -f "$IN/$CINEMA"; fi
if [ -f "$DATA/$DIARIES" ]; then db ingest -s amsterdam-diaries -f "$IN/$DIARIES"; else echo "==> No $DIARIES in $DATA; skipping Amsterdam Diaries"; fi

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
    db ingest -s tags -f "$IN/$file" --tagger "$tagger" --dataset "$ds" --tagger-label "$label" --tagger-url "$url"
  else
    echo "==> No tags file at $DATA/$file; skipping $ds tags"
  fi
done

# ── index + app ───────────────────────────────────────────────────────────────
echo "==> Rebuilding spatial index, tag bitmaps, frequencies + grid_config..."
db rebuild-index

if [ "$TARGET" != dev ]; then
  echo "==> Bringing the app back up..."
  $DC up -d app
fi

echo "==> Done. $TARGET re-ingested from scratch."
print_timings
