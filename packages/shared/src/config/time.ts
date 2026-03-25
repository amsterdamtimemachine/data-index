// Default bin size for time slices (years)
export const DEFAULT_BIN_SIZE = parseInt(process.env.DEFAULT_BIN_SIZE || '50', 10) || 50;

// Validation bounds for configurable bin size
export const BIN_SIZE_MIN = parseInt(process.env.BIN_SIZE_MIN || '10', 10) || 10;
export const BIN_SIZE_MAX = parseInt(process.env.BIN_SIZE_MAX || '100', 10) || 100;
