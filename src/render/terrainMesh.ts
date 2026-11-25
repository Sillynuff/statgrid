import * as THREE from 'three';
import { Terrain, T_SEA, T_LAND, T_FOREIGN, T_LAKE } from '../world/terrain';
import { clamp, lerp, valueNoise } from '../world/noise';

export const VH = 0.5; // høyde per nivå
export const SEA_Y = -0.08;

export function tileTop(t: Terrain, k: number): number {
  const ty = t.type[k];
  if (ty === T_SEA) return t.level[k] * 0.35;
  return t.level[k] * VH;
}
/** Overflatehøyde der man kan plassere ting (vannflate for sjø) */
export function surfaceY(t: Terrain, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= t.W || j >= t.H) return SEA_Y;
  const k = j * t.W + i;
  return t.type[k] === T_SEA ? SEA_Y : tileTop(t, k);
}

export type Overlay = 'none' | 'hydro' | 'wind' | 'offshore' | 'solar' | 'coast';

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
const C = {
  grass: hex('#86b85a'), grassN: hex('#9fb06c'), forest: hex('#5f9348'), heath: hex('#9d9d6e'),
  rock: hex('#8f8a82'), snow: hex('#f3f6fa'), beach: hex('#d9cc95'), river: hex('#4fa6d8'), lake: hex('#5aaee0'),
  seaShallow: hex('#5e9c9a'), seaDeep: hex('#1f4a6e'), foreignDark: hex('#7d8794'), foreignLight: hex('#a9b1bc'),
};
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function heat(q: number): RGB {
  // rød -> gul -> grønn -> cyan
  const stops: [number, RGB][] = [[0, hex('#7b2a2a')], [0.3, hex('#c9573a')], [0.5, hex('#f0c040')], [0.7, hex('#7fd65a')], [1, hex('#2fe0c8')]];
  for (let s = 1; s < stops.length; s++) {
    if (q <= stops[s][0]) {
      const t = (q - stops[s - 1][0]) / (stops[s][0] - stops[s - 1][0]);
      return mix(stops[s - 1][1], stops[s][1], t);
    }
  }
  return stops[stops.length - 1][1];
}

export class TerrainMesh {
  mesh: THREE.Mesh;
  water: THREE.Mesh;
  private t: Terrain;
  private vTile: Uint32Array;
  private vShade: Float32Array;
  private colors: Float32Array;
  private tileColor: Float32Array;
  private jitter: Float32Array;
  snowy: Uint8Array;
  overlay: Overlay = 'none';
  overlayQuality: ((i: number, j: number) => number) | null = null;
  private lastSnowKey = '';

