import { writeFileSync } from 'node:fs';
// Enkel bot som spiller gjennom kampanjen for å finne kjørefeil og måle ytelse.
import { generateTerrain } from '../src/world/terrain';
import { Game } from '../src/sim/game';
import { LINES, AC_VOLTAGES, Voltage, PlantType } from '../src/sim/config';
import type { GNode } from '../src/sim/types';

const terrain = generateTerrain();
const st = Game.createState('campaign', terrain);
st.unlimited = process.argv[2] === 'unl';
const g = new Game(terrain, st);
g.beginChapter();
let chapterEnded = false;
g.on('chapterEnd', (p) => { chapterEnded = true; console.log(`== Kapittel ${p.chapter + 1} slutt ${g.dateLabel()} stjerner=${p.stars} penger=${Math.round(g.state.money)} rel=${(g.reliability() * 100).toFixed(2)} obj=${JSON.stringify(g.objectiveCache.main.map((m) => m.label))} stars=${JSON.stringify(g.objectiveCache.stars.map((m) => m.label))}`); });

function bestVoltage(tiles: number, need: number, sea: boolean): Voltage | null {
  for (const v of AC_VOLTAGES) if (g.isUnlockedLine(v) && LINES[v].maxTiles >= tiles && g.lineCap(v) >= need) return v;
  for (const v of [...AC_VOLTAGES].reverse()) if (g.isUnlockedLine(v) && LINES[v].maxTiles >= tiles) return v;
  return null;
}
function gridNodes() { return g.state.nodes.filter((n) => g.linesOf(n.id).length > 0 && n.kind !== 'market'); }
function connect(a: GNode, b: GNode, need: number) {
  const tiles = Math.hypot(a.i - b.i, a.j - b.j);
  let v = bestVoltage(tiles, need, false);
  if (!v) return null;
  let l = g.buildLine({ node: a.id }, { node: b.id }, v);
  if (!l && g.isUnlockedLine('hvdc')) l = g.buildLine({ node: a.id }, { node: b.id }, 'hvdc');
  return l;
}
function buildPlantNear(n: GNode, r = 9): GNode | null {
  r = Math.min(r, Math.floor(Math.max(...AC_VOLTAGES.filter((v) => g.isUnlockedLine(v)).map((v) => LINES[v].maxTiles)) * 0.7));
  const types: PlantType[] = g.year >= 1915 ? ['reservoir', 'river'] : ['river'];
  for (const t of types) {
    let best: [number, number] | null = null, bq = 0;
    for (let j = n.j - r; j <= n.j + r; j++)
      for (let i = n.i - r; i <= n.i + r; i++) {
        const c = g.checkPlant(t, i, j);
        if (c.ok && c.quality > bq) { bq = c.quality; best = [i, j]; }
      }
    if (best) {
      const p = g.placePlant(t, best[0], best[1]);
      if (p) { connect(p, n, g.plantCap(t)); return p; }
    }
  }
  return null;
}

