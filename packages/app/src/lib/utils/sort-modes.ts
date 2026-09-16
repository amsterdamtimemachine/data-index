/** The cell view's sort modes, as offered in the UI. bestMatch is only offered
 * while a text search is active — it ranks by match quality against the query. */
export type UiSortMode = 'sample' | 'spatial' | 'temporal' | 'relevance' | 'oldest' | 'newest' | 'bestMatch';
export const UI_SORT_MODES: UiSortMode[] = ['sample', 'spatial', 'temporal', 'relevance', 'oldest', 'newest', 'bestMatch'];
