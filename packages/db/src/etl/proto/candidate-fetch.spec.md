# Feature → place candidate fetchers — requirements

Two feature→place candidate fetchers, one per signal kind: point (WKT) and name.
Both are server-side ETL functions (read-only, no writes, no API), called once per
feature at ingest. Each takes the feature's date RANGE `[start, end]` (a single day is
`start == end`) and returns a candidate POOL; the caller ranks and selects. Every
temporal test is overlap. They read `place` / `place_geometry` / `place_historical_name`
(geometry RD/28992; point WKT transformed from 4326, or pass srid=28992 for RD).

A feature that resolves no place — or an ambiguous one, or one with no date — is SKIPPED
and counted in the final summary, never aborting the run.

Era discrimination is SOURCE-based, not geometry-date-based (see §4). A third signal, an
exact Adamlink URI, is a direct `place.id` lookup (0 or 1, no ranking): an exact resolver,
not a fetcher, out of scope here. Extent (line/polygon) and fuzzy name matching are
deferred (see end).

## 1. Point fetch — `getCandidatesByPoint(wkt, start, end, srid = 4326)`

1. Input: a point WKT + the feature range. SRID defaults to 4326 (WGS84); pass srid=28992 for RD (DB-native, passes through untransformed). Gather across ALL sources — never filter by source in the query; the date/source decides which wins in ranking.
2. Address & street candidates: the nearest place PER SOURCE within a per-type distance cap (defaults: address 30 m, street 50 m — tunable consts).
3. Neighbourhood & district candidates: EVERY polygon that contains the point (containment, no cap).
4. Index-safe distance predicate: the cap inside `ST_DWithin` MUST be a constant/bind parameter — `Math.max(ADDRESS_MAX_DISTANCE_M, STREET_MAX_DISTANCE_M)` — so the GiST index is usable; apply the exact per-type cap as an `ST_Distance(...) <= CASE type ...` POST-filter on the survivors. A per-row `CASE` inside `ST_DWithin` makes the radius row-dependent, defeats the index, and forces a full `place_geometry × place` scan. (The `<->` in `ORDER BY` is a plain distance sort over the ~dozens the probe returns, not a KNN index scan — fine; the probe did the reduction.)
5. Era-fit — address: source overlap (`adamlink` if `start < ERA_CUTOFF`, `bag` if `end >= ERA_CUTOFF`; a range straddling the cutoff makes BOTH era-fit). Street: prefer `adamlink` (nwb only gap-fills). Area: `[start, end]` overlaps `[since, until)`. Era-fit is a RANKING preference, not a hard filter — best-available still links (a modern point over Weesp links its present-day cbs area even though no historical area era-fits).
6. Rank per granularity and keep the single best: era-fit first, then longest temporal overlap (areas) or nearest distance (address, street).
7. The distance cap is mandatory — it bounds the query (no runaway on sparse sources) and refuses far snaps. A cap miss = NO candidate for that type, never a farther fallback.

## 2. Name fetch — `getCandidatesByName(name, start, end)`

8. Input: an exact place-name string + the feature range, for name-ONLY features (a toponym pulled from text). A feature that carries a coordinate uses the point fetcher instead — the name fetcher has no location signal.
9. Match case-insensitively and EXACTLY via `LOWER(name) = LOWER(${name})` — NOT `ILIKE`, which treats `%`/`_` as silent wildcards — against `place.name` (current) AND `place_historical_name.name` (dated). The match REVEALS the type (bare name → street / area; name + house number → address).
10. Requires a btree expression index on `LOWER(name)` on both tables (see §6); without it each match seq-scans ~930k rows.
11. Temporal score = overlap gap: 0 if `[start, end]` overlaps the name window `[since, until]`, else the days to the nearest end. Score a BOTH-open historical name (`since` AND `until` null) DEFENSIVELY — never gap 0, never an unconditional winner; rank it below any dated overlap — so correctness does not rest on the data: zero rows are both-open today, but a future name source could add one and silently reintroduce always-wins. Optionally also assert no both-open rows at place ingest. Current `place.name` has no window and is scored against the present.
12. De-duplicate to one candidate per place (its nearest-in-time observation).
13. Resolve to a UNIQUE top candidate: smallest temporal gap → finest type (all matches are already exact, per req 9). If two or more tie at the top (e.g. Amsterdam and Weesp both have a same-era "Kerkstraat"), the match is AMBIGUOUS — skip the feature + tally, never link arbitrarily. A name-only feature has no anchor to disambiguate by; that is the upstream classifier's job.
14. Cache the resolver keyed on `(name, start, end)` — repeated names within a dataset are common; cache the skip (undefined) result too.

## 3. Linking & type assertion

