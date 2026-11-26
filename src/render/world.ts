import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Terrain, T_SEA, T_LAND } from '../world/terrain';
import { llToTile } from '../world/projection';
import { clamp, lerp, mulberry32 } from '../world/noise';
import { TerrainMesh, surfaceY, SEA_Y, Overlay } from './terrainMesh';
import { plantModel, stationModel, marketModel, industryModel, craneModel, solidMat, pylonGeometry, PYLON, ModelInstance, Vox } from './models';
import type { Game } from '../sim/game';
import type { GNode, GLine } from '../sim/types';
import { CITIES, MARKETS } from '../data/geo';
import { LINES, popAt, PlantType, seasonOf } from '../sim/config';

/** Sekunder (sanntid) som overgangen mellom sommer og vinter tar */
const SEASON_FADE_S = 1.2;

interface NodeObj {
  group: THREE.Group;
  model: THREE.Group;
  inst?: ModelInstance;
  crane?: THREE.Group;
  built: boolean;
  ghost: boolean;
  upgrading: boolean;
}
interface LineObj {
  group: THREE.Group;
  wire: THREE.Mesh;
  wireMat: THREE.MeshLambertMaterial;
  pylons: THREE.InstancedMesh | null;
  pylonCount: number;
  pts: THREE.Vector3[];
  cum: number[];
  len: number;
  key: string;
}
interface CitySlot { x: number; z: number; y: number; w: number; d: number; h: number; color: THREE.Color }
interface CityVis { nodeId: number; ref: string; slots: CitySlot[]; start: number; visible: number; pop2020: number }

