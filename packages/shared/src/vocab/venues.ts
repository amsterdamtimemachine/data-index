/** The Schema.org kinds an event's venue can be, and the catch-all for a hall, club premises or an unknown kind. */
export const VENUE_KINDS = ['MovieTheater', 'PerformingArtsTheater', 'EventVenue'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];
export const VENUE_KIND_FALLBACK: VenueKind = 'EventVenue';
