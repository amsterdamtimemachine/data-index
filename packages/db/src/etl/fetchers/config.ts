export interface Gemeente {
  name: string;
  code: string;
  year?: string;
}

export const AMSTERDAM: Gemeente = { name: 'Amsterdam', code: 'GM0363' };
export const WEESP: Gemeente = { name: 'Weesp', code: 'GM0457' };

