// Teknologikatalog. Tall er forenklet, men proporsjonene følger virkeligheten.
export type Curve = [number, number][];

export function curve(c: Curve, x: number): number {
  if (x <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (x <= c[i][0]) {
      const [x0, y0] = c[i - 1], [x1, y1] = c[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return c[c.length - 1][1];
}
/** Trappefunksjon: siste verdi med år <= x */
export function step(c: Curve, x: number): number {
  let v = c[0][1];
  for (const [k, y] of c) if (x >= k) v = y;
  return v;
}

export type PlantType = 'river' | 'reservoir' | 'wind' | 'offshore' | 'solar' | 'gas';
export type Resource = 'river' | 'hydro' | 'wind' | 'offshore' | 'solar' | 'coast';

export interface PlantSpec {
  type: PlantType; name: string; short: string; icon: string; unlock: number;
  cap: Curve; costPerMW: Curve; buildWeeks: number; maintPct: number;
  resource: Resource; minQuality: number; renewable: boolean; omdomme: number;
  desc: string; fact: string; key: string;
}

export const PLANTS: Record<PlantType, PlantSpec> = {
  river: {
    type: 'river', name: 'Elvekraftverk', short: 'Elvekraft', icon: '🌊', unlock: 1900, key: '1',
    cap: [[1900, 8], [1925, 25], [1950, 60], [1975, 120]], costPerMW: [[1900, 4]], buildWeeks: 12, maintPct: 1.5,
    resource: 'river', minQuality: 0.3, renewable: true, omdomme: 0,
    desc: 'Billig og rask å bygge, men produksjonen følger vannføringen: mye under snøsmeltingen og lite om vinteren.',
    fact: 'Elvekraftverk har lite eller ingen magasin. Produksjonen bestemmes av hvor mye vann som renner i elva.',
  },
  reservoir: {
    type: 'reservoir', name: 'Magasinkraftverk', short: 'Magasin', icon: '🏔️', unlock: 1905, key: '2',
    cap: [[1905, 25], [1925, 80], [1950, 250], [1965, 600], [1980, 1000]], costPerMW: [[1905, 6]], buildWeeks: 40, maintPct: 1.2,
    resource: 'hydro', minQuality: 0.45, renewable: true, omdomme: -1,
    desc: 'Lagrer vårflommen i et magasin og produserer når det trengs. Ryggraden i det norske kraftsystemet.',
    fact: 'Norske vannmagasiner kan lagre rundt 87 TWh – omtrent 70 % av landets årlige strømforbruk.',
  },
  wind: {
    type: 'wind', name: 'Vindpark', short: 'Vind', icon: '🌬️', unlock: 1998, key: '3',
    cap: [[1998, 40], [2010, 120], [2025, 250]], costPerMW: [[1998, 10], [2015, 7], [2030, 5]], buildWeeks: 30, maintPct: 2.5,
    resource: 'wind', minQuality: 0.35, renewable: true, omdomme: -4,
    desc: 'Gratis energi når det blåser, men varierer fra uke til uke. Best langs kysten. Kan møte lokal motstand.',
    fact: 'Smøla vindpark (2002) var en av de første store vindparkene i Norge.',
  },
  offshore: {
    type: 'offshore', name: 'Havvindpark', short: 'Havvind', icon: '🌊🌬️', unlock: 2022, key: '4',
    cap: [[2022, 500], [2035, 1000]], costPerMW: [[2022, 22], [2035, 14]], buildWeeks: 90, maintPct: 2.5,
    resource: 'offshore', minQuality: 0.4, renewable: true, omdomme: 0,
    desc: 'Store vindparker til havs med jevnere vind. Dyrt, og må kobles til land med kabel.',
    fact: 'Hywind Tampen (2022) var verdens største flytende havvindpark og forsyner olje- og gassplattformer.',
  },
  solar: {
    type: 'solar', name: 'Solkraftverk', short: 'Sol', icon: '☀️', unlock: 2012, key: '5',
    cap: [[2012, 20], [2025, 80]], costPerMW: [[2012, 7], [2025, 4]], buildWeeks: 10, maintPct: 1.5,
    resource: 'solar', minQuality: 0.3, renewable: true, omdomme: 0,
    desc: 'Produserer om sommeren når vannmagasinene fylles – nesten ingenting i mørketida.',
    fact: 'Sol og vannkraft utfyller hverandre: sola sparer vann i magasinene om sommeren.',
  },
  gas: {
    type: 'gas', name: 'Gasskraftverk', short: 'Gass', icon: '🔥', unlock: 1995, key: '6',
    cap: [[1995, 420]], costPerMW: [[1995, 4]], buildWeeks: 52, maintPct: 2, resource: 'coast', minQuality: 0.5,
    renewable: false, omdomme: -6,
    desc: 'Leverer når du vil, men drivstoffet er dyrt og det gir CO₂-utslipp. Må ligge ved kysten nær en gassterminal (Kårstø, Kollsnes, Mongstad, Nyhamna, Tjeldbergodden eller Melkøya).',
    fact: 'Gasskraftverket på Kårstø (2007) gikk svært lite fordi gassprisen var for høy i forhold til strømprisen.',
  },
};

export type Voltage = 'v22' | 'v66' | 'v132' | 'v300' | 'v420' | 'hvdc';

export interface LineSpec {
  id: Voltage; name: string; short: string; kv: number; unlock: number; cap: Curve; maxTiles: number;
  perTile: Curve; fixed: number; lossPct: number; buildBase: number; buildPerTile: number;
  color: string; key: string; desc: string;
}

export const LINES: Record<Voltage, LineSpec> = {
  v22: { id: 'v22', name: '22 kV distribusjonslinje', short: '22 kV', kv: 22, unlock: 1900, cap: [[1900, 12]], maxTiles: 10,
    perTile: [[1900, 0.35]], fixed: 0, lossPct: 10, buildBase: 2, buildPerTile: 0.25, color: '#c9a36b', key: 'Z',
    desc: 'Lokalt fordelingsnett. Billig, men lav kapasitet og store tap over avstand.' },
  v66: { id: 'v66', name: '66 kV regionalnett', short: '66 kV', kv: 66, unlock: 1912, cap: [[1912, 50]], maxTiles: 22,
    perTile: [[1912, 1.2]], fixed: 0, lossPct: 5, buildBase: 4, buildPerTile: 0.35, color: '#7ec8e3', key: 'X',
    desc: 'Regionalnett som binder sammen byer og kraftverk i en landsdel.' },
  v132: { id: 'v132', name: '132 kV regionalnett', short: '132 kV', kv: 132, unlock: 1930, cap: [[1930, 180]], maxTiles: 45,
    perTile: [[1930, 3.5]], fixed: 0, lossPct: 3, buildBase: 8, buildPerTile: 0.45, color: '#5fd38d', key: 'C',
    desc: 'Kraftig regionalnett. Kan frakte kraft mellom landsdeler.' },
  v300: { id: 'v300', name: '300 kV transmisjonsnett', short: '300 kV', kv: 300, unlock: 1958, cap: [[1958, 700]], maxTiles: 80,
    perTile: [[1958, 9]], fixed: 0, lossPct: 1.5, buildBase: 12, buildPerTile: 0.55, color: '#ffb547', key: 'V',
    desc: 'Sentralnettet. Frakter store mengder kraft over lange avstander.' },
  v420: { id: 'v420', name: '420 kV transmisjonsnett', short: '420 kV', kv: 420, unlock: 1972, cap: [[1972, 1800]], maxTiles: 150,
    perTile: [[1972, 15]], fixed: 0, lossPct: 0.8, buildBase: 16, buildPerTile: 0.6, color: '#ff6b6b', key: 'B',
    desc: 'Det høyeste spenningsnivået i Norge. Enorm kapasitet og lave tap.' },
  hvdc: { id: 'hvdc', name: 'HVDC-kabel (likestrøm)', short: 'HVDC', kv: 500, unlock: 1977, cap: [[1977, 500], [2000, 700], [2015, 1400]], maxTiles: 130,
    perTile: [[1977, 10]], fixed: 250, lossPct: 0.5, buildBase: 52, buildPerTile: 0.2, color: '#c38bff', key: 'N',
    desc: 'Likestrømskabel for lange sjøstrekninger og utenlandsforbindelser. Dyre omformerstasjoner i hver ende.' },
};
export const AC_VOLTAGES: Voltage[] = ['v22', 'v66', 'v132', 'v300', 'v420'];
export const ALL_VOLTAGES: Voltage[] = [...AC_VOLTAGES, 'hvdc'];
export const MAX_AC_SEA_TILES = 6;

export const STATION_COST: Curve = [[1900, 1], [1950, 4], [1990, 10]];
export const STATION_WEEKS = 6;

/** kW per innbygger (gjennomsnitt) for byforbruk */
export const PER_CAPITA: Curve = [[1900, 0.012], [1910, 0.04], [1920, 0.1], [1935, 0.25], [1950, 0.45], [1970, 1.0], [1990, 1.4], [2020, 1.6], [2050, 2.1]];
/** Sluttbrukerpris (øre/kWh, faste kroner) – gir inntekt for levert energi */
export const TARIFF: Curve = [[1900, 90], [1930, 50], [1960, 22], [1990, 13], [2050, 12]];
export const CO2_PRICE: Curve = [[1900, 0], [2005, 0], [2015, 10], [2030, 50], [2050, 90]];
export const GAS_PRICE = 50;
/** MNOK per MW·uke per øre/kWh */
export const MONEY_PER_MW_WEEK_ORE = 0.00168;
/** Avbruddskostnad (KILE) som andel av tariffen for ikke levert energi */
export const KILE_FACTOR = 0.25;
export const WEEKS_PER_YEAR = 52;
export const HOURS_PER_WEEK = 168;
export const START_YEAR = 1900;

export function popAt(pop: [number, number, number], year: number): number {
  const c: Curve = [[1900, pop[0]], [1950, pop[1]], [2020, pop[2]], [2050, pop[2] * 1.15], [2100, pop[2] * 1.25]];
  return curve(c, year);
}

export function seasonDemand(woy: number): number {
  return 1 + 0.28 * Math.cos((2 * Math.PI * (woy - 3)) / 52);
}
/** Vannføring i elver (relativ, snitt ~0.55) */
export function riverFlow(woy: number): number {
  const melt = Math.exp(-Math.pow((woy - 22) / 5.5, 2)) * 0.5;
  const autumn = Math.exp(-Math.pow((woy - 41) / 5, 2)) * 0.15;
  return 0.52 + melt + autumn - 0.08 * Math.cos((2 * Math.PI * (woy - 3)) / 52);
}
/** Tilsig til magasin (relativ, snitt ~1) */
export function inflow(woy: number): number {
  const melt = Math.exp(-Math.pow((woy - 23) / 5, 2)) * 3.8;
  const autumn = Math.exp(-Math.pow((woy - 41) / 5, 2)) * 1.0;
  return 0.3 + melt + autumn;
}
export function solarSeason(woy: number, lat: number): number {
  const s = Math.max(0, Math.cos((2 * Math.PI * (woy - 25)) / 52));
  const polar = lat > 66.5 ? Math.pow(s, 1.6) : s;
  return 0.03 + 0.32 * polar;
}
export function windSeason(woy: number): number {
  return 1 + 0.25 * Math.cos((2 * Math.PI * (woy - 2)) / 52);
}

// ---------------------------------------------------------------- årstider
// Spillet viser to årstider. Simuleringen bruker fortsatt de jevne kurvene over.
/** Uka da vinteren starter (midten av november). */
export const WINTER_START_WEEK = 46;
/** Første sommeruke (midten av april). Vinteren varer altså uke 46–15. */
export const SUMMER_START_WEEK = 16;
export type Season = 'winter' | 'summer';
export function seasonOf(woy: number): Season {
  return woy >= WINTER_START_WEEK || woy < SUMMER_START_WEEK ? 'winter' : 'summer';
}
/** Antall uker til neste årstidsskifte (1 = skifter neste uke). */
export function weeksToSeasonChange(woy: number): number {
  const next = seasonOf(woy) === 'winter' ? SUMMER_START_WEEK : WINTER_START_WEEK;
  return (next - woy + 52) % 52;
}
/** Ukene da snøsmeltingen gir mest vann i elvene (toppen i riverFlow/inflow). */
export function isSpringFlood(woy: number): boolean {
  return woy >= 17 && woy <= 27;
}

export const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
export function monthOf(woy: number) {
  return Math.min(11, Math.floor((woy / 52) * 12));
}
