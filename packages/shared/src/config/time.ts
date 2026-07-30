// Time bin configuration.
//
// PRECOMP_* shapes the precomputed index (cell_features / temporal_frequency) and is
// baked in by db:rebuild-index — changing it requires a rebuild. DISPLAY_* only affects
// how a request folds those base bins for rendering — a restart is enough.

// Width of the base time bin (years). cell_features buckets features per base bin at
// rebuild-index time; display bins are unions of whole base bins, so a display bin size
// that isn't a multiple of this can't be answered exactly.
//
// This shapes stored data, not just a computed value: the buckets in cell_features are
// keyed by it. Changing it requires `db:rebuild-index` — otherwise the queries fold base
// bins using the new width while the table still holds buckets at the old one, and the
// counts go quietly wrong (an *increase* still happens to work, since the old bins nest
// inside the new; a decrease cannot, as a bucket can't be split back apart).
export const PRECOMP_TIME_BIN_YEARS = parseInt(process.env.PRECOMP_TIME_BIN_YEARS || '50', 10) || 50;

// Default display bin size (years) when a request doesn't specify one.
export const DISPLAY_TIME_BIN_DEFAULT_YEARS = parseInt(process.env.DISPLAY_TIME_BIN_DEFAULT_YEARS || '50', 10) || 50;

// Bounds the requested display bin size is clamped to (before snapping to a multiple
// of PRECOMP_TIME_BIN_YEARS).
export const DISPLAY_TIME_BIN_MIN_YEARS = parseInt(process.env.DISPLAY_TIME_BIN_MIN_YEARS || '10', 10) || 10;
export const DISPLAY_TIME_BIN_MAX_YEARS = parseInt(process.env.DISPLAY_TIME_BIN_MAX_YEARS || '100', 10) || 100;
