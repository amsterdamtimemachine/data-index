// Heatmap grid configuration
// These determine the resolution of the heatmap visualization

// Display grid (what the frontend renders)
export const GRID_ROWS = 75;
export const GRID_COLS = 75;

// Base resolution for pre-computed feature_cells table (in meters)
// Finer than display grid to allow flexible aggregation
export const CELL_SIZE_METERS = 100;