15. Single most-specific link: link the feature to exactly ONE place — the FINEST granularity that resolved, in priority address > street > neighbourhood > district. No coarser and no finer links. Coarser rollups come from the grid/cell index at query time, so per-feature coarser links would be redundant.
16. Type assertion (optional): the researcher may DECLARE the feature's place type. When declared, resolve only that type as the link instead of finest-resolvable; if nothing of that type resolves, SKIP the feature (warn + tally) with no fallback to another type. Applies to point and name.

## 4. Dating & era model

Temporal convention: feature ranges `[start, end]` are INCLUSIVE at both ends (single day = start == end); place windows in `place_geometry` and `place_historical_name` are half-open `[since, until)` — `until` EXCLUSIVE (verified against the data: name handoffs use `next.since = prev.until`, never `+1`). A window whose `until` equals a successor's `since` therefore hands off cleanly on that day with no boundary tie; the name gap and the area era-fit both honour this.

17. Era discrimination is SOURCE-based. In the data, 99.9% of `place_geometry` rows — all addresses and streets — carry no `since`/`until`; only the historical AREA layer (adamlink neighbourhoods/districts, ~1600–1921) is dated, and the present-day cbs areas are undated. So address/street era-fit uses `source` (`adamlink` = historical, `bag`/`nwb`/`cbs` = contemporary) + `ERA_CUTOFF`; only the area branch uses `since`/`until` overlap. Do NOT unify everything on `since`/`until` — it would collapse era-fit for 99% of places.
18. Residual: the ~27 undated present-day cbs areas read as valid-for-all-time in the area branch. When a dated area overlaps equally, prefer it — this needs an EXPLICIT comparator tiebreak (a candidate with concrete `since`/`until` bounds outranks a both-open one), because era-fit and overlap both tie and the fallback distance is 0-vs-0, so the current comparator resolves it arbitrarily.

## 5. Undated features

19. A null/absent date skips only the FETCHER-backed methods (WKT / NAME) — they can't era-place it and would send a null to `::date`. The URI resolver is EXEMPT: it is an exact id match that needs no date, and downstream deliberately supports undated features — the cell index excludes them (`build-cell-features` / `rebuild-index` filter `start_date IS NOT NULL AND end_date IS NOT NULL`), while the browse listing shows them (`getFeatures` applies the year predicate only under a time filter and orders `NULLS LAST`). So: undated + fetcher-signal → skip + tally; undated + URI → link. Guard the fetcher path, not the whole cascade.

## 6. Performance & indexing

20. Point: no schema change — the existing GiST index on `place_geometry.geometry` suffices once the cap is a constant/bind parameter (req 4).
21. Name: add btree expression indexes on `LOWER(name)` to `place` and `place_historical_name` (optionally partial `WHERE name IS NOT NULL`). The existing `inferByName` must switch to the same `LOWER(name) = LOWER(...)` predicate to use the index — a behavioral change worth flagging to the co-dev: names containing `%`/`_` stop being wildcards.
22. Caching: wrap ALL resolvers in `createCachedResolver` keyed on their inputs — name → `(name, start, end)`, point → `(wkt, start, end)`. The existing `inferByWKT` is already cached, which implies repeated coordinates (e.g. many articles geocoded to one spot), so measure the hit rate rather than assume every coordinate is unique; a genuinely unique-key run just gets no hits at low cost.
23. Target cost: low-single-digit ms per feature once req 4 and req 21 are in place.

## Deferred / out of scope

- **Extent fetch** (`getCandidatesByExtent`, line/polygon) — no dataset produces line/polygon geometry yet, so not built. When it is: the input DIMENSION sets the granularity floor (line → street + coarser, never address; polygon → neighbourhood/district only); MULTI-LINK every era-fit candidate whose share exceeds a threshold, ranked by share (length in a corridor / overlap area); era-fit ranks, does not hard-filter (match the point fetcher). Fix the follows-vs-crosses corridor problem by RELATIVIZING the share (shared length ÷ street length) rather than an absolute metre threshold, which links every crossing street.
- **Fuzzy / normalized name matching** — deferred. Exact match loses OCR-corrupted and spacing-variant names, but no toponym extractor over running OCR text exists yet (delpher resolves by coordinate; `blogs` matches known names via the trie), so it can't be measured. Strict fuzzy also can't separate a typo of street A from a genuinely different street B one edit away (Kerkstraat / Kersstraat), and under quality-over-quantity a wrong link is worse than a skip. Revisit only with a real extractor, and prefer fixing it upstream (a classifier that emits URIs/coordinates or filters garbage) plus deterministic normalization (lower / trim / `unaccent`) before any trigram (pg_trgm) fuzzy.
