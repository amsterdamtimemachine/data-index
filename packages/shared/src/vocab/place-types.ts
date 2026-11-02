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

/**
 * What a type's dates mean, and so what a resolver may do with them.
 * - register: the place has no period of its own; its dates are the records that
 *   noted it (an address, in the registers of 1802 to 1943)
 * - lifespan: the place existed from since to until (a street); outside that it is
 *   not a candidate
 * - vintage: a version of a division (a neighbourhood as drawn in one period); the
 *   version in force at the date is preferred, any version stands when none is
 */
export type PlaceTime = 'register' | 'lifespan' | 'vintage';

export interface PlaceTypeSpec {
  // how a feature's coordinate finds a place of this type: the nearest within the
  // type's cap (POINT_CAPS_M, config), or the place whose geometry contains the point
  point: 'distance' | 'containment';
  time: PlaceTime;
  nameEvidence: NameEvidence;
}

export const PLACE_TYPE_SPECS: Record<PlaceType, PlaceTypeSpec> = {
  address: { point: 'distance', time: 'register', nameEvidence: { kind: 'number' } },
  street: { point: 'distance', time: 'lifespan', nameEvidence: { kind: 'any' } },
  neighbourhood: { point: 'containment', time: 'vintage', nameEvidence: { kind: 'any' } },
  district: { point: 'containment', time: 'vintage', nameEvidence: { kind: 'any' } },
};
