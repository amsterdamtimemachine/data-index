// Heatmap grid configuration

// Default display grid resolution
export const GRID_DEFAULT = 75;

// Configurable grid resolution bounds (server-side validation)
export const GRID_MIN = 10;
export const GRID_MAX = 200;

// Base resolution for pre-computed feature_cells table (in meters)
// Finer than display grid to allow flexible aggregation
export const CELL_SIZE_METERS = 100;