  constructor(t: Terrain) {
    this.t = t;
    const W = t.W, H = t.H;
    const pos: number[] = [], nor: number[] = [], tileIdx: number[] = [], shade: number[] = [];
    const idx: number[] = [];
    const top = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? -1.2 : tileTop(t, j * W + i));
    this.jitter = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) this.jitter[k] = valueNoise((k % W) * 0.9, Math.floor(k / W) * 0.9, 3) * 0.5 + Math.random() * 0.5;

    const quad = (p: number[][], n: number[], k: number, sh: number[]) => {
      const base = pos.length / 3;
      for (let q = 0; q < 4; q++) {
        pos.push(p[q][0], p[q][1], p[q][2]);
        nor.push(n[0], n[1], n[2]);
        tileIdx.push(k);
        shade.push(sh[q]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const y = top(i, j);
        // Voxel-AO på toppflaten
        const occ = (di: number, dj: number) => (top(i + di, j + dj) > y + 0.01 ? 1 : 0);
        const ao = (s1: number, s2: number, c: number) => (s1 && s2 ? 0.62 : 1 - (s1 + s2 + c) * 0.11);
        const nN = occ(0, -1), nS = occ(0, 1), nW = occ(-1, 0), nE = occ(1, 0);
        const aNW = ao(nN, nW, occ(-1, -1)), aNE = ao(nN, nE, occ(1, -1));
        const aSE = ao(nS, nE, occ(1, 1)), aSW = ao(nS, nW, occ(-1, 1));
        quad([[i, y, j], [i, y, j + 1], [i + 1, y, j + 1], [i + 1, y, j]], [0, 1, 0], k, [aNW, aSW, aSE, aNE]);
        // Sider
        const sides: [number, number, number[][], number[]][] = [
          [0, -1, [[i + 1, 0, j], [i, 0, j]], [0, 0, -1]],
          [0, 1, [[i, 0, j + 1], [i + 1, 0, j + 1]], [0, 0, 1]],
          [-1, 0, [[i, 0, j], [i, 0, j + 1]], [-1, 0, 0]],
          [1, 0, [[i + 1, 0, j + 1], [i + 1, 0, j]], [1, 0, 0]],
        ];
        for (const [di, dj, e, n] of sides) {
          const ny = top(i + di, j + dj);
          if (ny >= y - 0.001) continue;
          const sideLight = n[0] !== 0 ? 0.82 : n[2] > 0 ? 0.9 : 0.7;
          const bottomShade = sideLight * 0.62;
          quad([[e[0][0], y, e[0][2]], [e[0][0], ny, e[0][2]], [e[1][0], ny, e[1][2]], [e[1][0], y, e[1][2]]], n, k,
            [sideLight, bottomShade, bottomShade, sideLight]);
        }
      }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.colors = new Float32Array(pos.length);
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    g.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    this.vTile = new Uint32Array(tileIdx);
    this.vShade = new Float32Array(shade);
    this.tileColor = new Float32Array(W * H * 3);
    this.snowy = new Uint8Array(W * H);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;

    const wg = new THREE.PlaneGeometry(W + 400, H + 400, 1, 1);
    wg.rotateX(-Math.PI / 2);
    wg.translate(W / 2, SEA_Y, H / 2);
    const wm = new THREE.MeshPhongMaterial({ color: 0x2f79a8, transparent: true, opacity: 0.8, shininess: 90, specular: 0x88aacc, depthWrite: false });
    this.water = new THREE.Mesh(wg, wm);
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
  }

  /** Snøgrense (nivå) for gitt uke og breddegrad */
  snowLevel(woy: number, lat: number, lon: number): number {
    const s = (1 + Math.cos((2 * Math.PI * (woy - 5)) / 52)) / 2; // 1 = vinter
    const summer = 11.5 - (lat - 58) * 0.42;
    const westCoast = lon < 7.5 && lat < 63 ? 1.8 : 0;
    const winter = 1.6 + westCoast - (lat - 58) * 0.12;
    return lerp(summer, winter, Math.pow(s, 0.8));
  }

  recolor(woy: number, force = false) {
    const t = this.t;
    const key = `${Math.round(woy / 2)}:${this.overlay}`;
    if (!force && key === this.lastSnowKey) return false;
    this.lastSnowKey = key;
    const W = t.W, N = t.W * t.H;
    const ov = this.overlay;
    for (let k = 0; k < N; k++) {
      const ty = t.type[k], L = t.level[k], la = t.lat[k], lo = t.lon[k];
      const jit = this.jitter[k];
      let c: RGB;
      let snow = false;
      if (ty === T_SEA) {
        c = mix(C.seaShallow, C.seaDeep, clamp((-L - 1) / 2 + (t.dLand[k] > 3 ? 0.3 : 0), 0, 1));
        if (ov === 'offshore') {
          const q = this.overlayQuality ? this.overlayQuality(k % W, Math.floor(k / W)) : 0;
          c = q > 0 ? mix(c, heat(q), 0.85) : mix(c, [0.15, 0.2, 0.3], 0.5);
        }
      } else if (ty === T_LAKE) {
        c = C.lake;
        const sl = this.snowLevel(woy, la, lo);
        if (L + 0.8 >= sl + 1.5) { c = mix(c, C.snow, 0.75); }
      } else {
        const north = clamp((la - 66) / 3, 0, 1);
        const low = mix(C.grass, C.grassN, north);
        if (L <= 1 && t.dSea[k] <= 1 && jit > 0.55) c = mix(low, C.beach, 0.3);
        else if (L <= 3) c = mix(low, C.forest, clamp((L - 1) / 2, 0, 1) * 0.6);
        else if (L <= 6) c = mix(C.forest, C.heath, clamp((L - 4) / 3, 0, 1));
        else if (L <= 9) c = mix(C.heath, C.rock, clamp((L - 6) / 3, 0, 1));
        else c = C.rock;
        if (t.river[k]) c = C.river;
        const sl = this.snowLevel(woy, la, lo);
        if (L + (jit - 0.5) * 1.4 >= sl) { c = mix(c, C.snow, t.river[k] ? 0.5 : 0.92); snow = true; }
        if (ty === T_FOREIGN) {
          // Utlandet: ren, dempet blågrå. Bare lysheten varierer svakt med høyde/snø, ingen andre fargetoner.
          c = mix(C.foreignDark, C.foreignLight, clamp(L / 10, 0, 1) * 0.6 + (snow ? 0.25 : 0));
        }
        if (ov !== 'none' && ov !== 'offshore') {
          const q = ty === T_LAND && this.overlayQuality ? this.overlayQuality(k % W, Math.floor(k / W)) : 0;
          const grey: RGB = [(c[0] + c[1] + c[2]) / 3 * 0.8, (c[0] + c[1] + c[2]) / 3 * 0.8, (c[0] + c[1] + c[2]) / 3 * 0.85];
          c = ty === T_LAND ? (q > 0 ? mix(grey, heat(q), 0.82) : mix(grey, [0.25, 0.22, 0.22], 0.35)) : mix(grey, [0.3, 0.3, 0.32], 0.4);
        }
      }
      this.snowy[k] = snow ? 1 : 0;
      const v = 0.94 + jit * 0.1;
      this.tileColor[k * 3] = c[0] * v;
      this.tileColor[k * 3 + 1] = c[1] * v;
      this.tileColor[k * 3 + 2] = c[2] * v;
    }
    const nv = this.vTile.length;
    const col = this.colors;
    for (let v = 0; v < nv; v++) {
      const k = this.vTile[v] * 3, s = this.vShade[v];
      col[v * 3] = this.tileColor[k] * s;
      col[v * 3 + 1] = this.tileColor[k + 1] * s;
      col[v * 3 + 2] = this.tileColor[k + 2] * s;
    }
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    const wm = this.water.material as THREE.MeshPhongMaterial;
    wm.opacity = ov === 'offshore' ? 0.25 : 0.8;
    return true;
  }

  setOverlay(ov: Overlay, q: ((i: number, j: number) => number) | null, woy: number) {
    this.overlay = ov;
    this.overlayQuality = q;
    this.recolor(woy, true);
  }
}
