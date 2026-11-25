import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false });
export const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

/** Bygger en sammenslått geometri av farga bokser */
export class Vox {
  private parts: THREE.BufferGeometry[] = [];
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string | number, rot?: [number, number, number]) {
    const g = new THREE.BoxGeometry(w, h, d);
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    const normals = g.getAttribute('normal');
    for (let v = 0; v < n; v++) {
      const ny = normals.getY(v);
      const s = ny > 0.5 ? 1 : ny < -0.5 ? 0.55 : 0.86;
      cols[v * 3] = c.r * s; cols[v * 3 + 1] = c.g * s; cols[v * 3 + 2] = c.b * s;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (rot) q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    this.parts.push(g);
    return this;
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    return g;
  }
}

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, fn: () => THREE.BufferGeometry) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key)!;
}

export interface ModelInstance {
  group: THREE.Group;
  rotors: THREE.Object3D[];
  smoke?: THREE.Vector3[];
}

function turbine(v: Vox | null, x: number, z: number, base: number, h = 1.7): THREE.Group {
  const g = new THREE.Group();
  const tower = new Vox().box(0, 0, 0, 0.07, h, 0.07, '#f2f2ee').box(0, h - 0.02, 0.04, 0.1, 0.09, 0.2, '#e6e6e0').build();
  g.add(new THREE.Mesh(tower, solidMat));
  const rotor = new THREE.Group();
  const rg = cached('rotor', () => {
    // bladene stråler ut fra navet (bladet starter i origo og peker opp)
    const parts: THREE.BufferGeometry[] = [];
    for (let b = 0; b < 3; b++) {
      const one = new Vox().box(0, 0.02, 0, 0.055, 0.6, 0.025, '#fbfbf8').build();
      one.rotateZ((b * Math.PI * 2) / 3);
      parts.push(one);
    }
    parts.push(new Vox().box(0, -0.045, 0, 0.09, 0.09, 0.06, '#dcdcd6').build());
    return mergeGeometries(parts, false)!;
  });
  rotor.add(new THREE.Mesh(rg, solidMat));
  rotor.position.set(0, h + 0.03, 0.15);
  g.add(rotor);
  g.position.set(x, base, z);
  g.userData.rotor = rotor;
  return g;
}

