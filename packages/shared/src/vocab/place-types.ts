/**
 * Every place type, finest first, and what each is to the index: the one definition
 * of the precision order the resolvers, the feature query and the place search rank
 * by, and of how a type is found and named. A type added here must be described in
 * PLACE_TYPE_SPECS; the compiler holds the two together.
 */
export const PLACE_TYPES = ['address', 'street', 'neighbourhood', 'district'] as const;

export type PlaceType = (typeof PLACE_TYPES)[number];

/** How a place's name counts as evidence when it is found in a text. */
export type NameEvidence =
  // a house designation: the name must carry a digit ("Kalverstraat 97", "G 439"),
  // so the street's name alone does not confirm a house on it
  | { kind: 'number' }
  | { kind: 'any' };

export interface PlaceTypeSpec {
  // how a feature's coordinate finds a place of this type: the nearest within the
  // type's cap (POINT_CAPS_M, config), or the place whose geometry contains the point
  point: 'distance' | 'containment';
  nameEvidence: NameEvidence;
}

export const PLACE_TYPE_SPECS: Record<PlaceType, PlaceTypeSpec> = {
  address: { point: 'distance', nameEvidence: { kind: 'number' } },
  street: { point: 'distance', nameEvidence: { kind: 'any' } },
  neighbourhood: { point: 'containment', nameEvidence: { kind: 'any' } },
  district: { point: 'containment', nameEvidence: { kind: 'any' } },
};
