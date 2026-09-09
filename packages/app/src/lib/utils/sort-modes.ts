/** The cell view's sort modes, as offered in the UI. bestMatch is only offered
 * while a search term or a tag selection is active — it ranks by how well a
 * feature answers them. */
export type UiSortMode = 'sample' | 'spatial' | 'temporal' | 'relevance' | 'oldest' | 'newest' | 'bestMatch';
export const UI_SORT_MODES: UiSortMode[] = ['sample', 'spatial', 'temporal', 'relevance', 'oldest', 'newest', 'bestMatch'];
