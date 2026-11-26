// Balanseanalyse av ressurskartet: gyldige byggesteder per landsdel, og beste sted innen 6 og 12 ruter fra hver by og industri.
// Kjør med: npx tsx scripts/balance.ts
import { generateTerrain, T_LAND, T_SEA } from '../src/world/terrain';
import { llToTileInt } from '../src/world/projection';
import { CITIES, INDUSTRIES } from '../src/data/geo';
const T = generateTerrain(); const W = T.W, N = W * T.H;
const Q: Record<string, (k: number) => number> = {
  river: (k) => T.type[k] === T_LAND ? T.riverHydro[k] : 0,
  reservoir: (k) => T.type[k] === T_LAND ? T.hydro[k] : 0,
  wind: (k) => T.type[k] === T_LAND ? T.wind[k] : 0,
  solar: (k) => T.type[k] === T_LAND && T.level[k] <= 8 ? T.solar[k] : 0,
  offshore: (k) => T.type[k] === T_SEA && T.dLand[k] >= 2 && T.dLand[k] <= 32 ? T.wind[k] : 0,
  gas: (k) => T.type[k] === T_LAND ? T.gasSite[k] : 0,
};
const MIN: Record<string, number> = { river: 0.3, reservoir: 0.45, wind: 0.35, solar: 0.3, offshore: 0.4, gas: 0.5 };
const region = (k: number) => { const la = T.lat[k], lo = T.lon[k];
  if (la >= 69 && lo >= 21) return 'Finnmark'; if (la >= 65) return 'Nord'; if (la >= 62.3) return 'Midt';
  if (lo >= 9 && la >= 59.0) return 'Øst'; if (la < 59.3 && lo >= 6.3) return 'Sør'; return 'Vest'; };
const regs = ['Øst', 'Sør', 'Vest', 'Midt', 'Nord', 'Finnmark'];
console.log('== Per landsdel: antall gyldige ruter / snitt q / p90 q ==');
console.log('type'.padEnd(10) + regs.map((r) => r.padStart(18)).join(''));
for (const t of Object.keys(Q)) {
  let row = t.padEnd(10);
  for (const r of regs) {
    const qs: number[] = [];
    for (let k = 0; k < N; k++) { if (region(k) !== r) continue; const q = Q[t](k); if (q >= MIN[t]) qs.push(q); }
    qs.sort((a, b) => a - b);
    const m = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 0;
    row += `${qs.length}/${m.toFixed(2)}/${(qs[Math.floor(qs.length * 0.9)] ?? 0).toFixed(2)}`.padStart(18);
  }
  console.log(row);
}
const types = ['river', 'reservoir', 'wind', 'solar', 'gas'];
const near = (lo: number, la: number, r: number, t: string) => { const [ci, cj] = llToTileInt(lo, la); let best = 0, cnt = 0, bd = 0;
  for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) { const d = Math.hypot(i - ci, j - cj); if (d > r) continue; const q = Q[t]((j) * W + i); if (q >= MIN[t]) { cnt++; if (q > best) { best = q; bd = d; } } }
  return `${best.toFixed(2)}@${bd.toFixed(0)} n${cnt}`; };
console.log('\n== Mål: beste q@avstand og antall gyldige ruter innen 6 / 12 ruter ==');
const tgts = [...CITIES.map((c) => ({ n: c.name, lo: c.lon, la: c.lat, ch: c.chapter, mw: '' })), ...INDUSTRIES.map((d) => ({ n: d.name, lo: d.lon, la: d.lat, ch: d.chapter, mw: d.mw + 'MW' }))];
for (const g of tgts) {
  console.log(`k${g.ch} ${(g.n + ' ' + g.mw).padEnd(26)} ` + types.map((t) => `${t.slice(0, 5)} ${near(g.lo, g.la, 6, t)} | ${near(g.lo, g.la, 12, t)}`).join('  ;  '));
}
