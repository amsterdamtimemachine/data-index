/**
 * The index's territory as the municipality boundary from db:fetch draws it (a
 * GeoJSON FeatureCollection in RD/28992): whether a WGS84 point lies inside it. The
 * extractors keep the source's records inside it, as the buildings ingest does.
 */
import { readFileSync } from 'fs';
import proj4 from 'proj4';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

// RD New / Amersfoort, the standard 7-parameter Bessel definition
proj4.defs(
  'EPSG:28992',
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 '
    + '+x_0=155000 +y_0=463000 +ellps=bessel '
    + '+towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs'
);
const toRd = proj4('WGS84', 'EPSG:28992');

export type Scope = (lon: number, lat: number) => boolean;

function inRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// inside the outer ring and in none of its holes
function inPolygon(x: number, y: number, rings: Position[][]): boolean {
  return inRing(x, y, rings[0]) && !rings.slice(1).some((hole) => inRing(x, y, hole));
}

export function loadScope(boundaryPath: string): Scope {
  const boundary = JSON.parse(readFileSync(boundaryPath, 'utf8')) as FeatureCollection<Polygon | MultiPolygon>;
  if (!boundary.features?.length) {
    throw new Error(`${boundaryPath} holds no municipality`);
  }
  const polygons = boundary.features.flatMap((f) => {
    if (f.geometry.type === 'Polygon') {
      return [f.geometry.coordinates];
    }
    return f.geometry.coordinates;
  });
  return (lon, lat) => {
    const [x, y] = toRd.forward([lon, lat]);
    return polygons.some((rings) => inPolygon(x, y, rings));
  };
}
