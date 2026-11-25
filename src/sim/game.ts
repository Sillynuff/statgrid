import { CITIES, INDUSTRIES, MARKETS, HISTORY, CityDef, IndustryDef, MarketDef } from '../data/geo';
import { Terrain, T_SEA, T_LAND, T_FOREIGN, T_LAKE } from '../world/terrain';
import { llToTileInt } from '../world/projection';
import { mulberry32, clamp } from '../world/noise';
import {
  PLANTS, LINES, PlantType, Voltage, curve, step, STATION_COST, STATION_WEEKS, PER_CAPITA, TARIFF, CO2_PRICE, GAS_PRICE,
  MONEY_PER_MW_WEEK_ORE as K, KILE_FACTOR, HOURS_PER_WEEK, popAt, seasonDemand, riverFlow, inflow, solarSeason, windSeason,
  MAX_AC_SEA_TILES, AC_VOLTAGES, MONTHS, monthOf,
} from './config';
import { MinCostFlow } from './flow';
import { GameState, GNode, GLine, emptyLedger, Ledger, NewsItem, ActiveEvent } from './types';
import { CHAPTERS, Chapter, ObjectiveStatus } from './campaign';

/** Uka da vinterlasten og lav vannføring for alvor slår inn. */
export const WINTER_START_WEEK = 46;
/** Første vintervarsel: et elvekraftverk startet nå rekker å bli ferdig før frosten, med litt margin til linja. */
export const WINTER_WARN_WEEK = WINTER_START_WEEK - PLANTS.river.buildWeeks - 4;

export type Endpoint = { node: number } | { tile: [number, number] };

export interface PlacementCheck {
  ok: boolean; reason?: string; quality: number; cost: number; cap: number; expected: number; weeks: number;
}
export interface LinePlan {
  ok: boolean; reason?: string; cost: number; tiles: number; km: number; seaTiles: number; weeks: number; cap: number;
  a?: GNode; b?: GNode; aTile: [number, number]; bTile: [number, number]; newStations: number;
}

type Listener = (payload: any) => void;

const VALUE_CITY = 400, VALUE_IND = 380;
const REGIONS = 4; // sør, vest, midt, nord

function regionOf(lat: number, lon: number): number {
  if (lat > 66) return 3;
  if (lat > 62.5) return 2;
  return lon < 8 ? 1 : 0;
}

export class Game {
  state: GameState;
  terrain: Terrain;
  occ: Int32Array;
  private listeners = new Map<string, Listener[]>();
  private nodeIndex = new Map<number, GNode>();
  private refIndex = new Map<string, GNode>();
  private rng: () => number;
  totals = { demand: 0, served: 0, gen: 0, imp: 0, exp: 0, loss: 0, renew: 0, unserved: 0, storage: 0, storageMax: 0, capacity: 0 };
  weekLedger: Ledger = emptyLedger();
  n1Dirty = true;
  private n1Job: { lines: number[]; idx: number; base: Map<number, number>; risk: Set<number>; crit: Set<number> } | null = null;
  private compCache: Map<number, number> | null = null;
  objectiveCache: { main: ObjectiveStatus[]; stars: ObjectiveStatus[] } = { main: [], stars: [] };

  constructor(terrain: Terrain, state: GameState) {
    this.terrain = terrain;
    this.state = state;
    this.occ = new Int32Array(terrain.W * terrain.H).fill(-1);
    this.rng = mulberry32(state.rngState);
    this.reindex();
  }

