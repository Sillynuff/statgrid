import type { PlantType, Voltage } from './config';

export type NodeKind = 'city' | 'industry' | 'market' | 'plant' | 'station';

export interface GNode {
  id: number;
  kind: NodeKind;
  i: number;
  j: number;
  ref?: string; // id i CITIES / INDUSTRIES / MARKETS
  ptype?: PlantType;
  cap?: number;
  quality?: number;
  cost?: number; // investert beløp (MNOK)
  progress: number; // 0..1, 1 = i drift
  buildWeeks: number;
  upgrade?: { cap: number; progress: number; weeks: number; cost: number };
  storage?: number; // MWh
  storageMax?: number;
  everPowered?: boolean;
  questDone?: boolean;
  n1?: 'ok' | 'risk';
  // kjøretidsverdier
  out?: number;
  avail?: number;
  demand?: number;
  served?: number;
  blackout?: boolean;
  price?: number;
  netExport?: number;
}

export interface GLine {
  id: number;
  a: number;
  b: number;
  v: Voltage;
  cap: number;
  tiles: number;
  seaTiles: number;
  cost: number;
  progress: number;
  buildWeeks: number;
  upgrade?: { v: Voltage; cap: number; progress: number; weeks: number; cost: number };
  outage: number; // uker igjen av utfall
  critical?: boolean;
  flow?: number; // MW, positiv a -> b
  loss?: number;
}

export interface Ledger {
  revenue: number;
  exportRev: number;
  importCost: number;
  fuel: number;
  maint: number;
  kile: number;
  losses: number;
  grants: number;
  build: number;
}

export function emptyLedger(): Ledger {
  return { revenue: 0, exportRev: 0, importCost: 0, fuel: 0, maint: 0, kile: 0, losses: 0, grants: 0, build: 0 };
}

export interface ChapterStats {
  demandMWh: number;
  servedMWh: number;
  exportRev: number;
  renewEMA: number;
  genMWh: number;
  blackoutWeeks: number;
  startWeek: number;
}

export interface ActiveEvent {
  type: 'storm' | 'cold' | 'dry' | 'wet' | 'price';
  until: number; // uke
  mult?: number;
  region?: string;
}

export interface NewsItem {
  week: number;
  icon: string;
  title: string;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'history' | 'quest';
}

export interface GameState {
  version: number;
  mode: 'campaign' | 'free';
  chapter: number;
  week: number; // uker siden 1. januar 1900
  money: number;
  omdomme: number;
  seed: number;
  rngState: number;
  nodes: GNode[];
  lines: GLine[];
  nextId: number;
  flags: Record<string, boolean | number | string>;
  stats: ChapterStats;
  events: ActiveEvent[];
  weather: number[];
  prices: Record<string, number>;
  priceNoise: Record<string, number>;
  news: NewsItem[];
  yearLedger: Ledger;
  lastYearLedger: Ledger;
  chapterResults: Record<number, number>; // stjerner per kapittel
  freeStartYear?: number;
  unlimited?: boolean;
  ended?: boolean;
}
