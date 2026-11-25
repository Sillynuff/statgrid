import { NORWAY_POLY, ISLANDS, FOREIGN_POLY, BALTIC_POLY, FJORDS, LAKES, MOUNTAINS, LL } from '../data/geo';
import { MAP_W, MAP_H, tileToLL, llToTile } from './projection';
import { fbm, clamp, smoothstep } from './noise';

export const T_SEA = 0, T_LAND = 1, T_FOREIGN = 2, T_LAKE = 3;

export const RIVERS: LL[][] = [
  [[11.95, 61.95], [11.5, 61.2], [11.2, 60.6], [11.6, 60.2], [11.2, 59.7], [11.0, 59.25]], // Glomma
  [[9.3, 61.1], [9.9, 60.4], [10.1, 60.0], [10.2, 59.75]], // Begna/Drammenselva
  [[8.4, 60.4], [9.4, 59.7], [10.0, 59.1]], // Numedalslågen
  [[8.6, 59.88], [9.2, 59.5], [9.6, 59.2]], // Skiensvassdraget
  [[7.4, 59.4], [7.8, 58.6], [8.0, 58.2]], // Otra
  [[8.4, 61.95], [9.6, 61.6], [10.45, 61.15]], // Gudbrandsdalslågen
  [[13.2, 64.9], [12.3, 64.6], [11.55, 64.5]], // Namsen
  [[9.0, 62.6], [9.6, 63.0], [10.3, 63.35]], // Orkla/Gaula
  [[14.6, 66.0], [14.1, 66.3]], // Ranaelva
  [[16.0, 67.15], [15.4, 67.25]], // Sulitjelma/Saltdal
  [[23.5, 69.3], [23.3, 69.95]], // Altaelva
  [[25.7, 69.4], [27.2, 70.0], [28.2, 70.3]], // Tana
  [[29.1, 69.15], [30.0, 69.6]], // Pasvik
  [[8.5, 62.3], [8.6, 62.65]], // Aura
  [[7.3, 61.6], [7.7, 61.3]], // Årdal
  [[6.6, 59.8], [6.4, 59.68]], // Sauda
  [[6.8, 60.1], [6.6, 60.07]], // Tyssedal
  [[6.9, 59.0], [7.4, 59.4]], // Lysebotn/Sira
];

/**
 * Historiske fossefall nær Kristiania som var blant de første som ble bygd ut.
 * Sørger for at det alltid finnes gode elvekraftsteder innen rekkevidde av 22 kV-nettet i kapittel 1.
 * [lon, lat, potensial 0–1, navn]
 */
export const HYDRO_SITES: [number, number, number, string][] = [
  [11.08, 59.62, 0.72, 'Glomma (Kykkelsrud)'],
  [10.26, 60.17, 0.66, 'Begna (Hønefoss)'],
];

export interface Terrain {
  W: number; H: number;
  type: Uint8Array;
  level: Int8Array;
  river: Uint8Array;
  forest: Uint8Array;
  dSea: Uint16Array; // land: avstand til åpent hav
  dLand: Uint16Array; // sjø: avstand til land
  hydro: Float32Array;
  wind: Float32Array;
  solar: Float32Array;
  lat: Float32Array;
  lon: Float32Array;
}

function pointInPoly(x: number, y: number, poly: LL[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function bfs(W: number, H: number, seeds: (idx: number) => boolean, passable: (idx: number) => boolean): Uint16Array {
  const d = new Uint16Array(W * H).fill(65535);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  for (let k = 0; k < W * H; k++) if (seeds(k)) { d[k] = 0; q[qt++] = k; }
  while (qh < qt) {
    const k = q[qh++];
    const i = k % W, j = (k / W) | 0;
    const nd = d[k] + 1;
    const nb = [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, j > 0 ? k - W : -1, j < H - 1 ? k + W : -1];
    for (const n of nb) {
      if (n >= 0 && d[n] > nd && passable(n)) { d[n] = nd; q[qt++] = n; }
    }
  }
  return d;
}

/** Tegner en polylinje i flis-rom og kaller cb for hver flis innenfor bredden w */
function stampPolyline(pts: LL[], w: number, cb: (i: number, j: number, dist: number) => void) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, ay] = llToTile(pts[s][0], pts[s][1]);
    const [bx, by] = llToTile(pts[s + 1][0], pts[s + 1][1]);
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(len * 3) + 1;
    for (let t = 0; t <= steps; t++) {
      const px = ax + ((bx - ax) * t) / steps, py = ay + ((by - ay) * t) / steps;
      const r = Math.ceil(w + 1);
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const ci = Math.floor(px) + di, cj = Math.floor(py) + dj;
          const dist = Math.hypot(ci + 0.5 - px, cj + 0.5 - py);
          if (dist <= w) cb(ci, cj, dist);
        }
    }
  }
}

