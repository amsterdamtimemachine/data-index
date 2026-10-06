import type { PlaceSource } from '../types/feature';

/**
 * The institution behind each place source. Seeded into `organisations` (the same
 * table dataset providers live in) so `place.source` is a foreign key to it, and
 * the feature query joins it to render a clickable provider on the card. Keyed by
 * PlaceSource, so a new source can't be added without giving it a provider here.
 */
export const PLACE_PROVIDERS: Record<PlaceSource, { label: string; url: string }> = {
  adamlink: { label: 'Adamlink', url: 'https://adamlink.nl' },
  cbs: { label: 'CBS', url: 'https://www.cbs.nl' },
  nwb: { label: 'NWB', url: 'https://www.rijkswaterstaat.nl' },
  bag: { label: 'BAG', url: 'https://www.kadaster.nl' },
};