export function plantModel(type: string): ModelInstance {
  const group = new THREE.Group();
  const rotors: THREE.Object3D[] = [];
  let smoke: THREE.Vector3[] | undefined;
  switch (type) {
    case 'river': {
      const geo = cached('river', () => new Vox()
        .box(0, -0.3, -0.42, 0.95, 0.42, 0.42, '#3f8fc4') // inntak/elv
        .box(0, -0.3, -0.16, 0.95, 0.5, 0.14, '#b9b5aa') // dam
        .box(-0.32, -0.3, -0.16, 0.08, 0.56, 0.18, '#a8a398').box(0.32, -0.3, -0.16, 0.08, 0.56, 0.18, '#a8a398')
        .box(0.05, -0.3, 0.17, 0.52, 0.44, 0.36, '#b8502f') // kraftstasjon (teglstein)
        .box(0.05, 0.14, 0.17, 0.58, 0.08, 0.42, '#4b4b4f') // tak
        .box(-0.12, 0.0, 0.36, 0.08, 0.12, 0.01, '#ffe7a0').box(0.05, 0.0, 0.36, 0.08, 0.12, 0.01, '#ffe7a0').box(0.22, 0.0, 0.36, 0.08, 0.12, 0.01, '#ffe7a0')
        .box(-0.35, -0.3, 0.2, 0.18, 0.1, 0.4, '#7fc4ec') // utløp
        .build());
      group.add(new THREE.Mesh(geo, solidMat));
      break;
    }
    case 'reservoir': {
      const geo = cached('reservoir', () => {
        const v = new Vox();
        v.box(0, -0.2, -0.5, 1.5, 0.75, 0.75, '#2e7fb8'); // magasin
        for (let s = -2; s <= 2; s++) {
          const ang = s * 0.18;
          v.box(Math.sin(ang) * 1.6 * 0.5 + s * 0.08, -0.2, -0.05 + (1 - Math.cos(ang)) * 0.6, 0.34, 0.95, 0.16, '#d4d0c6', [0, -ang, 0]);
        }
        v.box(0, 0.75, -0.05, 1.5, 0.05, 0.12, '#bdb8ad');
        v.box(0.35, -0.2, 0.42, 0.48, 0.32, 0.34, '#e8e2d4').box(0.35, 0.12, 0.42, 0.52, 0.06, 0.38, '#5a5a60');
        v.box(-0.05, -0.2, 0.25, 0.07, 0.5, 0.35, '#55606b', [0.5, 0, 0]).box(0.12, -0.2, 0.25, 0.07, 0.5, 0.35, '#55606b', [0.5, 0, 0]);
        v.box(-0.4, -0.2, 0.45, 0.5, 0.08, 0.3, '#7fc4ec');
        return v.build();
      });
      group.add(new THREE.Mesh(geo, solidMat));
      break;
    }
    case 'wind': {
      const pos: [number, number][] = [[-0.35, -0.25], [0.35, -0.3], [0, 0.3], [-0.45, 0.45], [0.48, 0.32]];
      for (const [x, z] of pos) { const t = turbine(null, x, z, 0, 1.5 + Math.random() * 0.3); group.add(t); rotors.push(t.userData.rotor); }
      break;
    }
    case 'offshore': {
      const pos: [number, number][] = [[-0.6, -0.5], [0, -0.6], [0.6, -0.5], [-0.6, 0.1], [0.6, 0.1], [-0.3, 0.6], [0.3, 0.6]];
      for (const [x, z] of pos) {
        group.add(new THREE.Mesh(cached('owbase', () => new Vox().box(0, -0.3, 0, 0.14, 0.36, 0.14, '#f2c230').box(0, 0.04, 0, 0.22, 0.04, 0.22, '#9a9a9a').build()), solidMat).translateX(x).translateZ(z));
        const t = turbine(null, x, z, 0.08, 1.9); group.add(t); rotors.push(t.userData.rotor);
      }
      group.add(new THREE.Mesh(cached('owsub', () => new Vox().box(0, -0.3, 0, 0.1, 0.5, 0.1, '#f2c230').box(0, 0.2, 0, 0.36, 0.2, 0.3, '#e9e9e9').build()), solidMat));
      break;
    }
    case 'solar': {
      const geo = cached('solar', () => {
        const v = new Vox();
        for (let r = -1; r <= 1; r++)
          for (let c = -1; c <= 1; c++) {
            v.box(c * 0.3, 0, r * 0.28, 0.02, 0.08, 0.02, '#888');
            v.box(c * 0.3, 0.08, r * 0.28, 0.26, 0.025, 0.2, '#22427a', [-0.45, 0, 0]);
          }
        return v.build();
      });
      group.add(new THREE.Mesh(geo, solidMat));
      break;
    }
    case 'gas': {
      const geo = cached('gas', () => new Vox()
        .box(0, 0, 0.1, 0.8, 0.38, 0.5, '#c7c9cc').box(0, 0.38, 0.1, 0.84, 0.05, 0.54, '#7d8288')
        .box(-0.25, 0, -0.32, 0.13, 1.1, 0.13, '#efefef').box(-0.25, 0.85, -0.32, 0.14, 0.1, 0.14, '#cc3333')
        .box(0.05, 0, -0.32, 0.13, 1.1, 0.13, '#efefef').box(0.05, 0.85, -0.32, 0.14, 0.1, 0.14, '#cc3333')
        .box(0.32, 0, -0.32, 0.22, 0.3, 0.22, '#dfe6ea').build());
      group.add(new THREE.Mesh(geo, solidMat));
      smoke = [new THREE.Vector3(-0.25, 1.15, -0.32), new THREE.Vector3(0.05, 1.15, -0.32)];
      break;
    }
  }
  return { group, rotors, smoke };
}