  // ---------------------------------------------------------------- oppsett
  static createState(mode: 'campaign' | 'free', terrain: Terrain, opts: { startYear?: number; unlimited?: boolean } = {}): GameState {
    const ch = CHAPTERS[0];
    const startYear = mode === 'campaign' ? ch.startYear : opts.startYear ?? 1950;
    const startWoy = mode === 'campaign' ? ch.startWoy : 18;
    const st: GameState = {
      version: 1, mode, chapter: mode === 'campaign' ? 0 : -1,
      week: (startYear - 1900) * 52 + startWoy,
      money: mode === 'campaign' ? ch.grant : opts.unlimited ? 1e9 : startYear >= 2000 ? 20000 : startYear >= 1950 ? 4000 : 150,
      omdomme: 60, seed: 1234, rngState: 987654,
      nodes: [], lines: [], nextId: 1, flags: {},
      stats: { demandMWh: 0, servedMWh: 0, exportRev: 0, renewEMA: 1, genMWh: 0, blackoutWeeks: 0, startWeek: 0 },
      events: [], weather: [0.5, 0.5, 0.5, 0.5], prices: {}, priceNoise: {}, news: [],
      yearLedger: emptyLedger(), lastYearLedger: emptyLedger(), chapterResults: {},
      freeStartYear: mode === 'free' ? startYear : undefined, unlimited: !!opts.unlimited,
    };
    st.stats.startWeek = st.week;
    const findLand = (lon: number, lat: number, allowSea = false): [number, number] => {
      const [i, j] = llToTileInt(lon, lat);
      if (allowSea) return [i, j];
      for (let r = 0; r < 6; r++)
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) {
            const k = (j + dj) * terrain.W + i + di;
            if (terrain.type[k] === T_LAND) return [i + di, j + dj];
          }
      return [i, j];
    };
    for (const c of CITIES) {
      const [i, j] = findLand(c.lon, c.lat);
      st.nodes.push({ id: st.nextId++, kind: 'city', ref: c.id, i, j, progress: 1, buildWeeks: 0 });
    }
    for (const d of INDUSTRIES) {
      const sea = d.kind === 'platform';
      const [i, j] = findLand(d.lon, d.lat, sea);
      st.nodes.push({ id: st.nextId++, kind: 'industry', ref: d.id, i, j, progress: 1, buildWeeks: 0 });
    }
    for (const m of MARKETS) {
      const [i, j] = llToTileInt(m.lon, m.lat);
      st.nodes.push({ id: st.nextId++, kind: 'market', ref: m.id, i, j, progress: 1, buildWeeks: 0 });
    }
    return st;
  }

  reindex() {
    this.nodeIndex.clear();
    this.refIndex.clear();
    this.occ.fill(-1);
    const W = this.terrain.W;
    for (const n of this.state.nodes) {
      this.nodeIndex.set(n.id, n);
      if (n.ref) this.refIndex.set(n.ref, n);
      const r = n.kind === 'city' || n.kind === 'market' ? 1 : 0;
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const ii = n.i + di, jj = n.j + dj;
          if (ii >= 0 && jj >= 0 && ii < W && jj < this.terrain.H) this.occ[jj * W + ii] = n.id;
        }
    }
    this.compCache = null;
  }

  on(ev: string, fn: Listener) {
    if (!this.listeners.has(ev)) this.listeners.set(ev, []);
    this.listeners.get(ev)!.push(fn);
  }
  emit(ev: string, payload?: any) {
    for (const fn of this.listeners.get(ev) ?? []) fn(payload);
  }

  rng01() { return this.rng(); }

  /** Beregn forbruk og tilgjengelighet uten å flytte tiden (brukes ved oppstart/lasting) */
  prime() {
    const woy = this.woy;
    for (const n of this.state.nodes) {
      if (n.kind === 'city' || n.kind === 'industry') n.demand = n.demand ?? this.consumerDemand(n, woy);
      if (n.kind === 'plant') n.avail = n.avail ?? this.plantAvail(n, woy);
      if (n.kind === 'market') n.price = this.marketPrice(n.ref!);
    }
  }

  // ---------------------------------------------------------------- oppslag
  get year() { return 1900 + Math.floor(this.state.week / 52); }
  get woy() { return this.state.week % 52; }
  get yearFrac() { return 1900 + this.state.week / 52; }
  get chapterDef(): Chapter | null { return this.state.mode === 'campaign' ? CHAPTERS[this.state.chapter] ?? null : null; }
  dateLabel() { return `${MONTHS[monthOf(this.woy)]} ${this.year}`; }

  node(id: number) { return this.nodeIndex.get(id); }
  nodeByRef(ref: string) { return this.refIndex.get(ref); }
  cityDef(n: GNode): CityDef { return CITIES.find((c) => c.id === n.ref)!; }
  indDef(n: GNode): IndustryDef { return INDUSTRIES.find((c) => c.id === n.ref)!; }
  marketDef(n: GNode): MarketDef { return MARKETS.find((c) => c.id === n.ref)!; }

  nodeName(n: GNode): string {
    if (n.kind === 'city') {
      const d = this.cityDef(n);
      return d.oldName && this.year < d.oldName[1] ? d.oldName[0] : d.name;
    }
    if (n.kind === 'industry') return this.indDef(n).name;
    if (n.kind === 'market') return this.marketDef(n).name;
    if (n.kind === 'plant') return `${PLANTS[n.ptype!].name}`;
    return 'Transformatorstasjon';
  }

  isActive(n: GNode): boolean {
    if (n.kind === 'city') {
      if (this.state.mode === 'free') return true;
      return this.cityDef(n).chapter <= this.state.chapter;
    }
    if (n.kind === 'industry') {
      const d = this.indDef(n);
      if (this.state.mode === 'campaign' && d.chapter > this.state.chapter) return false;
      return this.yearFrac >= d.year;
    }
    if (n.kind === 'market') return this.year >= this.marketDef(n).year && (this.state.mode === 'free' || this.state.chapter >= 2);
    return true;
  }

  cityNodes() { return this.state.nodes.filter((n) => n.kind === 'city' && this.isActive(n)); }
  isPowered(n: GNode) { return !!n.everPowered && !!n.demand && (n.served ?? 0) >= n.demand * 0.9; }
  linesOf(id: number) { return this.state.lines.filter((l) => l.a === id || l.b === id); }
  isUnlockedPlant(t: PlantType) { return this.year >= PLANTS[t].unlock; }
  isUnlockedLine(v: Voltage) { return this.year >= LINES[v].unlock; }
  plantCap(t: PlantType) { return step(PLANTS[t].cap, this.year); }
  lineCap(v: Voltage) { return step(LINES[v].cap, this.year); }
  costMult() { return this.state.unlimited ? 1 : clamp(1 + (55 - this.state.omdomme) / 250, 0.9, 1.2); }

  nodeAtTile(i: number, j: number, radius = 1.6): GNode | undefined {
    let best: GNode | undefined, bd = Infinity;
    for (const n of this.state.nodes) {
      if (!this.isVisible(n)) continue;
      const r = n.kind === 'city' || n.kind === 'market' ? radius + 0.8 : radius;
      const d = Math.hypot(n.i - i, n.j - j);
      if (d <= r && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  isVisible(n: GNode) {
    if (n.kind === 'industry' || n.kind === 'market') return this.isActive(n);
    return true;
  }

  lineAt(x: number, z: number, maxDist = 0.6): GLine | undefined {
    let best: GLine | undefined, bd = maxDist;
    for (const l of this.state.lines) {
      const a = this.node(l.a)!, b = this.node(l.b)!;
      const ax = a.i + 0.5, az = a.j + 0.5, bx = b.i + 0.5, bz = b.j + 0.5;
      const dx = bx - ax, dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // ---------------------------------------------------------------- plassering
  siteQuality(t: PlantType, i: number, j: number): number {
    const T = this.terrain;
    if (i < 0 || j < 0 || i >= T.W || j >= T.H) return 0;
    const k = j * T.W + i;
    const spec = PLANTS[t];
    const ty = T.type[k];
    if (spec.resource === 'offshore') {
      return ty === T_SEA && T.dLand[k] >= 2 && T.dLand[k] <= 32 ? T.wind[k] : 0;
    }
    if (ty !== T_LAND) return 0;
    switch (spec.resource) {
      case 'hydro': return T.hydro[k];
      case 'wind': return T.wind[k];
      case 'solar': return T.level[k] <= 8 ? T.solar[k] : 0;
      case 'coast': {
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const kk = (j + dj) * T.W + i + di;
            if (T.type[kk] === T_SEA) return 1;
          }
        return 0;
      }
    }
    return 0;
  }

  expectedFactor(t: PlantType, q: number): number {
    switch (t) {
      case 'river': return q * 0.64;
      case 'reservoir': return q * 0.5;
      case 'wind': return q * 0.42;
      case 'offshore': return q * 0.55;
      case 'solar': return q * 0.12;
      case 'gas': return 0.9;
    }
  }

  checkPlant(t: PlantType, i: number, j: number): PlacementCheck {
    const spec = PLANTS[t];
    const cap = this.plantCap(t);
    const q = this.siteQuality(t, i, j);
    const cost = Math.round(cap * step(spec.costPerMW, this.year) * this.costMult());
    const res: PlacementCheck = { ok: false, quality: q, cost, cap, expected: cap * this.expectedFactor(t, q), weeks: spec.buildWeeks };
    if (!this.isUnlockedPlant(t)) return { ...res, reason: `Tilgjengelig fra ${spec.unlock}` };
    const T = this.terrain;
    if (i < 1 || j < 1 || i >= T.W - 1 || j >= T.H - 1) return { ...res, reason: 'Utenfor kartet' };
    const ty = T.type[j * T.W + i];
    if (t !== 'offshore' && ty === T_FOREIGN) return { ...res, reason: 'Du kan bare bygge i Norge' };
    if (t !== 'offshore' && ty !== T_LAND) return { ...res, reason: 'Må bygges på land' };
    if (t === 'offshore' && ty !== T_SEA) return { ...res, reason: 'Havvind må bygges til havs' };
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) if (this.occ[(j + dj) * T.W + i + di] >= 0) return { ...res, reason: 'For nær noe annet' };
    if (q < spec.minQuality) {
      const why: Record<string, string> = {
        hydro: 'For lite fall og vann her', wind: 'For lite vind her', offshore: 'Ikke egnet havområde (for nær land eller for langt ute)',
        solar: 'For lite sol her', coast: 'Gasskraft må ligge ved kysten',
      };
      return { ...res, reason: why[spec.resource] };
    }
    if (!this.state.unlimited && this.state.money < cost) return { ...res, reason: 'Ikke nok penger' };
    return { ...res, ok: true };
  }

  placePlant(t: PlantType, i: number, j: number): GNode | null {
    const c = this.checkPlant(t, i, j);
    if (!c.ok) return null;
    const spec = PLANTS[t];
    const n: GNode = {
      id: this.state.nextId++, kind: 'plant', ptype: t, i, j, cap: c.cap, quality: c.quality, cost: c.cost,
      progress: 0, buildWeeks: spec.buildWeeks,
    };
    if (t === 'reservoir') { n.storageMax = c.cap * HOURS_PER_WEEK * 24; n.storage = n.storageMax * 0.55; }
    this.spend(c.cost);
    this.state.nodes.push(n);
    this.state.omdomme = clamp(this.state.omdomme + spec.omdomme, 0, 100);
    this.reindex();
    this.emit('built', { node: n, started: true });
    return n;
  }

  private stationCheck(i: number, j: number): string | null {
    const T = this.terrain;
    if (i < 1 || j < 1 || i >= T.W - 1 || j >= T.H - 1) return 'Utenfor kartet';
    const ty = T.type[j * T.W + i];
    if (ty === T_FOREIGN) return 'Du kan bare bygge stasjoner i Norge';
    if (ty !== T_LAND) return 'Stasjoner må stå på land';
    if (this.occ[j * T.W + i] >= 0) return 'Opptatt';
    return null;
  }

  planLine(from: Endpoint, to: Endpoint, v: Voltage): LinePlan {
    const spec = LINES[v];
    const a = 'node' in from ? this.node(from.node) : undefined;
    const b = 'node' in to ? this.node(to.node) : undefined;
    const aTile: [number, number] = a ? [a.i, a.j] : (from as { tile: [number, number] }).tile;
    const bTile: [number, number] = b ? [b.i, b.j] : (to as { tile: [number, number] }).tile;
    const tiles = Math.hypot(bTile[0] - aTile[0], bTile[1] - aTile[1]);
    const km = tiles * 7;
    const cap = this.lineCap(v);
    const newStations = (a ? 0 : 1) + (b ? 0 : 1);
    const plan: LinePlan = { ok: false, cost: 0, tiles, km, seaTiles: 0, weeks: 0, cap, a, b, aTile, bTile, newStations };

    // Prøv langs linja
    const T = this.terrain;
    let sea = 0, foreign = 0, levelSum = 0, landN = 0, lake = 0;
    const steps = Math.max(1, Math.ceil(tiles * 4));
    for (let s = 0; s <= steps; s++) {
      const x = aTile[0] + 0.5 + ((bTile[0] - aTile[0]) * s) / steps;
      const z = aTile[1] + 0.5 + ((bTile[1] - aTile[1]) * s) / steps;
      const k = Math.floor(z) * T.W + Math.floor(x);
      const ty = T.type[k];
      if (ty === T_SEA) sea++;
      else if (ty === T_FOREIGN) foreign++;
      else { levelSum += T.level[k]; landN++; if (ty === T_LAKE) lake++; }
    }
    const seaTiles = (sea / (steps + 1)) * tiles;
    const foreignTiles = (foreign / (steps + 1)) * tiles;
    plan.seaTiles = seaTiles;
    const avgLevel = landN ? levelSum / landN : 0;
    const terrainMult = 1 + 0.07 * avgLevel;
    let cost = spec.fixed + step(spec.perTile, this.year) * (v === 'hvdc' ? tiles : (tiles - seaTiles) * terrainMult + seaTiles * 4);
    cost += newStations * step(STATION_COST, this.year);
    plan.cost = Math.max(1, Math.round(cost * this.costMult()));
    plan.weeks = Math.ceil(spec.buildBase + spec.buildPerTile * tiles);

    const fail = (reason: string) => ({ ...plan, reason });
    if (!this.isUnlockedLine(v)) return fail(`${spec.short} er tilgjengelig fra ${spec.unlock}`);
    if (a && b && a.id === b.id) return fail('Velg et annet endepunkt');
    if (tiles < 0.9) return fail('For kort');
    if (!a) { const r = this.stationCheck(aTile[0], aTile[1]); if (r) return fail(r); }
    if (!b) { const r = this.stationCheck(bTile[0], bTile[1]); if (r) return fail(r); }
    if (tiles > spec.maxTiles) return fail(`For lang for ${spec.short} (maks ${Math.round(spec.maxTiles * 7)} km)`);
    const market = a?.kind === 'market' ? a : b?.kind === 'market' ? b : undefined;
    if (market && !this.isActive(market)) return fail(`Forbindelsen åpner i ${this.marketDef(market).year}`);
    if (foreignTiles > 0.3 && !market) return fail('Linja kan ikke gå gjennom nabolandet');
    if (market) {
      const md = this.marketDef(market);
      if (!md.ac && v !== 'hvdc') return fail(`${md.name} krever HVDC-kabel`);
      if (md.ac && (v === 'v22' || v === 'v66')) return fail('Utenlandsforbindelser krever minst 132 kV');
    }
    if (v !== 'hvdc' && seaTiles > MAX_AC_SEA_TILES) return fail(`For langt over sjø for vekselstrøm – bruk HVDC-kabel`);
    if ((a?.kind === 'industry' || b?.kind === 'industry') && [a, b].some((n) => n && n.kind === 'industry' && !this.isActive(n)))
      return fail('Industrikunden er ikke etablert ennå');
    if (!this.state.unlimited && this.state.money < plan.cost) return fail('Ikke nok penger');
    void lake;
    return { ...plan, ok: true };
  }

  buildLine(from: Endpoint, to: Endpoint, v: Voltage): GLine | null {
    const p = this.planLine(from, to, v);
    if (!p.ok) return null;
    const mkStation = (t: [number, number]) => {
      const n: GNode = { id: this.state.nextId++, kind: 'station', i: t[0], j: t[1], progress: 0, buildWeeks: STATION_WEEKS, cost: step(STATION_COST, this.year) };
      this.state.nodes.push(n);
      this.reindex();
      return n;
    };
    const a = p.a ?? mkStation(p.aTile);
    const b = p.b ?? mkStation(p.bTile);
    const l: GLine = {
      id: this.state.nextId++, a: a.id, b: b.id, v, cap: p.cap, tiles: p.tiles, seaTiles: p.seaTiles,
      cost: p.cost, progress: 0, buildWeeks: p.weeks, outage: 0,
    };
    this.spend(p.cost);
    this.state.lines.push(l);
    this.networkChanged();
    this.emit('built', { line: l, started: true, a, b });
    return l;
  }

  upgradeOptions(l: GLine): { v: Voltage; cost: number; ok: boolean; reason?: string }[] {
    if (l.v === 'hvdc') return [];
    const idx = AC_VOLTAGES.indexOf(l.v);
    const res: { v: Voltage; cost: number; ok: boolean; reason?: string }[] = [];
    for (const v of AC_VOLTAGES.slice(idx + 1)) {
      const p = this.planLine({ node: l.a }, { node: l.b }, v);
      const cost = Math.round(p.cost * 0.75);
      let reason = p.reason;
      if (reason === 'Ikke nok penger') reason = undefined;
      const ok = !reason && (this.state.unlimited || this.state.money >= cost) && !l.upgrade;
      res.push({ v, cost, ok, reason: reason ?? (!ok ? (l.upgrade ? 'Oppgradering pågår' : 'Ikke nok penger') : undefined) });
    }
    return res;
  }

  upgradeLine(l: GLine, v: Voltage): boolean {
    const o = this.upgradeOptions(l).find((x) => x.v === v);
    if (!o || !o.ok) return false;
    const spec = LINES[v];
    this.spend(o.cost);
    l.upgrade = { v, cap: this.lineCap(v), progress: 0, weeks: Math.ceil((spec.buildBase + spec.buildPerTile * l.tiles) * 0.7), cost: o.cost };
    this.emit('built', { line: l, started: true });
    return true;
  }

  plantUpgrade(n: GNode): { cap: number; cost: number; ok: boolean } | null {
    if (n.kind !== 'plant' || n.progress < 1 || n.upgrade) return null;
    const cap = this.plantCap(n.ptype!);
    if (cap <= (n.cap ?? 0) * 1.05) return null;
    const cost = Math.round((cap - n.cap!) * step(PLANTS[n.ptype!].costPerMW, this.year) * 0.85 * this.costMult());
    return { cap, cost, ok: this.state.unlimited || this.state.money >= cost };
  }

  upgradePlant(n: GNode): boolean {
    const u = this.plantUpgrade(n);
    if (!u || !u.ok) return false;
    this.spend(u.cost);
    n.upgrade = { cap: u.cap, progress: 0, weeks: Math.ceil(PLANTS[n.ptype!].buildWeeks * 0.6), cost: u.cost };
    this.emit('built', { node: n, started: true });
    return true;
  }

  rushRepairCost(l: GLine) { return Math.max(2, Math.round(l.cost * 0.04)); }
  rushRepair(l: GLine) {
    const c = this.rushRepairCost(l);
    if (l.outage <= 1 || (!this.state.unlimited && this.state.money < c)) return false;
    this.spend(c);
    l.outage = 1;
    return true;
  }

  demolishLine(l: GLine) {
    this.state.lines = this.state.lines.filter((x) => x !== l);
    this.state.money += Math.round(l.cost * (l.progress >= 1 ? 0.2 : 0.6));
    this.cleanupStations();
    this.networkChanged();
    this.emit('removed', { line: l });
  }

  demolishNode(n: GNode) {
    if (n.kind !== 'plant' && n.kind !== 'station') return;
    for (const l of this.linesOf(n.id)) this.state.lines = this.state.lines.filter((x) => x !== l);
    this.state.nodes = this.state.nodes.filter((x) => x !== n);
    this.state.money += Math.round((n.cost ?? 0) * (n.progress >= 1 ? 0.2 : 0.6));
    this.cleanupStations();
    this.reindex();
    this.networkChanged();
    this.emit('removed', { node: n });
  }

  private cleanupStations() {
    const used = new Set<number>();
    for (const l of this.state.lines) { used.add(l.a); used.add(l.b); }
    this.state.nodes = this.state.nodes.filter((n) => n.kind !== 'station' || used.has(n.id));
    this.reindex();
  }

  private spend(c: number) {
    if (this.state.unlimited) return;
    this.state.money -= c;
    this.state.yearLedger.build += c;
  }

  networkChanged() {
    this.n1Dirty = true;
    this.n1Job = null;
    this.compCache = null;
    this.emit('network');
  }

  /** Sammenhengende komponenter i nettet (bare linjer i drift) */
  components(): Map<number, number> {
    if (this.compCache) return this.compCache;
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    for (const n of this.state.nodes) parent.set(n.id, n.id);
    for (const l of this.state.lines) {
      if (l.progress < 1 || l.outage > 0) continue;
      const ra = find(l.a), rb = find(l.b);
      if (ra !== rb) parent.set(ra, rb);
    }
    const res = new Map<number, number>();
    for (const n of this.state.nodes) res.set(n.id, find(n.id));
    this.compCache = res;
    return res;
  }

  connectedCountries(): number {
    const set = new Set<string>();
    for (const l of this.state.lines) {
      if (l.progress < 1) continue;
      for (const id of [l.a, l.b]) {
        const n = this.node(id)!;
        if (n.kind === 'market') set.add(this.marketDef(n).country);
      }
    }
    return set.size;
  }

  reliability(): number {
    const s = this.state.stats;
    return s.demandMWh > 0 ? s.servedMWh / s.demandMWh : 1;
  }

  // ---------------------------------------------------------------- forbruk og produksjon
  consumerDemand(n: GNode, woy: number, peak = false): number {
    if (!this.isActive(n)) return 0;
    if (n.kind === 'city') {
      const d = this.cityDef(n);
      const base = popAt(d.pop, this.yearFrac) * curve(PER_CAPITA, this.yearFrac);
      const cold = this.eventMult('cold');
      return base * (peak ? 1.25 : seasonDemand(woy) * cold * (0.97 + 0.06 * this.rng()));
    }
    if (n.kind === 'industry') {
      const d = this.indDef(n);
      const ramp = clamp((this.yearFrac - d.year) * 2 + 0.5, 0.5, 1);
      return d.mw * ramp;
    }
    return 0;
  }

  eventMult(type: ActiveEvent['type']): number {
    let m = 1;
    for (const e of this.state.events) if (e.type === type) m *= e.mult ?? 1;
    return m;
  }

  plantAvail(n: GNode, woy: number, peak = false): number {
    if (n.progress < 1) return 0;
    const cap = n.cap ?? 0, q = n.quality ?? 1;
    const T = this.terrain;
    const k = n.j * T.W + n.i;
    const reg = regionOf(T.lat[k], T.lon[k]);
    switch (n.ptype) {
      case 'river': return peak ? cap * Math.min(1, q) * 0.45 : cap * Math.min(1, q * riverFlow(woy) * this.eventMult('dry') * this.eventMult('wet'));
      case 'reservoir': return Math.min(cap, (n.storage ?? 0) / HOURS_PER_WEEK);
      case 'wind': return peak ? cap * 0.3 : cap * clamp(q * (0.25 + 0.95 * this.state.weather[reg]) * windSeason(woy) * 0.62, 0.03, 1);
      case 'offshore': return peak ? cap * 0.35 : cap * clamp(q * (0.35 + 0.8 * this.state.weather[reg]) * windSeason(woy) * 0.7, 0.05, 1);
      case 'solar': return peak ? 0 : cap * q * solarSeason(woy, T.lat[k]) * (0.6 + 0.6 * (1 - this.state.weather[reg]));
      case 'gas': return cap * 0.95;
    }
    return 0;
  }

  waterValue(n: GNode): number {
    const lvl = (n.storage ?? 0) / (n.storageMax || 1);
    return 2 + 75 * Math.pow(1 - lvl, 2.2);
  }

  marginalCost(n: GNode): number {
    switch (n.ptype) {
      case 'river': return 0.5;
      case 'reservoir': return this.waterValue(n);
      case 'wind': case 'offshore': return 0.3;
      case 'solar': return 0.2;
      case 'gas': return GAS_PRICE + curve(CO2_PRICE, this.yearFrac);
    }
    return 1;
  }

  marketPrice(id: string): number {
    return this.state.prices[id] ?? MARKETS.find((m) => m.id === id)!.basePrice;
  }

  // ---------------------------------------------------------------- nettløsning
  private solveNetwork(opts: { peak?: boolean; exclude?: number; woy: number }) {
    const nodes = this.state.nodes;
    const idx = new Map<number, number>();
    let k = 2;
    for (const n of nodes) idx.set(n.id, k++);
    const mcf = new MinCostFlow(k);
    const S = 0, T = 1;
    const plantE = new Map<number, number>();
    const consE = new Map<number, number>();
    const mktE = new Map<number, [number, number]>();
    const lineE = new Map<number, [number, number]>();
    const lineCapSum = new Map<number, number>();
    for (const l of this.state.lines) {
      if (l.progress < 1 || l.outage > 0 || l.id === opts.exclude) continue;
      const ia = idx.get(l.a)!, ib = idx.get(l.b)!;
      const spec = LINES[l.v];
      const c = l.tiles * 0.07 * spec.lossPct * 0.3 + 0.01;
      lineE.set(l.id, [mcf.addEdge(ia, ib, l.cap, c), mcf.addEdge(ib, ia, l.cap, c)]);
      lineCapSum.set(l.a, (lineCapSum.get(l.a) ?? 0) + l.cap);
      lineCapSum.set(l.b, (lineCapSum.get(l.b) ?? 0) + l.cap);
    }
    for (const n of nodes) {
      const i = idx.get(n.id)!;
      if (n.kind === 'plant') {
        const av = opts.peak ? this.plantAvail(n, opts.woy, true) : n.avail ?? 0;
        if (av > 0 && lineCapSum.has(n.id)) plantE.set(n.id, mcf.addEdge(S, i, av, this.marginalCost(n)));
      } else if (n.kind === 'city' || n.kind === 'industry') {
        const d = opts.peak ? this.consumerDemand(n, opts.woy, true) : n.demand ?? 0;
        if (d > 0 && lineCapSum.has(n.id)) consE.set(n.id, mcf.addEdge(i, T, d, n.kind === 'city' ? -VALUE_CITY : -VALUE_IND));
      } else if (n.kind === 'market' && this.isActive(n) && lineCapSum.has(n.id)) {
        const cap = lineCapSum.get(n.id)!;
        const p = this.marketPrice(n.ref!);
        mktE.set(n.id, [mcf.addEdge(S, i, cap, p + 1), opts.peak ? -1 : mcf.addEdge(i, T, cap, -(p - 1))]);
      }
    }
    mcf.solve(S, T);
    return { mcf, plantE, consE, mktE, lineE };
  }

  // ---------------------------------------------------------------- ukessimulering
  tick() {
    const st = this.state;
    if (st.ended) return;
    const prevYear = this.year;
    st.week++;
    const woy = this.woy;
    const year = this.year;
    const L = emptyLedger();

    // Vær: AR(1) per region
    for (let r = 0; r < REGIONS; r++) st.weather[r] = clamp(0.65 * st.weather[r] + 0.35 * this.rng() + (this.rng() - 0.5) * 0.1, 0, 1);
    // Markedspriser
    for (const m of MARKETS) {
      const nz = (st.priceNoise[m.id] ?? 0) * 0.8 + (this.rng() - 0.5) * 0.25;
      st.priceNoise[m.id] = nz;
      const season = 1 + 0.25 * Math.cos((2 * Math.PI * (woy - 3)) / 52);
      st.prices[m.id] = Math.max(3, m.basePrice * season * (1 + nz) * this.eventMult('price') * (m.country === 'SE' || m.country === 'FI' ? 1 : 1));
    }
    // Hendelser utløper
    st.events = st.events.filter((e) => e.until > st.week);

    // Bygging
    let networkChange = false;
    for (const n of st.nodes) {
      if (n.progress < 1) {
        n.progress = Math.min(1, n.progress + 1 / Math.max(1, n.buildWeeks));
        if (n.progress >= 1) { this.emit('built', { node: n, done: true }); networkChange = true; this.toastBuilt(n); }
      }
      if (n.upgrade) {
        n.upgrade.progress += 1 / n.upgrade.weeks;
        if (n.upgrade.progress >= 1) {
          const ratio = n.upgrade.cap / (n.cap || 1);
          n.cap = n.upgrade.cap;
          n.cost = (n.cost ?? 0) + n.upgrade.cost;
          if (n.storageMax) { n.storageMax *= ratio; n.storage = (n.storage ?? 0) * ratio; }
          n.upgrade = undefined;
          this.emit('built', { node: n, done: true, upgraded: true });
          this.news('⚙️', 'Oppgradering ferdig', `${this.nodeName(n)} produserer nå inntil ${Math.round(n.cap)} MW.`, 'good');
          networkChange = true;
        }
      }
    }
    for (const l of st.lines) {
      if (l.progress < 1) {
        l.progress = Math.min(1, l.progress + 1 / Math.max(1, l.buildWeeks));
        if (l.progress >= 1) { this.emit('built', { line: l, done: true }); networkChange = true; }
      }
      if (l.upgrade) {
        l.upgrade.progress += 1 / l.upgrade.weeks;
        if (l.upgrade.progress >= 1) {
          l.v = l.upgrade.v; l.cap = l.upgrade.cap; l.cost += l.upgrade.cost; l.upgrade = undefined;
          this.emit('built', { line: l, done: true, upgraded: true });
          this.news('⚡', 'Linje oppgradert', `Linja ${this.lineName(l)} er nå ${LINES[l.v].short}.`, 'good');
          networkChange = true;
        }
      }
      if (l.outage > 0) {
        l.outage--;
        if (l.outage === 0) { networkChange = true; this.emit('repaired', l); }
      }
    }
    if (networkChange) this.networkChanged();

    // Forbruk og tilgjengelighet
    for (const n of st.nodes) {
      if (n.kind === 'city' || n.kind === 'industry') n.demand = this.consumerDemand(n, woy);
      if (n.kind === 'plant') n.avail = this.plantAvail(n, woy);
    }

    // Løs nettet
    const { mcf, plantE, consE, mktE, lineE } = this.solveNetwork({ woy });
    const tariff = curve(TARIFF, this.yearFrac);
    let demand = 0, served = 0, gen = 0, renew = 0, imp = 0, exp = 0, loss = 0, unservedPowered = 0, demandPowered = 0, capacity = 0;
    let storage = 0, storageMax = 0;
    for (const n of st.nodes) {
      if (n.kind === 'plant') {
        const e = plantE.get(n.id);
        n.out = e !== undefined ? mcf.flow[e] : 0;
        gen += n.out;
        if (n.progress >= 1) capacity += n.cap ?? 0;
        if (PLANTS[n.ptype!].renewable) renew += n.out;
        if (n.ptype === 'gas') L.fuel += n.out * (GAS_PRICE + curve(CO2_PRICE, this.yearFrac)) * K;
        if (n.progress >= 1) L.maint += ((n.cost ?? 0) * PLANTS[n.ptype!].maintPct) / 100 / 52;
        if (n.ptype === 'reservoir' && n.progress >= 1) {
          const inMWh = (n.cap ?? 0) * (n.quality ?? 1) * 0.5 * (inflow(woy) / 1.12) * HOURS_PER_WEEK * this.eventMult('dry') * this.eventMult('wet');
          n.storage = clamp((n.storage ?? 0) + inMWh - n.out * HOURS_PER_WEEK, 0, n.storageMax ?? 0);
          storage += n.storage; storageMax += n.storageMax ?? 0;
        }
      } else if (n.kind === 'city' || n.kind === 'industry') {
        const e = consE.get(n.id);
        n.served = e !== undefined ? mcf.flow[e] : 0;
        const d = n.demand ?? 0;
        if (d <= 0) continue;
        demand += d; served += n.served;
        L.revenue += n.served * tariff * K * (n.kind === 'industry' ? 0.6 : 1);
        if (!n.everPowered && n.served >= d * 0.6) {
          n.everPowered = true;
          this.emit('powered', n);
          if (n.kind === 'city') this.news('💡', `${this.nodeName(n)} har fått strøm!`, `Lyset er tent i ${this.nodeName(n)}.`, 'good');
        }
        if (n.kind === 'industry' && !n.questDone && n.served >= d * 0.9) {
          n.questDone = true;
          const def = this.indDef(n);
          if (this.yearFrac <= def.deadline) {
            this.addMoney(def.reward, 'grants');
            this.news('🏭', `Kontrakt oppfylt: ${def.name}`, `${def.owner} betaler ${def.reward} MNOK i anleggsbidrag. ${def.fact}`, 'quest');
            this.emit('quest', { node: n, reward: def.reward });
          } else {
            this.news('🏭', `${def.name} er tilkoblet`, def.fact, 'good');
          }
        }
        if (n.everPowered) {
          demandPowered += d;
          const uns = Math.max(0, d - n.served);
          unservedPowered += uns;
          L.kile += uns * tariff * KILE_FACTOR * K;
          const wasBlack = !!n.blackout;
          n.blackout = n.served < d * 0.9;
          if (n.blackout && !wasBlack) this.emit('blackout', n);
          if (!n.blackout && wasBlack) this.emit('restored', n);
        }
      } else if (n.kind === 'market') {
        const e = mktE.get(n.id);
        if (e) {
          const im = mcf.flow[e[0]], ex = e[1] >= 0 ? mcf.flow[e[1]] : 0;
          const p = this.marketPrice(n.ref!);
          n.netExport = ex - im;
          n.price = p;
          imp += im; exp += ex;
          L.importCost += im * p * K;
          L.exportRev += ex * p * K;
        } else { n.netExport = 0; n.price = this.marketPrice(n.ref!); }
      }
    }
    for (const l of st.lines) {
      const e = lineE.get(l.id);
      if (!e) { l.flow = 0; l.loss = 0; continue; }
      l.flow = mcf.flow[e[0]] - mcf.flow[e[1]];
      const spec = LINES[l.v];
      const f = Math.abs(l.flow);
      l.loss = f * (spec.lossPct / 100) * ((l.tiles * 7) / 100) * Math.min(1, f / l.cap) * 1.2;
      loss += l.loss;
      if (l.progress >= 1) L.maint += (l.cost * 0.01) / 52;
    }
    L.losses = loss * tariff * K;
    this.totals = { demand, served, gen, imp, exp, loss, renew, unserved: demand - served, storage, storageMax, capacity };

    // Økonomi
    if (st.unlimited) {
      // ingen økonomi i ubegrenset modus, men vis tall
    }
    // KILE kan aldri presse en tom kasse videre ned – spillet skal ikke havne i en dødsspiral
    if (st.money - L.kile < 0) L.kile = Math.max(0, st.money);
    const net = L.revenue + L.exportRev - L.importCost - L.fuel - L.maint - L.kile - L.losses;
    if (!st.unlimited) st.money += net;
    this.weekLedger = L;
    for (const key of Object.keys(L) as (keyof Ledger)[]) if (key !== 'build' && key !== 'grants') st.yearLedger[key] += L[key];

    // Statistikk
    const s = st.stats;
    s.demandMWh += demandPowered * HOURS_PER_WEEK;
    s.servedMWh += (demandPowered - unservedPowered) * HOURS_PER_WEEK;
    s.exportRev += L.exportRev;
    s.genMWh += gen * HOURS_PER_WEEK;
    if (gen > 0) s.renewEMA = s.renewEMA * 0.985 + (renew / gen) * 0.015;
    if (unservedPowered > 0.5) s.blackoutWeeks++;

    // Omdømme
    const uShare = demandPowered > 0 ? unservedPowered / demandPowered : 0;
    if (uShare > 0.005) st.omdomme = clamp(st.omdomme - Math.min(0.7, 4 * uShare), 0, 100);
    else st.omdomme = clamp(st.omdomme + 0.15, 0, 100);
    // Varsle tidlig nok til at et elvekraftverk (12 uker) rekker å bli ferdig før frosten, og minn på igjen om høsten.
    if (woy === WINTER_WARN_WEEK || woy === 38) this.winterCheck(woy === WINTER_WARN_WEEK);

    this.runEvents();
    if (year !== prevYear) this.newYear();

    this.evaluateObjectives();
    if (this.state.mode === 'campaign') {
      const ch = this.chapterDef;
      if (ch && year >= ch.endYear) this.endChapter();
    }
    this.emit('tick');
  }

  lineName(l: GLine): string {
    return `${this.nodeName(this.node(l.a)!)} – ${this.nodeName(this.node(l.b)!)}`;
  }

  addMoney(x: number, kind: keyof Ledger = 'grants') {
    this.state.money += x;
    this.state.yearLedger[kind] += x;
  }

  news(icon: string, title: string, text: string, kind: NewsItem['kind'] = 'info') {
    const item: NewsItem = { week: this.state.week, icon, title, text, kind };
    this.state.news.unshift(item);
    if (this.state.news.length > 60) this.state.news.length = 60;
    this.emit('news', item);
  }

  private toastBuilt(n: GNode) {
    if (n.kind === 'plant') this.news(PLANTS[n.ptype!].icon, `${PLANTS[n.ptype!].name} i drift`, `${Math.round(n.cap ?? 0)} MW ny kapasitet er klar.`, 'good');
  }

  private newYear() {
    const st = this.state;
    st.lastYearLedger = st.yearLedger;
    st.yearLedger = emptyLedger();
    const y = this.year;
    for (const h of HISTORY) if (h.year === y) this.news('📜', `${y}: ${h.title}`, h.text, 'history');
    for (const d of INDUSTRIES) {
      const n = this.nodeByRef(d.id)!;
      if (Math.floor(d.year) === y && this.isActive(n)) {
        this.news('📋', `Ny industrikunde: ${d.name}`, `${d.owner} trenger ${d.mw} MW. Koble til før ${d.deadline} for å få ${d.reward} MNOK i anleggsbidrag.`, 'quest');
        this.emit('industry', n);
      }
    }
    for (const m of MARKETS) {
      const n = this.nodeByRef(m.id)!;
      if (m.year === y && this.isActive(n)) this.news('🌍', `Ny mulighet: ${m.name}`, m.fact, 'info');
    }
    for (const t of Object.values(PLANTS)) if (t.unlock === y) this.news(t.icon, `Ny teknologi: ${t.name}`, t.fact, 'info');
    for (const v of Object.values(LINES)) if (v.unlock === y) this.news('⚡', `Ny teknologi: ${v.name}`, v.desc, 'info');
    for (const t of Object.values(PLANTS)) {
      const c = t.cap.find(([yy]) => yy === y && yy !== t.unlock);
      if (c) this.news('🔧', `Større ${t.name.toLowerCase()}`, `Nye ${t.name.toLowerCase()} kan nå bygges med ${c[1]} MW. Eksisterende anlegg kan oppgraderes.`, 'info');
    }
    // Tørrår / våtår
    if (y >= 1950) {
      const r = this.rng();
      if (y === 1996 || y === 2003 || (r < 0.1 && y > 1960)) {
        st.events.push({ type: 'dry', until: st.week + 52, mult: 0.68 });
        this.emit('climate', 'dry'); this.news('🏜️', 'Tørrår!', 'Lite snø i fjellet gir svakt tilsig. Magasinene fylles dårlig – vurder import og spar på vannet.', 'bad');
      } else if (r > 0.9) {
        st.events.push({ type: 'wet', until: st.week + 52, mult: 1.3 });
        this.emit('climate', 'wet'); this.news('🌧️', 'Våtår', 'Rekordmye nedbør! Magasinene blir fulle – godt år for eksport.', 'good');
      }
    }
    if (y === 2022) {
      st.events.push({ type: 'price', until: st.week + 45, mult: 3.2 });
      this.emit('climate', 'price'); this.news('📈', 'Energikrise i Europa', 'Prisene på kontinentet har tredoblet seg. Eksport er lukrativt – men pass på magasinene!', 'bad');
    }
    this.emit('year', y);
  }

  private runEvents() {
    const st = this.state;
    const allowStorms = st.mode === 'free' ? this.year >= 1950 : st.chapter >= 2;
    const woy = this.woy;
    const winter = woy < 12 || woy > 42;
    if (allowStorms && st.lines.length > 3 && this.rng() < (winter ? 0.035 : 0.008)) {
      const cands = st.lines.filter((l) => l.progress >= 1 && l.outage === 0 && l.v !== 'hvdc');
      if (cands.length) {
        // vektlegg lange linjer og kystnære
        const w = cands.map((l) => l.tiles + 2);
        let r = this.rng() * w.reduce((a, b) => a + b, 0);
        let pick = cands[0];
        for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { pick = cands[i]; break; } }
        pick.outage = 2 + Math.floor(this.rng() * 5);
        const names = ['Dagmar', 'Narve', 'Ole', 'Gudrun', 'Hilde', 'Tor', 'Ingunn', 'Berit', 'Ylva', 'Knud', 'Frida', 'Elsa'];
        const name = names[Math.floor(this.rng() * names.length)];
        this.news('🌩️', `Ekstremværet «${name}»`, `Linja ${this.lineName(pick)} er slått ut i ${pick.outage} uker.`, 'bad');
        this.networkChanged();
        this.emit('outage', pick);
      }
    }
    if (winter && this.year >= 1930 && this.rng() < 0.012 && !st.events.some((e) => e.type === 'cold')) {
      st.events.push({ type: 'cold', until: st.week + 3, mult: 1.18 });
      this.emit('climate', 'cold'); this.news('🥶', 'Kuldeperiode', 'Kraftig kulde i hele landet gir rekordhøyt forbruk de neste ukene.', 'bad');
    }
  }

  /** Varsler før vinteren dersom forventet produksjon ikke dekker toppforbruket */
  /** Sammenhengende nett inkludert linjer som er under bygging (for planlegging). */
  private plannedComponents(): Map<number, number> {
    const parent = new Map<number, number>();
    const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
    for (const n of this.state.nodes) parent.set(n.id, n.id);
    for (const l of this.state.lines) { const ra = find(l.a), rb = find(l.b); if (ra !== rb) parent.set(ra, rb); }
    const out = new Map<number, number>();
    for (const n of this.state.nodes) out.set(n.id, find(n.id));
    return out;
  }

  /** Hvor mye et nytt elvekraftverk med gitt kvalitet gir midt på vinteren (MW). */
  riverWinterMW(q: number): number { return this.plantCap('river') * Math.min(1, q * riverFlow(4)); }

  /**
   * Gode byggeplasser for et kraftverk innen rekkevidde av en node, spredt utover kartet.
   * Brukes til å vise forslag i starten av kampanjen.
   */
  suggestSites(t: PlantType, near: GNode, maxDist: number, count = 3): { i: number; j: number; quality: number }[] {
    const cands: { i: number; j: number; quality: number; score: number }[] = [];
    const r = Math.floor(maxDist);
    for (let j = near.j - r; j <= near.j + r; j++)
      for (let i = near.i - r; i <= near.i + r; i++) {
        const d = Math.hypot(i - near.i, j - near.j);
        if (d > maxDist || d < 2) continue;
        const c = this.checkPlant(t, i, j);
        if (!c.ok && c.reason !== 'Ikke nok penger') continue;
        // Kvalitet teller mest, men kortere linje er en fordel (billigere og mindre tap)
        cands.push({ i, j, quality: c.quality, score: c.quality - d * 0.012 });
      }
    cands.sort((a, b) => b.score - a.score);
    const out: { i: number; j: number; quality: number }[] = [];
    for (const c of cands) {
      if (out.some((o) => Math.hypot(o.i - c.i, o.j - c.j) < 3)) continue;
      out.push({ i: c.i, j: c.j, quality: c.quality });
      if (out.length >= count) break;
    }
    return out;
  }

  winterCheck(early = false) {
    // Tell med planlagte linjer og kraftverk som blir ferdige før frosten, så varselet stemmer med det spilleren alt har satt i gang
    const comps = this.plannedComponents();
    const woy = this.woy;
    const weeksToFrost = (WINTER_START_WEEK - woy + 52) % 52;
    const need = new Map<number, number>(), have = new Map<number, number>();
    for (const n of this.state.nodes) {
      const c = comps.get(n.id)!;
      const consumer = n.kind === 'city' || n.kind === 'industry';
      if (consumer && (n.everPowered || this.linesOf(n.id).length > 0)) need.set(c, (need.get(c) ?? 0) + this.consumerDemand(n, 4) * 1.04);
      const ready = n.progress >= 1 || (1 - n.progress) * Math.max(1, n.buildWeeks ?? 1) <= weeksToFrost;
      if (n.kind === 'plant' && ready) {
        let a = 0;
        if (n.ptype === 'river') a = (n.cap ?? 0) * Math.min(1, (n.quality ?? 1) * riverFlow(4));
        else if (n.ptype === 'reservoir') a = Math.min(n.cap ?? 0, (n.storage ?? 0) / HOURS_PER_WEEK / 10);
        else a = this.plantAvail(n, 4, true);
        have.set(c, (have.get(c) ?? 0) + a);
      }
      if (n.kind === 'market' && this.isActive(n)) have.set(c, (have.get(c) ?? 0) + this.linesOf(n.id).reduce((s, l) => s + l.cap, 0));
    }
    let deficit = 0;
    for (const [c, d] of need) deficit += Math.max(0, d - (have.get(c) ?? 0));
    if (deficit > 0.5) {
      const riverWeeks = PLANTS.river.buildWeeks;
      const perPlant = this.riverWinterMW(0.55);
      const plants = Math.max(1, Math.ceil(deficit / Math.max(0.1, perPlant)));
      let tip: string;
      if (early || riverWeeks <= weeksToFrost) {
        tip = `Et elvekraftverk tar ${riverWeeks} uker å bygge og gir bare rundt ${perPlant.toFixed(1).replace('.', ',')} MW midt på vinteren, så du trenger omtrent ${plants} til. Bygger du nå, står ${plants > 1 ? 'de' : 'det'} klare før frosten.`;
        if (this.isUnlockedPlant('reservoir')) tip += ' Et magasinkraftverk sparer vann til vinteren.';
      } else {
        tip = this.isUnlockedPlant('reservoir')
          ? 'Bygg mer produksjon eller et magasinkraftverk – det som startes nå, hjelper i siste del av vinteren.'
          : 'Nye elvekraftverk blir ikke ferdige før midtvinters, men bygg likevel – de hjelper resten av vinteren.';
      }
      this.news('❄️', early ? 'Planlegg for vinteren' : 'Vinteren nærmer seg', `Forventet underskudd på rundt ${Math.ceil(deficit)} MW i vinter. Elvene gir lite når det er kaldt. ${tip}`, 'bad');
      this.emit('winterWarning', { deficit, early });
    }
  }

  /** Forklarer hvorfor en kunde mangler strøm */
  diagnose(n: GNode): { cause: 'gen' | 'grid' | 'isolated'; text: string; line?: GLine } {
    const mw = (x: number) => (x < 10 ? x.toFixed(1).replace('.', ',') : Math.round(x).toString());
    if (!this.linesOf(n.id).some((l) => l.progress >= 1 && l.outage === 0))
      return { cause: 'isolated', text: `Alle linjene inn til ${this.nodeName(n)} er ute av drift, så det finnes ingen vei for strømmen.` };
    const comps = this.components();
    const c = comps.get(n.id);
    let supply = 0, demand = 0, riverCap = 0, riverAvail = 0;
    for (const m of this.state.nodes) {
      if (comps.get(m.id) !== c) continue;
      if (m.kind === 'plant' && m.progress >= 1) {
        supply += m.avail ?? 0;
        if (m.ptype === 'river') { riverCap += m.cap ?? 0; riverAvail += m.avail ?? 0; }
      }
      if ((m.kind === 'city' || m.kind === 'industry') && (m.demand ?? 0) > 0 && this.linesOf(m.id).length) demand += m.demand!;
      if (m.kind === 'market' && this.isActive(m)) supply += this.linesOf(m.id).filter((l) => l.progress >= 1 && l.outage === 0).reduce((s, l) => s + l.cap, 0);
    }
    if (supply < demand * 0.995) {
      const woy = this.woy;
      const winter = woy < 12 || woy > 44;
      let t = `Kraftverkene i dette nettet kan levere ${mw(supply)} MW akkurat nå, men kundene trenger ${mw(demand)} MW.`;
      if (riverCap > 0) t += ` Elvekraftverkene gir bare ${Math.round((riverAvail / riverCap) * 100)} % av kapasiteten sin nå${winter ? ' fordi vannføringen er lav om vinteren' : ''}.`;
      if (winter) t += ' Samtidig bruker folk mer strøm til oppvarming.';
      return { cause: 'gen', text: t };
    }
    let best: GLine | undefined, bd = Infinity;
    for (const l of this.state.lines) {
      if (l.progress < 1 || l.outage > 0 || comps.get(l.a) !== c || Math.abs(l.flow ?? 0) < l.cap * 0.97) continue;
      const a = this.node(l.a)!, b = this.node(l.b)!;
      const d = Math.hypot((a.i + b.i) / 2 - n.i, (a.j + b.j) / 2 - n.j);
      if (d < bd) { bd = d; best = l; }
    }
    if (best) return { cause: 'grid', line: best, text: `Det finnes nok kraft, men den kommer ikke fram: linja ${this.lineName(best)} er full (${mw(best.cap)} MW). Det er en flaskehals.` };
    return { cause: 'grid', text: 'Det finnes nok kraft, men nettet klarer ikke å frakte den fram til kundene.' };
  }

  /** Grov prognose: forventet produksjon og forbruk de neste månedene (uten nettbegrensninger) */
  forecastBalance(months = 12): { label: string; demand: number; supply: number; woy: number }[] {
    const res: { label: string; demand: number; supply: number; woy: number }[] = [];
    const T = this.terrain;
    const start = this.state.week;
    const curMonth = monthOf(this.woy);
    for (let m = 0; m < months; m++) {
      const month = (curMonth + m) % 12;
      const midWoy = Math.round(((month + 0.5) * 52) / 12);
      let ahead = m === 0 ? 0 : midWoy - this.woy;
      while (ahead < 0) ahead += 52;
      const week = start + ahead;
      const woy = m === 0 ? this.woy : midWoy % 52, yf = 1900 + week / 52;
      let demand = 0, supply = 0;
      for (const n of this.state.nodes) {
        const connected = this.linesOf(n.id).length > 0;
        if ((n.kind === 'city' || n.kind === 'industry') && this.isActive(n) && (n.everPowered || connected)) {
          if (n.kind === 'city') { const d = this.cityDef(n); demand += popAt(d.pop, yf) * curve(PER_CAPITA, yf) * seasonDemand(woy); }
          else demand += this.indDef(n).mw;
        } else if (n.kind === 'plant' && connected) {
          const ready = n.progress >= 1 || (1 - n.progress) * n.buildWeeks <= ahead;
          if (!ready) continue;
          const cap = n.cap ?? 0, q = n.quality ?? 1;
          switch (n.ptype) {
            case 'river': supply += cap * Math.min(1, q * riverFlow(woy)); break;
            case 'reservoir': supply += cap * 0.95; break;
            case 'wind': supply += cap * q * 0.42 * windSeason(woy); break;
            case 'offshore': supply += cap * q * 0.55 * windSeason(woy); break;
            case 'solar': supply += cap * q * solarSeason(woy, T.lat[n.j * T.W + n.i]); break;
            case 'gas': supply += cap * 0.95; break;
          }
        } else if (n.kind === 'market' && this.isActive(n)) {
          supply += this.linesOf(n.id).filter((l) => l.progress >= 1 || (1 - l.progress) * l.buildWeeks <= ahead).reduce((s, l) => s + l.cap, 0);
        }
      }
      res.push({ label: MONTHS[monthOf(woy)].slice(0, 3), demand, supply, woy });
    }
    return res;
  }

  // ---------------------------------------------------------------- mål og kapitler
  evaluateObjectives() {
    const ch = this.chapterDef;
    if (!ch) return;
    const st = this.state;
    const ev = (o: (typeof ch.main)[number]) => {
      const key = `obj:${st.chapter}:${o.id}`;
      if (o.sticky && st.flags[key]) return { done: true, progress: 1, label: '✓' };
      const r = o.eval(this);
      if (r.done && !st.flags[key] && !o.finalOnly) {
        st.flags[key] = true;
        this.emit('objective', o);
      }
      return o.finalOnly ? r : st.flags[key] ? { ...r, done: true } : r;
    };
    this.objectiveCache = { main: ch.main.map(ev), stars: ch.stars.map(ev) };
  }

  chapterProgress() {
    const c = this.objectiveCache;
    const mainDone = c.main.length > 0 && c.main.every((m) => m.done);
    const stars = mainDone ? 1 + c.stars.filter((s) => s.done).length : 0;
    return { mainDone, stars };
  }

  private endChapter() {
    const st = this.state;
    this.evaluateObjectives();
    const { stars } = this.chapterProgress();
    st.ended = true;
    this.emit('chapterEnd', { chapter: st.chapter, stars });
  }

  /** Starter neste kapittel (eller samme kapittel på nytt fra lagret tilstand håndteres utenfor) */
  advanceChapter() {
    const st = this.state;
    const { stars } = this.chapterProgress();
    st.chapterResults[st.chapter] = Math.max(st.chapterResults[st.chapter] ?? 0, stars);
    if (st.chapter + 1 >= CHAPTERS.length) {
      st.mode = 'free';
      st.chapter = -1;
      st.ended = false;
      this.emit('campaignDone');
      return;
    }
    st.chapter++;
    this.beginChapter();
  }

  beginChapter() {
    const st = this.state;
    const ch = CHAPTERS[st.chapter];
    st.ended = false;
    const target = (ch.startYear - 1900) * 52 + ch.startWoy;
    if (st.week < target) st.week = target;
    if (st.chapter > 0) this.addMoney(ch.grant, 'grants');
    st.stats = { demandMWh: 0, servedMWh: 0, exportRev: 0, renewEMA: st.stats?.renewEMA ?? 1, genMWh: 0, blackoutWeeks: 0, startWeek: st.week };
    this.evaluateObjectives();
    this.networkChanged();
    this.emit('chapterStart', st.chapter);
  }

  // ---------------------------------------------------------------- N-1
  /** Kjør litt av N-1-analysen. Returnerer true når ferdig. */
  stepN1(budget = 12): boolean {
    if (!this.n1Job) {
      if (!this.n1Dirty) return true;
      const lines = this.state.lines.filter((l) => l.progress >= 1 && l.outage === 0).map((l) => l.id);
      const base = this.solveNetwork({ peak: true, woy: 2 });
      const baseServed = new Map<number, number>();
      for (const [id, e] of base.consE) baseServed.set(id, base.mcf.flow[e]);
      this.n1Job = { lines, idx: 0, base: baseServed, risk: new Set(), crit: new Set() };
    }
    const job = this.n1Job;
    let c = 0;
    while (job.idx < job.lines.length && c < budget) {
      const lid = job.lines[job.idx++];
      c++;
      const r = this.solveNetwork({ peak: true, exclude: lid, woy: 2 });
      let critical = false;
      for (const [id, s0] of job.base) {
        const e = r.consE.get(id);
        const s1 = e !== undefined ? r.mcf.flow[e] : 0;
        if (s1 < s0 - Math.max(0.3, s0 * 0.02)) { job.risk.add(id); critical = true; }
      }
      if (critical) job.crit.add(lid);
    }
    if (job.idx >= job.lines.length) {
      for (const n of this.state.nodes) {
        if (n.kind !== 'city' && n.kind !== 'industry') continue;
        if (!job.base.has(n.id) || (job.base.get(n.id) ?? 0) <= 0) { n.n1 = undefined; continue; }
        n.n1 = job.risk.has(n.id) ? 'risk' : 'ok';
      }
      for (const l of this.state.lines) l.critical = job.crit.has(l.id);
      this.n1Job = null;
      this.n1Dirty = false;
      this.emit('n1');
      return true;
    }
    return false;
  }

  /** Prognose for forbruk om N år (MW, snitt) */
  forecast(n: GNode, years: number): number {
    if (n.kind === 'city') {
      const d = this.cityDef(n);
      const y = this.yearFrac + years;
      return popAt(d.pop, y) * curve(PER_CAPITA, y);
    }
    if (n.kind === 'industry') return this.indDef(n).mw;
    return 0;
  }
}
