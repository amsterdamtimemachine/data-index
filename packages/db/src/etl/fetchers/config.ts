export interface Gemeente {
  name: string;
  code: string;
  year?: string;
}

export const AMSTERDAM: Gemeente = { name: 'Amsterdam', code: 'GM0363' };
export const WEESP: Gemeente = { name: 'Weesp', code: 'GM0457' };

// The shipped territory. Ingestion and the grid frame both follow from this list;
// each fetcher's gemeenten() is a refinement of it (a source is skipped where
// another source already owns that layer). Expanding scope starts here.
export const ACTIVE_SCOPE: Gemeente[] = [AMSTERDAM, WEESP];

