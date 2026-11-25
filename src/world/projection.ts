// Sinusoidal projeksjon sentrert på 15°Ø – gir et kjent "Norgeskart"-utseende.
export const TILE_KM = 7;
const KM_PER_DEG = 111.2;
const LON0 = 15;
export const X_MIN = -740;
export const X_MAX = 660;
export const LAT_MIN = 57.0;
export const LAT_MAX = 71.4;
export const MAP_W = Math.round((X_MAX - X_MIN) / TILE_KM);
export const MAP_H = Math.round(((LAT_MAX - LAT_MIN) * KM_PER_DEG) / TILE_KM);

/** lon/lat -> kontinuerlige flis-koordinater (i østover, j sørover) */
export function llToTile(lon: number, lat: number): [number, number] {
  const x = (lon - LON0) * Math.cos((lat * Math.PI) / 180) * KM_PER_DEG;
  const y = lat * KM_PER_DEG;
  return [(x - X_MIN) / TILE_KM, (LAT_MAX * KM_PER_DEG - y) / TILE_KM];
}

export function tileToLL(i: number, j: number): [number, number] {
  const y = LAT_MAX * KM_PER_DEG - j * TILE_KM;
  const lat = y / KM_PER_DEG;
  const x = i * TILE_KM + X_MIN;
  const lon = LON0 + x / (KM_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return [lon, lat];
}

export function llToTileInt(lon: number, lat: number): [number, number] {
  const [i, j] = llToTile(lon, lat);
  return [Math.floor(i), Math.floor(j)];
}
