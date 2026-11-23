/** A filter value and how many features it would leave under the other filters. */
export interface ValueCount {
  id: string;
  count: number;
}

/**
 * /api/filter-counts: what each filter value is worth under the current filters,
 * the period and the scope. A category's values are counted under the other
 * categories, the search and the tags; the tags under every category and the
 * search, and under the selected tags too when they combine with AND. `total` is
 * the population under everything. A value without features is left out.
 */
export interface FilterCounts {
  total: number;
  recordTypes: ValueCount[];
  datasets: ValueCount[];
  placeTypes: ValueCount[];
  tags: ValueCount[];
}
