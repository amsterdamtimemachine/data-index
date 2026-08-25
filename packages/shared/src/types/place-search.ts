import type { PlaceType, PlaceSource } from './feature';

/** One match from the place-name search over the gazetteer. */
export type PlaceSearchMatch = {
  placeId: string;
  /** Current name of the place (may differ from what matched). */
  name: string | null;
  type: PlaceType;
  source: PlaceSource | null;
  /** The name that matched the query: the current one or a historical one. */
  matchedName: string;
  /** Id of the matched place_historical_name row; null for a current-name match. */
  matchedNameId: string | null;
  /** [since, until] when a historical name matched; null for a current-name match. */
  matchedWindow: [string | null, string | null] | null;
  /** [since, until] of the place's geometry when dated (historical area divisions); null otherwise. */
  geometryWindow: [string | null, string | null] | null;
  featureCount: number;
  /**
   * Display-grid cell indices (row * cols + col) the place covers, in the same
   * coordinate space as heatmap indices at the requested resolution.
   */
  cells: number[];
};
