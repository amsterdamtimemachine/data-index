#!/usr/bin/env bash
#
# Mirror .env onto .env.example: the example's order and comments become the layout,
# values already set in .env are kept (also where the example only has a commented
# default), variables new in the example come in as the example has them, and keys
# the example does not know are kept in a block at the end.
#
#   scripts/sync-env.sh        # prints the merged file
#   scripts/sync-env.sh -w     # rewrites .env, keeping .env.bak
#
set -euo pipefail
cd "$(dirname "$0")/.."
EXAMPLE=.env.example
ENV=.env
[ -f "$ENV" ] || { echo "no $ENV here; copy $EXAMPLE first" >&2; exit 1; }

merged=$(awk '
  # KEY=... or # KEY=... -> KEY; anything else -> ""
  function key(line,    k) {
    if (match(line, /^#?[ ]?[A-Za-z_][A-Za-z0-9_]*=/)) {
      k = substr(line, RSTART, RLENGTH); sub(/^#?[ ]?/, "", k); sub(/=$/, "", k); return k
    }
    return ""
  }
  FNR == NR { k = key($0); if (k != "" && $0 !~ /^#/) { cur[k] = $0; order[++n] = k } next }
  {
    k = key($0)
    if (k != "" && (k in cur)) { print cur[k]; seen[k] = 1; next }
    if (k != "") print ($0 ~ /^#/ ? "new default, commented: " : "new from example: ") k > "/dev/stderr"
    print
  }
  END {
    for (i = 1; i <= n; i++) {
      k = order[i]
      if (k in seen || k in done) continue
      if (!extra) { print ""; print "# Not in .env.example"; extra = 1 }
      print cur[k]; done[k] = 1
      print "kept, not in example: " k > "/dev/stderr"
    }
  }' "$ENV" "$EXAMPLE")

if [ "${1:-}" = "-w" ]; then
  cp "$ENV" "$ENV.bak"
  printf '%s\n' "$merged" > "$ENV"
  echo "$ENV rewritten (previous copy in $ENV.bak)" >&2
else
  printf '%s\n' "$merged"
fi