export function stationModel(): THREE.Group {
  const geo = cached('station', () => new Vox()
    .box(0, 0, 0, 0.7, 0.04, 0.7, '#a9aaa6')
    .box(-0.15, 0.04, -0.1, 0.2, 0.2, 0.18, '#5b6066').box(0.15, 0.04, -0.1, 0.2, 0.2, 0.18, '#5b6066')
    .box(-0.25, 0.04, 0.22, 0.04, 0.42, 0.04, '#9aa0a6').box(0.25, 0.04, 0.22, 0.04, 0.42, 0.04, '#9aa0a6').box(0, 0.42, 0.22, 0.56, 0.04, 0.04, '#9aa0a6')
    .box(-0.36, 0.04, 0, 0.02, 0.12, 0.72, '#cfcfcf').box(0.36, 0.04, 0, 0.02, 0.12, 0.72, '#cfcfcf')
    .build());
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, solidMat));
  return g;
}

export function marketModel(flag: string[], sea: boolean): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox();
  if (sea) v.box(0, -0.4, 0, 1.2, 0.5, 1.0, '#7b8590');
  v.box(0, sea ? 0.1 : 0, 0, 1.0, 0.5, 0.7, '#eef0f2').box(0, sea ? 0.6 : 0.5, 0, 1.04, 0.06, 0.74, '#596470');
  v.box(0.62, sea ? 0.1 : 0, 0.3, 0.04, 1.4, 0.04, '#d0d0d0');
  const base = sea ? 1.1 : 1.0;
  const n = flag.length;
  for (let s = 0; s < n; s++) v.box(0.85, base + (n - 1 - s) * (0.36 / n), 0.3, 0.42, 0.36 / n, 0.02, flag[s]);
  g.add(new THREE.Mesh(v.build(), solidMat));
  return g;
}

export function industryModel(kind: string): ModelInstance {
  const group = new THREE.Group();
  let smoke: THREE.Vector3[] | undefined;
  const v = new Vox();
  switch (kind) {
    case 'smelter':
      v.box(0, 0, 0, 1.3, 0.42, 0.5, '#9c9285').box(0, 0.42, 0, 1.34, 0.06, 0.54, '#5e5852')
        .box(-0.4, 0, 0.45, 0.5, 0.3, 0.35, '#b0a596');
      for (let c = -1; c <= 1; c++) v.box(c * 0.4, 0.42, -0.1, 0.1, 0.5, 0.1, '#7a706a');
      smoke = [new THREE.Vector3(-0.4, 0.95, -0.1), new THREE.Vector3(0, 0.95, -0.1), new THREE.Vector3(0.4, 0.95, -0.1)];
      break;
    case 'factory':
      v.box(0, 0, 0, 1.0, 0.45, 0.6, '#a5523a').box(0, 0.45, 0, 1.04, 0.06, 0.64, '#4a4a4f')
        .box(0.35, 0, -0.45, 0.14, 1.2, 0.14, '#8b4a36').box(-0.3, 0, -0.45, 0.4, 0.3, 0.3, '#c9c3b6');
      smoke = [new THREE.Vector3(0.35, 1.25, -0.45)];
      break;
    case 'datacenter':
      v.box(0, 0, 0, 1.1, 0.4, 0.7, '#f0f2f4').box(0, 0.4, 0, 1.12, 0.04, 0.72, '#9aa4ad')
        .box(0, 0.12, 0.36, 1.0, 0.05, 0.01, '#3de0ff').box(0, 0.26, 0.36, 1.0, 0.05, 0.01, '#3de0ff')
        .box(-0.3, 0.44, -0.15, 0.2, 0.12, 0.2, '#c0c8d0').box(0.3, 0.44, -0.15, 0.2, 0.12, 0.2, '#c0c8d0');
      break;
    case 'hydrogen':
      v.box(-0.25, 0, 0, 0.6, 0.4, 0.6, '#e6eef2').box(-0.25, 0.4, 0, 0.64, 0.05, 0.64, '#4f8fbf')
        .box(0.35, 0, -0.2, 0.26, 0.5, 0.26, '#ffffff').box(0.35, 0, 0.2, 0.26, 0.5, 0.26, '#ffffff')
        .box(0.35, 0.5, -0.2, 0.2, 0.06, 0.2, '#58b0e0').box(0.35, 0.5, 0.2, 0.2, 0.06, 0.2, '#58b0e0');
      break;
    case 'platform':
      v.box(-0.35, -0.6, -0.35, 0.12, 0.9, 0.12, '#f2c230').box(0.35, -0.6, -0.35, 0.12, 0.9, 0.12, '#f2c230')
        .box(-0.35, -0.6, 0.35, 0.12, 0.9, 0.12, '#f2c230').box(0.35, -0.6, 0.35, 0.12, 0.9, 0.12, '#f2c230')
        .box(0, 0.3, 0, 1.0, 0.12, 1.0, '#8a9096').box(-0.2, 0.42, 0.1, 0.4, 0.3, 0.5, '#e8e8e8')
        .box(0.3, 0.42, -0.25, 0.14, 0.9, 0.14, '#d24a3a').box(0.25, 0.42, 0.3, 0.3, 0.05, 0.3, '#3a9b5a');
      break;
  }
  group.add(new THREE.Mesh(v.build(), solidMat));
  return { group, rotors: [], smoke };
}

