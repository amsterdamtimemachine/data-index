// Feature list pagination

// Default page size when the client doesn't specify one.
export const DEFAULT_PAGE_SIZE = parseInt(process.env.DEFAULT_PAGE_SIZE || '50', 10) || 50;

// Hard ceiling on page size (server-side validation) — caps response size and
// per-request cost regardless of what the client asks for.
export const PAGE_SIZE_MAX = parseInt(process.env.PAGE_SIZE_MAX || '200', 10) || 200;
