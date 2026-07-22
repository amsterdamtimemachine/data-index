// Default bin size for time slices (years)
export const DEFAULT_BIN_SIZE = parseInt(process.env.DEFAULT_BIN_SIZE || '50', 10) || 50;

// Validation bounds for configurable bin size
export const BIN_SIZE_MIN = parseInt(process.env.BIN_SIZE_MIN || '10', 10) || 10;
export const BIN_SIZE_MAX = parseInt(process.env.BIN_SIZE_MAX || '100', 10) || 100;

// Width of the base time bin (years). cell_features buckets features per base bin at
// rebuild-index time; display bins are unions of whole base bins, so a display bin size
// that isn't a multiple of this can't be answered exactly.
//
// This shapes stored data, not just a computed value: the buckets in cell_features are
// keyed by it. Changing it requires `db:rebuild-index` — otherwise the queries fold base
// bins using the new width while the table still holds buckets at the old one, and the
// counts go quietly wrong (an *increase* still happens to work, since the old bins nest
// inside the new; a decrease cannot, as a bucket can't be split back apart).
export const BASE_BIN_SIZE = parseInt(process.env.BASE_BIN_SIZE || '10', 10) || 10;
