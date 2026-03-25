// Heatmap grid configuration

// Default display grid resolution
export const GRID_DEFAULT = parseInt(process.env.GRID_DEFAULT || '75', 10) || 75;

// Configurable grid resolution bounds (server-side validation)
export const GRID_MIN = parseInt(process.env.GRID_MIN || '10', 10) || 10;
export const GRID_MAX = parseInt(process.env.GRID_MAX || '200', 10) || 200;

// Base resolution for pre-computed feature_cells table (in meters)
export const CELL_SIZE_METERS = parseInt(process.env.CELL_SIZE_METERS || '100', 10) || 100;