function scripted() {
  // utenlandsforbindelser, vind og havvind for å teste visuelt
  for (const m of g.state.nodes.filter((n) => n.kind === 'market' && g.isActive(n) && g.linesOf(n.id).length === 0)) {
    const def = g.marketDef(m);
    const near = gridNodes().filter((x) => x.kind !== 'market').sort((a, b) => Math.hypot(a.i - m.i, a.j - m.j) - Math.hypot(b.i - m.i, b.j - m.j))[0];
    if (!near) continue;
    const v: Voltage = def.ac ? (g.isUnlockedLine('v420') ? 'v420' : 'v300') : 'hvdc';
    g.buildLine({ node: near.id }, { node: m.id }, v);
  }
  if (g.year >= 2000) for (const ref of ['bergen', 'trondheim', 'bodo', 'tromso']) {
    const c = g.nodeByRef(ref)!;
    let best: [number, number] | null = null, bq = 0;
    const t: PlantType = g.year >= 2025 ? 'offshore' : 'wind';
    for (let j = c.j - 12; j <= c.j + 12; j++) for (let i = c.i - 12; i <= c.i + 12; i++) { const ck = g.checkPlant(t, i, j); if (ck.ok && ck.quality > bq) { bq = ck.quality; best = [i, j]; } }
    if (best && g.rng01() < 0.4) { const p = g.placePlant(t, best[0], best[1]); if (p) { const tiles = Math.hypot(p.i - c.i, p.j - c.j); g.buildLine({ node: p.id }, { node: c.id }, t === 'offshore' ? 'hvdc' : (bestVoltage(tiles, 500, false) ?? 'v420')); } }
  }
}
const t0 = performance.now();
let ticks = 0, n1ms = 0, tickMs = 0;
while (g.state.mode === 'campaign' && ticks < 52 * 160) {
  if (g.state.week % 4 === 0) {
    const consumers = g.state.nodes.filter((n) => (n.kind === 'city' || n.kind === 'industry') && g.isActive(n));
    const connected = consumers.filter((c) => g.linesOf(c.id).length > 0);
    const peak = connected.reduce((s, c) => s + g.consumerDemand(c, 3, true), 0);
    const avail = g.state.nodes.filter((n) => n.kind === 'plant').reduce((s, n) => s + (n.ptype === 'river' ? (n.cap ?? 0) * (n.quality ?? 1) * 0.44 : (n.cap ?? 0) * 0.8), 0);
    const loose = g.state.nodes.find((n) => n.kind === 'plant' && g.linesOf(n.id).length === 0);
    if (loose) {
      const tgt = [...connected, ...gridNodes()].filter((x) => x.id !== loose.id).sort((a, b) => Math.hypot(a.i - loose.i, a.j - loose.j) - Math.hypot(b.i - loose.i, b.j - loose.j))[0] ?? consumers.find((c) => c.ref === 'oslo')!;
      connect(loose, tgt, loose.cap ?? 10);
    } else if (avail < peak * 1.2 + 2) {
      const order = [...consumers].sort((a, b) => ((b.demand ?? 0) - (b.served ?? 0)) - ((a.demand ?? 0) - (a.served ?? 0)));
      for (const target of order) if (buildPlantNear(target, 12)) break;
    } else {
      const todo = consumers.filter((c) => g.linesOf(c.id).length === 0).sort((a, b) => (b.demand ?? 0) - (a.demand ?? 0))[0];
      if (todo) {
        const grid = gridNodes().filter((x) => x.id !== todo.id).sort((a, b) => Math.hypot(a.i - todo.i, a.j - todo.j) - Math.hypot(b.i - todo.i, b.j - todo.j));
        if (grid[0]) connect(todo, grid[0], (todo.demand ?? 10) * 2);
      }
    }
    for (const l of g.state.lines) {
      if (l.progress >= 1 && !l.upgrade && Math.abs(l.flow ?? 0) / l.cap > 0.9) {
        const o = g.upgradeOptions(l).find((x) => x.ok && g.isUnlockedLine(x.v));
        if (o) g.upgradeLine(l, o.v);
      }
    }
  }
  const a = performance.now();
  g.tick();
  tickMs += performance.now() - a;
  const b = performance.now();
  while (!g.stepN1(50)) { /* kjør ferdig */ }
  n1ms += performance.now() - b;
  ticks++;
  if (chapterEnded) { chapterEnded = false; g.advanceChapter(); }
  if (st.unlimited && g.state.week % 52 === 10) scripted();
  if (process.argv[3] && g.year >= Number(process.argv[4] ?? 2030)) { writeFileSync(process.argv[3], JSON.stringify(g.state)); console.log('dumpet', g.dateLabel()); process.exit(0); }
  if (g.state.week % 260 === 0) console.log(`${g.dateLabel()} noder=${g.state.nodes.length} linjer=${g.state.lines.length} dem=${g.totals.demand.toFixed(0)} served=${g.totals.served.toFixed(0)} cap=${g.totals.capacity.toFixed(0)} money=${Math.round(g.state.money)} omd=${g.state.omdomme.toFixed(0)} tick=${(tickMs / ticks).toFixed(2)}ms n1=${(n1ms / ticks).toFixed(1)}ms`);
}
console.log(`ferdig ${g.dateLabel()} på ${((performance.now() - t0) / 1000).toFixed(1)} s, linjer ${g.state.lines.length}`);
// tidtaking av én full N-1
g.n1Dirty = true;
const c0 = performance.now();
while (!g.stepN1(1000)) {}
console.log(`full N-1 med ${g.state.lines.length} linjer: ${(performance.now() - c0).toFixed(0)} ms`);
const c1 = performance.now();
for (let i = 0; i < 20; i++) g.tick();
console.log(`tick ved slutt: ${((performance.now() - c1) / 20).toFixed(2)} ms`);
console.log('save size', (JSON.stringify(g.state).length / 1024).toFixed(0), 'KB');