export function generateTerrain(): Terrain {
  const W = MAP_W, H = MAP_H, N = W * H;
  const type = new Uint8Array(N);
  const lat = new Float32Array(N), lon = new Float32Array(N);

  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const [lo, la] = tileToLL(i + 0.5, j + 0.5);
      lat[k] = la; lon[k] = lo;
      if (pointInPoly(lo, la, NORWAY_POLY) || ISLANDS.some((p) => pointInPoly(lo, la, p))) type[k] = T_LAND;
      else if (pointInPoly(lo, la, FOREIGN_POLY) && !pointInPoly(lo, la, BALTIC_POLY)) type[k] = T_FOREIGN;
      else type[k] = T_SEA;
    }

  const inB = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H;
  // Avstand til åpent hav før fjordene graves ut (gir bratte fjordsider)
  const dSea = bfs(W, H, (k) => type[k] === T_SEA, (k) => type[k] !== T_SEA);
  const dBorder = bfs(W, H, (k) => type[k] === T_FOREIGN, (k) => type[k] === T_LAND);
  const dNorway = bfs(W, H, (k) => type[k] === T_LAND, (k) => type[k] === T_FOREIGN);

  for (const f of FJORDS)
    stampPolyline(f.pts, f.w, (i, j) => { if (inB(i, j) && type[j * W + i] === T_LAND) type[j * W + i] = T_SEA; });
  for (const l of LAKES)
    stampPolyline(l.pts, l.w, (i, j) => { if (inB(i, j) && type[j * W + i] === T_LAND) type[j * W + i] = T_LAKE; });

  const river = new Uint8Array(N);
  const riverNear = new Float32Array(N);
  const valley = new Float32Array(N);
  for (const r of RIVERS) {
    stampPolyline(r, 0.55, (i, j) => { if (inB(i, j) && type[j * W + i] === T_LAND) river[j * W + i] = 1; });
    stampPolyline(r, 2.5, (i, j, d) => { if (inB(i, j)) { const k = j * W + i; riverNear[k] = Math.max(riverNear[k], 1 - d / 2.5); } });
    stampPolyline(r, 5, (i, j, d) => { if (inB(i, j)) { const k = j * W + i; valley[k] = Math.max(valley[k], 1 - d / 5); } });
  }
  // Daler innover fra fjordbunnene
  for (const f of FJORDS) {
    const end = f.pts[f.pts.length - 1], prev = f.pts[f.pts.length - 2];
    const ext: LL = [end[0] + (end[0] - prev[0]) * 1.2, end[1] + (end[1] - prev[1]) * 1.2];
    stampPolyline([end, ext], 4, (i, j, d) => { if (inB(i, j)) { const k = j * W + i; valley[k] = Math.max(valley[k], (1 - d / 4) * 0.8); } });
  }

  const dLand = bfs(W, H, (k) => type[k] === T_LAND || type[k] === T_FOREIGN, (k) => type[k] === T_SEA || type[k] === T_LAKE);

  // Høyder
  const level = new Int8Array(N);
  const hRaw = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const la = lat[k], lo = lon[k];
    const t = type[k];
    if (t === T_SEA) {
      const dl = dLand[k];
      level[k] = dl <= 2 ? -1 : dl <= 7 ? -2 : -3;
      continue;
    }
    const cosl = Math.cos((la * Math.PI) / 180);
    let m = 0;
    for (const [mx, my, amp, r] of MOUNTAINS) {
      const dx = (lo - mx) * cosl, dy = la - my;
      m += amp * Math.exp(-(dx * dx + dy * dy) / (r * r));
    }
    const n1 = fbm(lo * 1.3, la * 2.6, 4, 7);
    const n2 = fbm(lo * 4.0, la * 8.0, 3, 11);
    let h: number;
    if (t === T_FOREIGN) {
      const toward = Math.exp(-dNorway[k] / 7);
      h = 1 + 2.2 * n1 + 0.8 * n2 + m * 0.7 + 3.2 * toward * (la > 61.5 ? 1 : 0.4);
      h *= smoothstep(-0.5, 4, dSea[k]) * 0.6 + 0.4;
    } else {
      const ridged = 1 - Math.abs(2 * fbm(lo * 2.2, la * 4.4, 3, 31) - 1);
      h = 0.8 + 2.4 * n1 + 1.6 * n2 + m * (0.55 + 0.7 * ridged);
      const westness = clamp((9.6 - lo) / 3, 0, 1) * (la > 58.6 && la < 63.4 ? 1 : 0);
      h += 2.2 * westness * smoothstep(1, 6, dSea[k]);
      h *= 0.88;
      if (la > 64) h += 3.4 * Math.exp(-dBorder[k] / 5);
      // Lavland rundt Oslo, Trondheim og på Jæren
      const lowland = (x: number, y: number, r: number) => {
        const dx = (lo - x) * cosl, dy = la - y;
        return Math.exp(-(dx * dx + dy * dy) / (r * r));
      };
      h *= 1 - 0.55 * lowland(10.9, 59.9, 1.0) - 0.4 * lowland(10.8, 63.6, 0.7) - 0.6 * lowland(5.65, 58.75, 0.35) - 0.3 * lowland(10.2, 59.2, 0.6);
      h *= smoothstep(-0.5, 5, dSea[k]) * 0.7 + 0.3;
      h *= 1 - 0.55 * valley[k] * smoothstep(1, 4, h);
      if (river[k]) h *= 0.75;
    }
    hRaw[k] = h;
    level[k] = clamp(Math.round(h), 1, 14);
    if (t === T_LAKE) level[k] = clamp(Math.round(h * 0.55), 1, 8);
  }

  // Ressurspotensial
  const hydro = new Float32Array(N), wind = new Float32Array(N), solar = new Float32Array(N);
  const forest = new Uint8Array(N);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const la = lat[k], lo = lon[k], t = type[k];
      if (t === T_LAND || t === T_FOREIGN) {
        let maxDiff = 0, nearWater = 0;
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            if (!inB(i + di, j + dj)) continue;
            const n = (j + dj) * W + i + di;
            if (type[n] === T_LAND || type[n] === T_FOREIGN) maxDiff = Math.max(maxDiff, level[k] - level[n]);
            else nearWater = 1;
          }
        const rain = la < 64 ? 0.55 + 0.45 * clamp((10.5 - lo) / 4.5, 0, 1) : 0.75;
        let hp = (0.1 * maxDiff + 0.035 * level[k]) * rain + 0.55 * riverNear[k] + 0.08 * nearWater;
        if (t === T_FOREIGN) hp *= 0.6;
        else {
          const cosl = Math.cos((la * Math.PI) / 180);
          for (const [sx, sy, peak] of HYDRO_SITES) {
            const dxk = (lo - sx) * cosl * 111, dyk = (la - sy) * 111;
            hp = Math.max(hp, peak * Math.exp(-(dxk * dxk + dyk * dyk) / (11 * 11)));
          }
        }
        hydro[k] = clamp(hp, 0, 1);
        const north = la > 63 ? 0.12 : 0;
        wind[k] = clamp(0.18 + 0.55 * Math.exp(-(dSea[k] - 1) / 2.5) + 0.025 * level[k] + north + 0.1 * (n2(lo, la) - 0.5), 0, 1);
        solar[k] = clamp(1.05 - (la - 58) * 0.06 - level[k] * 0.02, 0.05, 1);
        const fn = fbm(lo * 6, la * 12, 2, 5);
        forest[k] = t === T_LAND && level[k] >= 2 && level[k] <= 7 && la < 69.3 && fn > 0.42 && !river[k] ? 1 : 0;
      } else if (t === T_SEA) {
        const dl = dLand[k];
        wind[k] = dl >= 2 && dl <= 32 ? clamp(0.5 + 0.35 * clamp(dl / 12, 0, 1) + (la > 62 ? 0.05 : 0), 0, 1) : 0;
      }
    }

  return { W, H, type, level, river, forest, dSea, dLand, hydro, wind, solar, lat, lon };
}

function n2(lo: number, la: number) {
  return fbm(lo * 3, la * 6, 2, 23);
}
