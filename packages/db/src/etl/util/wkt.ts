/** A GeoJSON geometry as WKT, coordinates as they are (no reprojection). */
import type { Geometry, Position } from 'geojson';

const pts = (cs: Position[]) => cs.map(([x, y]) => `${x} ${y}`).join(', ');

export function toWkt(g: Geometry): string {
  switch (g.type) {
    case 'Point': return `POINT(${g.coordinates[0]} ${g.coordinates[1]})`;
    case 'MultiPoint': return `MULTIPOINT(${pts(g.coordinates)})`;
    case 'LineString': return `LINESTRING(${pts(g.coordinates)})`;
    case 'MultiLineString': return `MULTILINESTRING(${g.coordinates.map(l => `(${pts(l)})`).join(', ')})`;
    case 'Polygon': return `POLYGON(${g.coordinates.map(r => `(${pts(r)})`).join(', ')})`;
    case 'MultiPolygon': return `MULTIPOLYGON(${g.coordinates.map(p => `(${p.map(r => `(${pts(r)})`).join(', ')})`).join(', ')})`;
    default: throw new Error(`Unsupported geometry type: ${g.type}`);
  }
}

/** A WGS84 point as WKT, longitude first. */
export function pointWkt(lon: number, lat: number): string {
  return toWkt({ type: 'Point', coordinates: [lon, lat] });
}