export function craneModel(): THREE.Group {
  const geo = cached('crane', () => new Vox()
    .box(0, 0, 0, 0.06, 1.3, 0.06, '#f5b800').box(0.25, 1.25, 0, 0.8, 0.05, 0.05, '#f5b800')
    .box(-0.12, 1.2, 0, 0.14, 0.1, 0.1, '#555').box(0.55, 0.9, 0, 0.01, 0.35, 0.01, '#333').build());
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, solidMat));
  return g;
}

// ---------------------------------------------------------------- master
export interface PylonSpec { h: number; arm: number; color: string; wood: boolean; radius: number }
export const PYLON: Record<string, PylonSpec> = {
  v22: { h: 0.45, arm: 0.22, color: '#7a5a3a', wood: true, radius: 0.012 },
  v66: { h: 0.65, arm: 0.3, color: '#6e5038', wood: true, radius: 0.016 },
  v132: { h: 0.85, arm: 0.36, color: '#9ea4aa', wood: false, radius: 0.02 },
  v300: { h: 1.1, arm: 0.48, color: '#a9afb5', wood: false, radius: 0.026 },
  v420: { h: 1.35, arm: 0.6, color: '#b4bac0', wood: false, radius: 0.032 },
  hvdc: { h: 0.06, arm: 0, color: '#555', wood: false, radius: 0.04 },
};

export function pylonGeometry(v: string): THREE.BufferGeometry {
  return cached(`pylon-${v}`, () => {
    const s = PYLON[v];
    const b = new Vox();
    if (v === 'hvdc') return b.box(0, 0, 0, 0.12, 0.06, 0.12, '#c38bff').build();
    if (s.wood) {
      b.box(0, 0, 0, 0.045, s.h, 0.045, s.color).box(0, s.h - 0.06, 0, s.arm, 0.035, 0.04, s.color);
      if (v === 'v66') b.box(0.12, 0, 0, 0.04, s.h - 0.04, 0.04, s.color);
    } else {
      const w = 0.14 + s.h * 0.05;
      b.box(-w / 2, 0, 0, 0.035, s.h, 0.035, s.color, [0, 0, -0.06]).box(w / 2, 0, 0, 0.035, s.h, 0.035, s.color, [0, 0, 0.06])
        .box(0, s.h * 0.45, 0, w * 0.7, 0.025, 0.03, s.color)
        .box(0, s.h - 0.06, 0, s.arm * 2, 0.04, 0.05, s.color)
        .box(0, s.h - 0.02, 0, 0.06, 0.12, 0.04, s.color);
    }
    return b.build();
  });
}