export type MapMode = 'none' | 'load' | 'n1';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const WHITE = new THREE.Color('#ffffff');

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  terrain: Terrain;
  tmesh: TerrainMesh;
  game: Game | null = null;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  mapMode: MapMode = 'none';
  private nodeObjs = new Map<number, NodeObj>();
  private lineObjs = new Map<number, LineObj>();
  private pulses: THREE.InstancedMesh;
  private particles: THREE.InstancedMesh;
  private parts: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color; grow: number }[] = [];
  private buildings!: THREE.InstancedMesh;
  private lights!: THREE.InstancedMesh;
  private glows: THREE.Sprite[] = [];
  private cities: CityVis[] = [];
  private treeTrunks!: THREE.InstancedMesh;
  private treeCrowns!: THREE.InstancedMesh;
  private treeTiles: Int32Array = new Int32Array(0);
  private treeBase: THREE.Matrix4[] = [];
  private treeColor: THREE.Color[] = [];
  hover: THREE.LineLoop;
  ghost: THREE.Group | null = null;
  private ghostKey = '';
  preview: THREE.Mesh | null = null;
  selRing: THREE.Mesh;
  /** Pulserende markører for foreslåtte byggeplasser (brukes i starten av kampanjen) */
  private suggestGroup = new THREE.Group();
  private suggestKey = '';
  private focusAnim: { from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t: number } | null = null;
  private keys = new Set<string>();
  time = 0;
  private lastYearShown = -1;

  private rnd = mulberry32(42);
  onUpdateCallbacks: ((dt: number) => void)[] = [];

  constructor(container: HTMLElement, terrain: Terrain) {
    this.terrain = terrain;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 2000);
    this.camera.position.set(70, 60, 230);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 300;
    this.controls.maxPolarAngle = 1.25;
    this.controls.minPolarAngle = 0.15;
    this.controls.zoomSpeed = 1.2;
    this.controls.target.set(70, 0, 180);

    this.scene.background = new THREE.Color('#a9d4ee');
    this.scene.fog = new THREE.Fog('#a9d4ee', 150, 600);
    this.hemi = new THREE.HemisphereLight('#dff1ff', '#5d6a4a', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dd', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.tmesh = new TerrainMesh(terrain);
    this.scene.add(this.tmesh.mesh, this.tmesh.water);

    // pulser
    const pg = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pulses = new THREE.InstancedMesh(pg, pm, 6000);
    this.pulses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(6000 * 3), 3);
    this.pulses.count = 0;
    this.pulses.frustumCulled = false;
    this.pulses.renderOrder = 3;
    this.scene.add(this.pulses);

    // partikler (røyk, gnister)
    const partG = new THREE.BoxGeometry(1, 1, 1);
    const partM = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
    this.particles = new THREE.InstancedMesh(partG, partM, 1500);
    this.particles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1500 * 3), 3);
    this.particles.count = 0;
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // markør for flis
    const hg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 1), new THREE.Vector3(0, 0, 1)]);
    this.hover = new THREE.LineLoop(hg, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    this.hover.renderOrder = 10;
    this.hover.visible = false;
    this.scene.add(this.hover);

    const rg = new THREE.RingGeometry(0.9, 1.1, 40);
    rg.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, depthTest: false }));
    this.selRing.renderOrder = 9;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.scene.add(this.suggestGroup);

    this.buildTrees();
    this.tmesh.recolor();

    window.addEventListener('resize', () => this.resize(container));
    window.addEventListener('keydown', (e) => { if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  resize(container: HTMLElement) {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // ---------------------------------------------------------------- trær
  private buildTrees() {
    const t = this.terrain;
    const tiles: number[] = [];
    for (let k = 0; k < t.W * t.H; k++) if (t.forest[k]) tiles.push(k);
    const perTile = 2;
    const n = tiles.length * perTile;
    const trunkG = new Vox().box(0, 0, 0, 0.06, 0.12, 0.06, '#6b4a2f').build();
    const crownG = new Vox().box(0, 0.1, 0, 0.26, 0.16, 0.26, '#ffffff').box(0, 0.26, 0, 0.17, 0.14, 0.17, '#ffffff').box(0, 0.4, 0, 0.08, 0.1, 0.08, '#ffffff').build();
    this.treeTrunks = new THREE.InstancedMesh(trunkG, solidMat, n);
    this.treeCrowns = new THREE.InstancedMesh(crownG, solidMat, n);
    this.treeTiles = new Int32Array(n);
    let c = 0;
    for (const k of tiles) {
      const i = k % t.W, j = Math.floor(k / t.W);
      for (let p = 0; p < perTile; p++) {
        if (this.rnd() < 0.25) continue;
        const x = i + 0.2 + this.rnd() * 0.6, z = j + 0.2 + this.rnd() * 0.6;
        const s = 0.8 + this.rnd() * 0.7;
        tmpM.compose(tmpV.set(x, surfaceY(t, i, j), z), tmpQ.identity(), tmpS.set(s, s, s));
        this.treeBase.push(tmpM.clone());
        this.treeTrunks.setMatrixAt(c, tmpM);
        this.treeCrowns.setMatrixAt(c, tmpM);
        const g = t.lat[k] > 66 ? 0.85 : 1;
        const col = new THREE.Color().setHSL(0.3 + this.rnd() * 0.05, 0.45, (0.28 + this.rnd() * 0.08) * g);
        this.treeColor.push(col);
        this.treeCrowns.setColorAt(c, col);
        this.treeTiles[c] = k;
        c++;
      }
    }
    this.treeTrunks.count = c;
    this.treeCrowns.count = c;
    this.treeTrunks.castShadow = true;
    this.treeCrowns.castShadow = true;
    this.treeCrowns.receiveShadow = true;
    this.scene.add(this.treeTrunks, this.treeCrowns);
  }

  private recolorTrees() {
    const su = this.tmesh.snowSummer, wi = this.tmesh.snowWinter, b = this.tmesh.blend;
    const white = new THREE.Color('#eef3f6');
    for (let c = 0; c < this.treeCrowns.count; c++) {
      const base = this.treeColor[c];
      tmpC.copy(base);
      const k = this.treeTiles[c];
      const snow = su[k] + (wi[k] - su[k]) * b;
      if (snow > 0) tmpC.lerp(white, 0.6 * snow);
      this.treeCrowns.setColorAt(c, tmpC);
    }
    if (this.treeCrowns.instanceColor) this.treeCrowns.instanceColor.needsUpdate = true;
  }

  clearTreesAround(x: number, z: number, r: number) {
    let changed = false;
    for (let c = 0; c < this.treeCrowns.count; c++) {
      const e = this.treeBase[c].elements;
      if (Math.hypot(e[12] - x, e[14] - z) < r) {
        tmpM.makeScale(0, 0, 0);
        this.treeTrunks.setMatrixAt(c, tmpM);
        this.treeCrowns.setMatrixAt(c, tmpM);
        changed = true;
      }
    }
    if (changed) { this.treeTrunks.instanceMatrix.needsUpdate = true; this.treeCrowns.instanceMatrix.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- byer
  private buildCities() {
    const g = this.game!;
    // rydd opp etter et eventuelt tidligere spill
    if (this.buildings) { this.scene.remove(this.buildings, this.lights); this.buildings.dispose(); this.lights.dispose(); }
    for (const s of this.glows) this.scene.remove(s);
    this.glows = [];
    this.cities = [];
    this.lastYearShown = -1;
    for (let c = 0; c < this.treeBase.length; c++) { this.treeTrunks.setMatrixAt(c, this.treeBase[c]); this.treeCrowns.setMatrixAt(c, this.treeBase[c]); }
    this.treeTrunks.instanceMatrix.needsUpdate = true;
    this.treeCrowns.instanceMatrix.needsUpdate = true;
    const t = this.terrain;
    const palette = ['#f1efe9', '#f1efe9', '#b0413e', '#b0413e', '#e2c36b', '#c98f4b', '#8aa1b1', '#e9e2d0'];
    const slotsAll: CitySlot[] = [];
    for (const n of g.state.nodes.filter((x) => x.kind === 'city')) {
      const def = CITIES.find((c) => c.id === n.ref)!;
      const max = Math.round(clamp(4 + Math.sqrt(def.pop[2]) * 1.15, 5, 42));
      const cx = n.i + 0.5, cz = n.j + 0.5;
      const slots: CitySlot[] = [];
      let tries = 0;
      let k = 0;
      while (slots.length < max && tries < max * 12) {
        tries++;
        const ang = k * 2.39996;
        const r = 0.18 * Math.sqrt(k) * 1.25;
        k++;
        const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        const ti = Math.floor(x), tj = Math.floor(z);
        if (ti < 0 || tj < 0 || ti >= t.W || tj >= t.H) continue;
        if (t.type[tj * t.W + ti] !== T_LAND) continue;
        const centre = 1 - r / (0.18 * Math.sqrt(max) * 1.25 + 0.01);
        const big = def.pop[2] > 150 ? 1 : def.pop[2] > 50 ? 0.5 : 0.2;
        const h = 0.14 + this.rnd() * 0.12 + centre * centre * big * (0.4 + this.rnd() * 0.6);
        const w = 0.13 + this.rnd() * 0.09;
        const tall = h > 0.5;
        const col = new THREE.Color(tall ? (this.rnd() < 0.5 ? '#9fb7c9' : '#d8d8d2') : palette[Math.floor(this.rnd() * palette.length)]);
        slots.push({ x, z, y: surfaceY(t, ti, tj), w, d: w * (0.8 + this.rnd() * 0.5), h, color: col });
      }
      this.cities.push({ nodeId: n.id, ref: def.id, slots, start: slotsAll.length, visible: 0, pop2020: def.pop[2] });
      slotsAll.push(...slots);
      this.clearTreesAround(cx, cz, 1.6 + Math.sqrt(max) * 0.12);
    }
    const bg = new Vox().box(0, 0, 0, 1, 1, 1, '#ffffff').box(0, 1, 0, 1.06, 0.08, 1.06, '#bbbbbb').build();
    this.buildings = new THREE.InstancedMesh(bg, solidMat, slotsAll.length);
    this.buildings.castShadow = true;
    this.buildings.receiveShadow = true;
    const lg = new THREE.BoxGeometry(1, 1, 1);
    this.lights = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: '#ffd977' }), slotsAll.length * 2);
    for (let s = 0; s < slotsAll.length; s++) this.buildings.setColorAt(s, slotsAll[s].color);
    this.scene.add(this.buildings, this.lights);
    // glød
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 64;
    const ctx = cvs.getContext('2d')!;
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,220,130,0.9)');
    grd.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cvs);
    for (const c of this.cities) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      const n = g.node(c.nodeId)!;
      sp.position.set(n.i + 0.5, surfaceY(t, n.i, n.j) + 0.6, n.j + 0.5);
      this.glows.push(sp);
      this.scene.add(sp);
    }
    this.updateCityGrowth(true);
  }

  private updateCityGrowth(force = false) {
    const g = this.game!;
    const year = g.yearFrac;
    if (!force && Math.floor(year) === this.lastYearShown) return;
    this.lastYearShown = Math.floor(year);
    const era = clamp((year - 1900) / 120, 0, 1);
    for (const c of this.cities) {
      const def = CITIES.find((x) => x.id === c.ref)!;
      const p = popAt(def.pop, year);
      const frac = clamp(Math.sqrt(p / c.pop2020), 0.18, 1.15);
      c.visible = Math.min(c.slots.length, Math.ceil(c.slots.length * Math.min(1, frac)));
      for (let s = 0; s < c.slots.length; s++) {
        const sl = c.slots[s];
        const vis = s < c.visible;
        const hh = sl.h * (sl.h > 0.4 ? 0.25 + 0.75 * era : 0.7 + 0.3 * era) * (frac > 1 ? frac : 1);
        tmpM.compose(tmpV.set(sl.x, sl.y, sl.z), tmpQ.identity(), tmpS.set(vis ? sl.w : 0, vis ? hh : 0, vis ? sl.d : 0));
        this.buildings.setMatrixAt(c.start + s, tmpM);
      }
    }
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
  }

  private updateCityLights() {
    const g = this.game!;
    let li = 0;
    const era = clamp((g.yearFrac - 1900) / 120, 0, 1);
    for (let ci = 0; ci < this.cities.length; ci++) {
      const c = this.cities[ci];
      const n = g.node(c.nodeId)!;
      const on = !!n.everPowered && (n.served ?? 0) > 0.05;
      const flicker = n.blackout ? (Math.sin(this.time * 17 + ci) > 0.2 ? 1 : 0) : 1;
      const ratio = n.demand ? clamp((n.served ?? 0) / n.demand, 0, 1) : 0;
      for (let s = 0; s < c.visible; s++) {
        const sl = c.slots[s];
        if (!on || flicker === 0 || (n.blackout && s / c.visible > ratio)) continue;
        const hh = sl.h * (sl.h > 0.4 ? 0.25 + 0.75 * era : 0.7 + 0.3 * era);
        tmpM.compose(tmpV.set(sl.x, sl.y + hh * 0.55, sl.z + sl.d * 0.5 + 0.005), tmpQ.identity(), tmpS.set(sl.w * 0.55, Math.min(0.08, hh * 0.3), 0.012));
        this.lights.setMatrixAt(li++, tmpM);
      }
      const sp = this.glows[ci];
      const target = on ? (n.blackout ? 0.25 * flicker : 0.55) : 0;
      const mat = sp.material as THREE.SpriteMaterial;
      mat.opacity = lerp(mat.opacity, target, 0.1);
      const sc = 1.6 + Math.sqrt(c.pop2020) * 0.22;
      sp.scale.set(sc, sc, 1);
    }
    this.lights.count = li;
    this.lights.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- spill-kobling
  setGame(g: Game) {
    this.game = g;
    for (const [, o] of this.nodeObjs) this.scene.remove(o.group);
    for (const [, o] of this.lineObjs) this.scene.remove(o.group);
    this.nodeObjs.clear();
    this.lineObjs.clear();
    this.buildCities();
    for (const n of g.state.nodes) if (n.kind === 'plant' || n.kind === 'station') this.clearTreesAround(n.i + 0.5, n.j + 0.5, 1.1);
    g.on('built', (p) => {
      if (p.node) {
        const n = p.node as GNode;
        this.burst(n.i + 0.5, surfaceY(this.terrain, n.i, n.j) + 0.3, n.j + 0.5, p.done ? '#ffe066' : '#d9d0c0', p.done ? 26 : 14);
        if (p.started) this.clearTreesAround(n.i + 0.5, n.j + 0.5, 1.1);
      }
      if (p.line && p.done) {
        const l = p.line as GLine;
        const o = this.lineObjs.get(l.id);
        if (o) for (let k = 0; k < 8; k++) { const q = this.pathAt(o, k / 7); this.burst(q.x, q.y, q.z, '#ffe066', 4); }
      }
      if (p.a) this.clearTreesAround(p.a.i + 0.5, p.a.j + 0.5, 0.8);
      if (p.b) this.clearTreesAround(p.b.i + 0.5, p.b.j + 0.5, 0.8);
    });
    this.sync();
  }

  nodeTop(n: GNode): THREE.Vector3 {
    const y = surfaceY(this.terrain, n.i, n.j);
    return new THREE.Vector3(n.i + 0.5, y, n.j + 0.5);
  }

  private makeNodeObj(n: GNode): NodeObj {
    const g = this.game!;
    const group = new THREE.Group();
    let model: THREE.Group;
    let inst: ModelInstance | undefined;
    const t = this.terrain;
    const isSea = t.type[n.j * t.W + n.i] === T_SEA;
    if (n.kind === 'plant') { inst = plantModel(n.ptype!); model = inst.group; }
    else if (n.kind === 'station') model = stationModel();
    else if (n.kind === 'market') { const d = MARKETS.find((m) => m.id === n.ref)!; model = marketModel(d.flag, isSea); }
    else if (n.kind === 'industry') { inst = industryModel(g.indDef(n).kind); model = inst.group; }
    else model = new THREE.Group();
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(model);
    const p = this.nodeTop(n);
    group.position.copy(p);
    group.rotation.y = n.kind === 'plant' ? ((n.id * 1.7) % 4) * (Math.PI / 2) * 0 : 0;
    this.scene.add(group);
    return { group, model, inst, built: n.progress >= 1, ghost: false, upgrading: false };
  }

  private setGhost(o: NodeObj, ghost: boolean) {
    if (o.ghost === ghost) return;
    o.ghost = ghost;
    o.model.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (ghost) {
        mesh.userData.mat = mesh.material;
        const gm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
        mesh.material = gm;
        mesh.castShadow = false;
      } else if (mesh.userData.mat) {
        (mesh.material as THREE.Material).dispose();
        mesh.material = mesh.userData.mat;
        mesh.castShadow = true;
      }
    });
  }

  private lineKey(l: GLine): string {
    const g = this.game!;
    const par = this.parallelIndex(l);
    return `${l.v}:${l.a}:${l.b}:${par.idx}/${par.n}`;
  }

  private parallelIndex(l: GLine) {
    const g = this.game!;
    const same = g.state.lines.filter((x) => (x.a === l.a && x.b === l.b) || (x.a === l.b && x.b === l.a));
    return { idx: same.indexOf(l), n: same.length };
  }

  private makeLineObj(l: GLine): LineObj {
    const g = this.game!;
    const t = this.terrain;
    const A = g.node(l.a)!, B = g.node(l.b)!;
    const spec = PYLON[l.v];
    const par = this.parallelIndex(l);
    const ax = A.i + 0.5, az = A.j + 0.5, bx = B.i + 0.5, bz = B.j + 0.5;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const px = -dz / len, pz = dx / len;
    const off = (par.idx - (par.n - 1) / 2) * 0.28;
    const endH = (n: GNode) => (n.kind === 'city' ? 0.35 : n.kind === 'market' ? 0.5 : n.kind === 'station' ? 0.4 : 0.45);
    const hvdc = l.v === 'hvdc';
    const spans = Math.max(1, Math.round(len / (hvdc ? 1.2 : 1.35)));
    const anchors: { p: THREE.Vector3; sea: boolean; pylon: boolean }[] = [];
    for (let s = 0; s <= spans; s++) {
      const u = s / spans;
      const x = ax + dx * u + px * off * (s === 0 || s === spans ? 0.3 : 1);
      const z = az + dz * u + pz * off * (s === 0 || s === spans ? 0.3 : 1);
      const ti = Math.floor(x), tj = Math.floor(z);
      const k = clamp(tj, 0, t.H - 1) * t.W + clamp(ti, 0, t.W - 1);
      const sea = t.type[k] === T_SEA;
      const ground = surfaceY(t, ti, tj);
      let y: number;
      if (s === 0) y = surfaceY(t, A.i, A.j) + endH(A);
      else if (s === spans) y = surfaceY(t, B.i, B.j) + endH(B);
      else y = sea ? SEA_Y - 0.02 : ground + (hvdc ? 0.06 : spec.h - 0.04);
      anchors.push({ p: new THREE.Vector3(x, y, z), sea, pylon: s > 0 && s < spans && !sea });
    }
    // trådpunkter med nedheng
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s < anchors.length - 1; s++) {
      const a = anchors[s].p, b = anchors[s + 1].p;
      const overhead = !hvdc && !(anchors[s].sea && anchors[s + 1].sea);
      const sag = overhead ? 0.06 + a.distanceTo(b) * 0.05 : 0;
      const sub = 5;
      for (let q = 0; q < sub; q++) {
        const u = q / sub;
        const p = new THREE.Vector3().lerpVectors(a, b, u);
        p.y -= sag * 4 * u * (1 - u);
        pts.push(p);
      }
    }
    pts.push(anchors[anchors.length - 1].p.clone());
    const cum = [0];
    for (let q = 1; q < pts.length; q++) cum.push(cum[q - 1] + pts[q].distanceTo(pts[q - 1]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
    const radius = Math.max(0.028, spec.radius * 1.5);
    const tg = new THREE.TubeGeometry(curve, Math.min(400, pts.length * 2), radius, 5, false);
    const wireMat = new THREE.MeshLambertMaterial({ color: LINES[l.v].color, emissive: new THREE.Color(LINES[l.v].color), emissiveIntensity: 0.35, transparent: true, opacity: 1 });
    const wire = new THREE.Mesh(tg, wireMat);
    const group = new THREE.Group();
    group.add(wire);
    let pylons: THREE.InstancedMesh | null = null;
    const pl = anchors.filter((a) => a.pylon);
    if (pl.length) {
      pylons = new THREE.InstancedMesh(pylonGeometry(l.v), solidMat, pl.length);
      const yaw = Math.atan2(dx, dz);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      pl.forEach((a, idx) => {
        const ground = surfaceY(t, Math.floor(a.p.x), Math.floor(a.p.z));
        tmpM.compose(tmpV.set(a.p.x, ground, a.p.z), tmpQ, tmpS.set(1, 1, 1));
        pylons!.setMatrixAt(idx, tmpM);
      });
      pylons.castShadow = true;
      group.add(pylons);
    }
    this.scene.add(group);
    return { group, wire, wireMat, pylons, pylonCount: pl.length, pts, cum, len: cum[cum.length - 1], key: this.lineKey(l) };
  }

  private pathAt(o: LineObj, u: number): THREE.Vector3 {
    const d = u * o.len;
    let lo = 0, hi = o.cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (o.cum[m] <= d) lo = m; else hi = m; }
    const seg = o.cum[hi] - o.cum[lo] || 1;
    return tmpV.lerpVectors(o.pts[lo], o.pts[hi], (d - o.cum[lo]) / seg);
  }

  /** Synkroniser 3D-objekter med spilltilstanden */
  sync() {
    const g = this.game;
    if (!g) return;
    const seenN = new Set<number>();
    for (const n of g.state.nodes) {
      if (n.kind === 'city') continue;
      if (!g.isVisible(n)) continue;
      seenN.add(n.id);
      let o = this.nodeObjs.get(n.id);
      if (!o) { o = this.makeNodeObj(n); this.nodeObjs.set(n.id, o); }
      const building = n.progress < 1;
      this.setGhost(o, building);
      if (building) {
        if (!o.crane) { o.crane = craneModel(); o.crane.position.set(0.55, 0, 0.45); o.group.add(o.crane); }
        o.model.scale.set(1, 0.25 + 0.75 * n.progress, 1);
      } else {
        if (o.crane && !n.upgrade) { o.group.remove(o.crane); o.crane = undefined; }
        if (n.upgrade && !o.crane) { o.crane = craneModel(); o.crane.position.set(0.55, 0, 0.45); o.group.add(o.crane); }
        o.model.scale.set(1, 1, 1);
      }
    }
    for (const [id, o] of this.nodeObjs) if (!seenN.has(id)) { this.scene.remove(o.group); this.nodeObjs.delete(id); }

    const seenL = new Set<number>();
    for (const l of g.state.lines) {
      seenL.add(l.id);
      let o = this.lineObjs.get(l.id);
      const key = this.lineKey(l);
      if (o && o.key !== key) { this.disposeLine(o); this.lineObjs.delete(l.id); o = undefined; }
      if (!o) { o = this.makeLineObj(l); this.lineObjs.set(l.id, o); }
    }
    for (const [id, o] of this.lineObjs) if (!seenL.has(id)) { this.disposeLine(o); this.lineObjs.delete(id); }
  }

  private disposeLine(o: LineObj) {
    this.scene.remove(o.group);
    o.wire.geometry.dispose();
    o.wireMat.dispose();
    o.pylons?.dispose();
  }

  // ---------------------------------------------------------------- effekter
  burst(x: number, y: number, z: number, color: string, n: number) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      if (this.parts.length >= 1400) break;
      const a = this.rnd() * Math.PI * 2, s = 0.6 + this.rnd() * 1.4;
      this.parts.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(Math.cos(a) * s, 1.2 + this.rnd() * 2, Math.sin(a) * s), life: 0, max: 0.6 + this.rnd() * 0.5, size: 0.06 + this.rnd() * 0.05, color: c, grow: -0.5 });
    }
  }

  private smoke(p: THREE.Vector3) {
    if (this.parts.length >= 1400) return;
    const shade = 0.75 + this.rnd() * 0.2;
    this.parts.push({ p: p.clone(), v: new THREE.Vector3((this.rnd() - 0.5) * 0.1 + 0.15, 0.35 + this.rnd() * 0.2, (this.rnd() - 0.5) * 0.1), life: 0, max: 2.2 + this.rnd(), size: 0.07, color: new THREE.Color(shade, shade, shade), grow: 0.09 });
  }

  // ---------------------------------------------------------------- sesong og lys
  /**
   * Velg årstid ut fra uka. Landskapet har bare to tilstander (sommer og vinter).
   * Ved skifte tones det over i sanntid (SEASON_FADE_S), uavhengig av spillhastigheten.
   */
  setSeason(woy: number, instant = false) {
    this.seasonTarget = seasonOf(woy) === 'winter' ? 1 : 0;
    if (instant || this.seasonBlend < 0) this.applySeason(this.seasonTarget);
  }

  private updateSeason(dt: number) {
    const cur = this.seasonBlend, tgt = this.seasonTarget;
    if (cur === tgt || cur < 0) return;
    const step = dt / SEASON_FADE_S;
    this.applySeason(tgt > cur ? Math.min(tgt, cur + step) : Math.max(tgt, cur - step));
  }

  /** b: 0 = sommer, 1 = vinter (lineær framdrift i overgangen) */
  private applySeason(b: number) {
    this.seasonBlend = b;
    const s = b * b * (3 - 2 * b); // myk start og slutt
    this.tmesh.applyBlend(s);
    this.recolorTrees();
    const sky = new THREE.Color('#a9d4ee').lerp(new THREE.Color('#7d93b4'), s * 0.75);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.sun.intensity = lerp(2.3, 1.15, s);
    this.sun.color.set('#fff3dd').lerp(new THREE.Color('#ffd0a0'), s * 0.7);
    this.hemi.intensity = lerp(1.25, 1.0, s);
    this.sunElev = lerp(1.0, 0.42, s);
  }
  private sunElev = 1;
  /** Gjeldende overgang mellom sommer (0) og vinter (1); -1 før første setSeason */
  private seasonBlend = -1;
  private seasonTarget = 0;

  // ---------------------------------------------------------------- kamera
  focusTile(x: number, z: number, dist?: number, instant = false) {
    const to = new THREE.Vector3(x, 0, z);
    const d1 = dist ?? this.camera.position.distanceTo(this.controls.target);
    if (instant) {
      const off = this.camera.position.clone().sub(this.controls.target).setLength(d1);
      this.controls.target.copy(to);
      this.camera.position.copy(to).add(off);
      return;
    }
    this.focusAnim = { from: this.controls.target.clone(), to, d0: this.camera.position.distanceTo(this.controls.target), d1, t: 0 };
  }
  focusLL(lon: number, lat: number, dist?: number, instant = false) {
    const [i, j] = llToTile(lon, lat);
    this.focusTile(i, j, dist, instant);
  }
  setView(polar: number, azimuth = 0) {
    const d = this.camera.position.distanceTo(this.controls.target);
    const off = new THREE.Vector3().setFromSphericalCoords(d, polar, azimuth);
    this.camera.position.copy(this.controls.target).add(off);
  }

  /** Finn flisen under musepekeren ved å marsjere langs strålen gjennom høydefeltet */
  pick(clientX: number, clientY: number): { x: number; z: number; i: number; j: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin.clone(), d = ray.ray.direction.clone();
    const t = this.terrain;
    let prev = o.clone();
    const stepLen = 0.12;
    for (let s = 0; s < 6000; s++) {
      const p = o.clone().addScaledVector(d, s * stepLen);
      if (p.y < -2) break;
      const i = Math.floor(p.x), j = Math.floor(p.z);
      const h = i >= 0 && j >= 0 && i < t.W && j < t.H ? surfaceY(t, i, j) : SEA_Y;
      if (p.y <= h) {
        // finjuster
        let a = prev, b = p;
        for (let r = 0; r < 6; r++) {
          const m = a.clone().lerp(b, 0.5);
          const hm = surfaceY(t, Math.floor(m.x), Math.floor(m.z));
          if (m.y <= hm) b = m; else a = m;
        }
        const ii = Math.floor(b.x), jj = Math.floor(b.z);
        if (ii < 0 || jj < 0 || ii >= t.W || jj >= t.H) return null;
        return { x: b.x, z: b.z, i: ii, j: jj, y: surfaceY(t, ii, jj) };
      }
      prev = p;
    }
    return null;
  }

  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean; dist: number } {
    const v = p.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      visible: v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2,
      dist: this.camera.position.distanceTo(p),
    };
  }

  camDistance() { return this.camera.position.distanceTo(this.controls.target); }

  // ---------------------------------------------------------------- forhåndsvisning
  /** Vis forslag til byggeplasser. Tom liste fjerner dem. */
  setSuggestions(sites: { i: number; j: number }[]) {
    const key = sites.map((s) => `${s.i},${s.j}`).join(';');
    if (key === this.suggestKey) return;
    this.suggestKey = key;
    for (const c of [...this.suggestGroup.children]) {
      this.suggestGroup.remove(c);
      c.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); } });
    }
    for (const s of sites) {
      const g = new THREE.Group();
      g.position.set(s.i + 0.5, surfaceY(this.terrain, s.i, s.j) + 0.06, s.j + 0.5);
      const rg = new THREE.RingGeometry(0.75, 0.95, 40);
      rg.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x7dffd0, transparent: true, opacity: 0.9, depthTest: false }));
      ring.renderOrder = 9;
      const cg = new THREE.ConeGeometry(0.32, 0.6, 4);
      cg.rotateX(Math.PI); // spissen ned
      const arrow = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0x7dffd0, transparent: true, opacity: 0.95, depthTest: false }));
      arrow.renderOrder = 9;
      g.add(ring, arrow);
      this.suggestGroup.add(g);
    }
  }

  setHover(i: number | null, j: number | null, ok = true, size = 1) {
    if (i === null || j === null) { this.hover.visible = false; return; }
    const y = surfaceY(this.terrain, i, j) + 0.03;
    const off = (size - 1) / 2;
    this.hover.position.set(i - off, y, j - off);
    this.hover.scale.set(size, 1, size);
    (this.hover.material as THREE.LineBasicMaterial).color.set(ok ? '#7dff9a' : '#ff6b6b');
    this.hover.visible = true;
  }

  setGhostModel(kind: PlantType | 'station' | null, i = 0, j = 0, ok = true) {
    const key = kind ?? '';
    if (key !== this.ghostKey) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostKey = key;
      if (kind) {
        this.ghost = kind === 'station' ? stationModel() : plantModel(kind).group;
        this.ghost.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (mesh.isMesh) mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, emissive: new THREE.Color('#203040') });
        });
        this.scene.add(this.ghost);
      }
    }
    if (this.ghost) {
      this.ghost.position.set(i + 0.5, surfaceY(this.terrain, i, j), j + 0.5);
      this.ghost.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.MeshLambertMaterial).emissive.set(ok ? '#1d4d2a' : '#6a1010');
      });
    }
  }

  setPreviewLine(a: THREE.Vector3 | null, b?: THREE.Vector3, ok = true, color = '#ffffff') {
    if (this.preview) { this.scene.remove(this.preview); this.preview.geometry.dispose(); this.preview = null; }
    if (!a || !b) return;
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.4 + a.distanceTo(b) * 0.04;
    const c = new THREE.QuadraticBezierCurve3(a, mid, b);
    const g = new THREE.TubeGeometry(c, 40, 0.07, 6, false);
    this.preview = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ok ? color : '#ff5a5a', transparent: true, opacity: 0.75, depthTest: false }));
    this.preview.renderOrder = 8;
    this.scene.add(this.preview);
  }

  select(n: GNode | null, l: GLine | null) {
    this.selectedLine = l?.id ?? null;
    if (n) {
      const p = this.nodeTop(n);
      this.selRing.position.set(p.x, p.y + 0.05, p.z);
      const s = n.kind === 'city' || n.kind === 'market' ? 1.6 : 0.9;
      this.selRing.scale.set(s, 1, s);
      this.selRing.visible = true;
    } else this.selRing.visible = false;
  }
  selectedLine: number | null = null;

  // ---------------------------------------------------------------- oppdatering
  update(dt: number) {
    this.time += dt;
    this.updateSeason(dt);
    const g = this.game;
    // kamera-animasjon
    if (this.focusAnim) {
      const f = this.focusAnim;
      f.t = Math.min(1, f.t + dt * 1.4);
      const e = 1 - Math.pow(1 - f.t, 3);
      const target = f.from.clone().lerp(f.to, e);
      const off = this.camera.position.clone().sub(this.controls.target);
      off.setLength(lerp(f.d0, f.d1, e));
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(off);
      if (f.t >= 1) this.focusAnim = null;
    }
    // tastaturpanorering
    const pan = new THREE.Vector3();
    const fwd = this.controls.target.clone().sub(this.camera.position).setY(0).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (this.keys.has('w') || this.keys.has('arrowup')) pan.add(fwd);
    if (this.keys.has('s') || this.keys.has('arrowdown')) pan.sub(fwd);
    if (this.keys.has('d') || this.keys.has('arrowright')) pan.add(right);
    if (this.keys.has('a') || this.keys.has('arrowleft')) pan.sub(right);
    if (pan.lengthSq() > 0) {
      pan.setLength(dt * this.camDistance() * 0.9);
      this.controls.target.add(pan);
      this.camera.position.add(pan);
    }
    // hold målet innenfor kartet
    const tg = this.controls.target;
    const cx = clamp(tg.x, 0, this.terrain.W), cz = clamp(tg.z, 0, this.terrain.H);
    if (cx !== tg.x || cz !== tg.z) { this.camera.position.x += cx - tg.x; this.camera.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }
    this.controls.update();

    // sol og skygge følger kameraet
    const dist = this.camDistance();
    const sh = clamp(dist * 0.85, 25, 150);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    if (Math.abs(sc.right - sh) > 1) { sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix(); }
    this.sun.position.set(tg.x - 60, 70 * this.sunElev + 20, tg.z + 40);
    this.sun.target.position.copy(tg);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist * 1.6 + 40;
    fog.far = dist * 4.5 + 200;

    if (g) {
      this.updateCityGrowth();
      this.updateCityLights();
      this.updateNodesAnim(dt);
      this.updateLines();
    }
    this.updateParticles(dt);
    this.selRing.rotation.y += dt * 0.6;
    (this.selRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * Math.sin(this.time * 4);
    this.suggestGroup.children.forEach((m, idx) => {
      // Ring som vokser utover og blekner, pluss en pil som vipper over feltet
      const ph = (this.time * 0.8 + idx * 0.33) % 1;
      const ring = m.children[0] as THREE.Mesh, arrow = m.children[1] as THREE.Mesh;
      ring.scale.setScalar(0.7 + ph * 1.1);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - ph);
      arrow.position.y = 1.6 + Math.sin(this.time * 3 + idx) * 0.25;
      arrow.rotation.y += dt * 1.5;
    });
    (this.tmesh.water.material as THREE.MeshPhongMaterial).color.setHSL(0.56, 0.55, 0.4 + Math.sin(this.time * 0.6) * 0.01);
    for (const cb of this.onUpdateCallbacks) cb(dt);
  }

  private smokeAcc = 0;
  private updateNodesAnim(dt: number) {
    const g = this.game!;
    this.smokeAcc += dt;
    const doSmoke = this.smokeAcc > 0.18;
    if (doSmoke) this.smokeAcc = 0;
    for (const [id, o] of this.nodeObjs) {
      const n = g.node(id);
      if (!n) continue;
      if (o.inst) {
        const running = n.progress >= 1 && ((n.out ?? 0) > 0.01 || (n.kind === 'industry' && (n.served ?? 0) > 0.1));
        const sp = n.kind === 'plant' && n.cap ? clamp((n.out ?? 0) / n.cap, 0, 1) : 0;
        for (const r of o.inst.rotors) r.rotation.z -= dt * (n.progress >= 1 ? 0.6 + sp * 7 : 0);
        if (doSmoke && running && o.inst.smoke)
          for (const s of o.inst.smoke) this.smoke(tmpV.copy(s).applyMatrix4(o.group.matrixWorld).clone());
      }
      if (o.crane) o.crane.rotation.y = Math.sin(this.time * 0.7 + id) * 0.8;
    }
  }

  private updateLines() {
    const g = this.game!;
    let pc = 0;
    const max = this.pulses.instanceMatrix.count;
    const blink = Math.sin(this.time * 8) > 0;
    const pulseScale = clamp(0.7 + this.camDistance() / 160, 0.7, 1.5);
    for (const l of g.state.lines) {
      const o = this.lineObjs.get(l.id);
      if (!o) continue;
      const built = l.progress >= 1;
      const load = built ? Math.abs(l.flow ?? 0) / l.cap : 0;
      // utseende
      const mat = o.wireMat;
      let col: string = LINES[l.v].color;
      let emi = 0.35;
      if (!built) { mat.opacity = 0.35; col = '#ffffff'; emi = 0.2; }
      else mat.opacity = 1;
      if (this.mapMode === 'load' && built) col = load > 0.95 ? '#ff3b3b' : load > 0.7 ? '#ffb020' : load > 0.02 ? '#5ee06a' : '#9aa3ab';
      if (this.mapMode === 'n1' && built) col = l.critical ? '#ff8a1f' : '#5ee06a';
      if (built && load > 0.97 && this.mapMode === 'none') { col = blink ? '#ff5050' : col; emi = 0.6; }
      if (l.outage > 0) { col = blink ? '#ff2020' : '#401010'; emi = 0.8; }
      if (this.selectedLine === l.id) emi = 0.9 + 0.3 * Math.sin(this.time * 6);
      mat.color.set(col);
      mat.emissive.set(col);
      mat.emissiveIntensity = emi;
      if (o.pylons) {
        const showN = built ? o.pylonCount : Math.floor(o.pylonCount * l.progress);
        o.pylons.count = showN;
      }
      o.wire.visible = built || l.progress > 0;
      // pulser
      const f = l.flow ?? 0;
      if (!built || l.outage > 0 || Math.abs(f) < 0.05) continue;
      const nP = Math.max(2, Math.floor(o.len / 0.85));
      const speed = (0.8 + 2.6 * load) / o.len;
      const dir = f > 0 ? 1 : -1;
      const phase = this.time * speed * dir;
      tmpC.set(this.mapMode === 'load' ? col : LINES[l.v].color).lerp(WHITE, 0.2);
      const s = (0.4 + Math.min(0.8, Math.sqrt(Math.abs(f)) / 30)) * pulseScale;
      for (let k = 0; k < nP && pc < max; k++) {
        let u = (k / nP + phase) % 1;
        if (u < 0) u += 1;
        const p = this.pathAt(o, u);
        tmpM.compose(p, tmpQ.identity(), tmpS.set(s, s, s));
        this.pulses.setMatrixAt(pc, tmpM);
        this.pulses.setColorAt(pc, tmpC);
        pc++;
      }
    }
    this.pulses.count = pc;
    this.pulses.instanceMatrix.needsUpdate = true;
    if (this.pulses.instanceColor) this.pulses.instanceColor.needsUpdate = true;
  }

  private updateParticles(dt: number) {
    let c = 0;
    const keep: typeof this.parts = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.p.addScaledVector(p.v, dt);
      if (p.grow < 0) p.v.y -= 5 * dt;
      else p.v.multiplyScalar(0.995);
      const k = p.life / p.max;
      const s = p.grow > 0 ? p.size + p.grow * p.life * 1.5 : p.size * (1 - k);
      tmpM.compose(p.p, tmpQ.identity(), tmpS.set(s, s, s));
      this.particles.setMatrixAt(c, tmpM);
      this.particles.setColorAt(c, p.color);
      c++;
      keep.push(p);
    }
    this.parts = keep;
    this.particles.count = c;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
  }

  setOverlay(ov: Overlay, q: ((i: number, j: number) => number) | null) {
    this.tmesh.setOverlay(ov, q);
    this.recolorTrees();
    const dim = ov !== 'none';
    this.treeCrowns.visible = !dim;
    this.treeTrunks.visible = !dim;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
