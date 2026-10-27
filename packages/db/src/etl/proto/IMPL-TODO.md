# Candidate fetchers → spec sync — implementation TODO

**STATUS: all 9 proto-sync items complete & verified against the live DB (tsc clean).**
The proto (`candidate-fetchers.ts` + harness) now embodies the spec's fetcher + selection
layer. Remaining work is the production-integration list at the bottom (schema index,
ingestor skip-undated, caching wrapper, wiring into `place-inference.ts`) — a separate phase.


Source of truth: `candidate-fetch.spec.md`. Canonical code: `candidate-fetchers.ts`
(the shareable module). Where code and spec disagree, the spec wins.

Verify each item against the live DB (`docker-dataindex-db-1` up):
`bun run src/etl/proto/candidate-test.ts`, and typecheck with `tsc --noEmit`.

## Proto sync
- [x] 1. Harness imports fetchers/types/consts from `candidate-fetchers.ts` — single source, so verification runs the real module (no drift between the two files)
- [x] 2. Point fetcher — index-safe distance predicate (req 4): constant/bind cap `max(ADDRESS, STREET)` in `ST_DWithin` + per-type `ST_Distance(...) <= CASE` post-filter — verified: identical results + Bitmap Index Scan on idx_place_geometry_geom
- [x] 3. Name fetcher — exact match (req 9): `ILIKE` → `LOWER(name) = LOWER(input)`, both current + historical branches — verified: identical results, wildcard hole closed
- [x] 4. Name fetcher — defensive both-open scoring (req 11): sentinel gap when a historical name has `since` AND `until` both null (never wins unconditionally) — verified: harness identical + synthetic ordering dated < current < both-open
- [x] 5. Point comparator — dated-beats-undated tiebreak (req 18): add a `dated` flag to area candidates; break the equal-overlap tie in `rank()` toward the dated one — verified: no regression + synthetic tie/overlap tests PASS
- [x] 6. Name selection — unique-top-or-skip ambiguity (req 13): `resolveNamePool` helper (none/resolved/ambiguous); skip when top two tie on (gap, type) — verified: real-data skip on "Spaarpotsteeg 2" (2 adamlink addrs) + 4 synthetic cases PASS. NOTE: demo name now skips as ambiguous — consider an unambiguous QUERY_NAME in item 7 to also show a successful single-link.
- [x] 7. Single most-specific link (req 15): link only the finest resolved granularity; dropped coarser-anchoring + `geomOf`; demo name → "Beursplein" (unambiguous) — verified: point→1 address, name→1 street, no coarser language
- [x] 8. Remove extent fetcher + its types/consts/helpers/usage (deferred per spec) — verified: harness runs point+name only, no extent leftovers, tsc clean
- [x] 9. Rank-not-filter confirmation (req 5: era-fit is only a `rank` key, never a WHERE/hard filter — confirmed) + header/USAGE comments corrected (two fetchers, LOWER-index requirement noted, single-link)

## Production integration — OUT OF SCOPE for this proto sync (tracked, not done here)
- Schema: btree expression indexes on `LOWER(name)` for `place` + `place_historical_name`; rewrite `inferByName` to `LOWER()=` (req 20–21)
- Ingestor: skip undated features + guard the `DateRange` cast (req 19)
- Production caching wrapper (`createCachedResolver`) on the resolvers + measure hit rate (req 22)
- Wire into `place-inference.ts` / `place-index.ts` (thread the date into the WKT path)
