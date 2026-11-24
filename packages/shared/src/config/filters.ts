// Server-side cap on how many items a comma-separated filter param may carry
// (tags, datasets, recordTypes, placeTypes). Bounds query complexity so a caller
// can't force a huge IN (…) / many-tag query. Generous vs. any real UI selection.
export const MAX_FILTER_ITEMS = parseInt(process.env.MAX_FILTER_ITEMS || '50', 10) || 50;
