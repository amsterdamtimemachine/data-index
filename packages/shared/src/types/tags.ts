/** A tag and how many features carry it under the current filters. */
export interface TagCount {
  id: string;
  count: number;
}

/** /api/available-tags: every tag in the index, counted under the request's filters. */
export interface AvailableTags {
  tags: TagCount[];
}
