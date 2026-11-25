import { generateTerrain } from '../src/world/terrain';
import { Game } from '../src/sim/game';

const terrain = generateTerrain();
const st = Game.createState('campaign', terrain);
const g = new Game(terrain, st);
g.beginChapter();
g.on('news', (n) => console.log(`  [${g.dateLabel()}] ${n.icon} ${n.title}`));

const oslo = g.nodeByRef('oslo')!;
// finn beste vannkraftsted innen 9 fliser fra Oslo
function bestSite(t: 'river' | 'reservoir', cx: number, cy: number, r: number) {
  let best: [number, number] | null = null, bq = 0;
  for (let j = cy - r; j <= cy + r; j++)
    for (let i = cx - r; i <= cx + r; i++) {
      const c = g.checkPlant(t, i, j);
      if (c.ok && c.quality > bq && Math.hypot(i - cx, j - cy) <= r) { bq = c.quality; best = [i, j]; }
    }
  return best ? { tile: best, q: bq } : null;
}
const s1 = bestSite('river', oslo.i, oslo.j, 9)!;
console.log('Oslo tile', oslo.i, oslo.j, 'best river site', s1);
const p1 = g.placePlant('river', s1.tile[0], s1.tile[1])!;
const line = g.buildLine({ node: p1.id }, { node: oslo.id }, 'v22');
console.log('line', line?.cost, 'money', g.state.money.toFixed(1));
const s2 = bestSite('river', oslo.i, oslo.j, 9)!;
const p2 = g.placePlant('river', s2.tile[0], s2.tile[1])!;
g.buildLine({ node: p2.id }, { node: oslo.id }, 'v22');
console.log('money after 2 plants', g.state.money.toFixed(1));

const t0 = performance.now();
for (let w = 0; w < 52 * 6; w++) {
  g.tick();
  if (w % 13 === 0)
    console.log(`${g.dateLabel().padEnd(16)} money ${g.state.money.toFixed(1).padStart(7)} dem ${g.totals.demand.toFixed(1)} served ${g.totals.served.toFixed(1)} gen ${g.totals.gen.toFixed(1)} oslo d=${oslo.demand?.toFixed(1)} s=${oslo.served?.toFixed(1)} omd ${g.state.omdomme.toFixed(0)}`);
  while (!g.stepN1()) {}
}
console.log('sim ms per tick', ((performance.now() - t0) / (52 * 6)).toFixed(2));
console.log('objectives', JSON.stringify(g.objectiveCache));
console.log('ledger last year', g.state.lastYearLedger);
