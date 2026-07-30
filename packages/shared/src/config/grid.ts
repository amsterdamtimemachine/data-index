// Spatial grid configuration.
//
// PRECOMP_* shapes the precomputed index (place_cells / cell_features) and is baked in
// by db:rebuild-index — changing it requires a rebuild. DISPLAY_* only affects how a
// request aggregates those base cells for rendering — a restart is enough.

// Base cell size (metres) of the precomputed spatial grid. The finest resolution the
// map can show; display grids aggregate whole base cells, never split them.
export const PRECOMP_GRID_CELL_METERS = parseInt(process.env.PRECOMP_GRID_CELL_METERS || '100', 10) || 100;

// Default display grid width (columns); rows follow the data's aspect ratio.
export const DISPLAY_GRID_DEFAULT_COLS = parseInt(process.env.DISPLAY_GRID_DEFAULT_COLS || '125', 10) || 125;

// Bounds the requested column count is clamped to (server-side validation).
export const DISPLAY_GRID_MIN_COLS = parseInt(process.env.DISPLAY_GRID_MIN_COLS || '10', 10) || 10;
export const DISPLAY_GRID_MAX_COLS = parseInt(process.env.DISPLAY_GRID_MAX_COLS || '200', 10) || 200;
