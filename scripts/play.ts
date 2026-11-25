// Spiller med ekte mus og tastatur i Edge for å teste verktøyene.
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('text=Kampanje');
await page.waitForTimeout(400);
await page.click('.chapter-row >> nth=0 >> button');
await page.waitForTimeout(800);
await page.click('text=Til verks');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/p1-tutorial.png` });
await page.click('#coach >> text=Sett i gang');
await page.waitForTimeout(1500);
await page.keyboard.press('1');
await page.waitForTimeout(400);

const screenOf = async (expr: string) => page.evaluate((e) => {
  const app = (window as any).statgrid;
  const g = app.game;
  // eslint-disable-next-line no-eval
  const [i, j] = eval(e);
  const THREE = app.world.camera.constructor; void THREE;
  const v = app.world.nodeTop({ i, j });
  const s = app.world.toScreen(v);
  return [s.x, s.y];
}, expr);

// finn et godt elvekraftsted nær Kristiania
const site = await page.evaluate(() => {
  const g = (window as any).statgrid.game;
  const o = g.nodeByRef('oslo');
  let best: any = null;
  for (let j = o.j - 7; j <= o.j + 7; j++) for (let i = o.i - 7; i <= o.i + 7; i++) {
    const c = g.checkPlant('river', i, j);
    if (c.ok && (!best || c.quality > best.q)) best = { i, j, q: c.quality };
  }
  return best;
});
console.log('site', site);
const [sx, sy] = await screenOf(`[${site.i}, ${site.j}]`);
await page.mouse.move(sx, sy);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/p2-place-river.png` });
await page.mouse.click(sx, sy);
await page.waitForTimeout(800);
await page.keyboard.press('z');
await page.waitForTimeout(300);
await page.mouse.click(sx, sy);
await page.waitForTimeout(300);
const [ox, oy] = await screenOf(`(() => { const o = g.nodeByRef('oslo'); return [o.i, o.j]; })()`);
await page.mouse.move(ox, oy);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/p3-line-preview.png` });
await page.mouse.click(ox, oy);
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const st = await page.evaluate(() => { const g = (window as any).statgrid.game; return { lines: g.state.lines.length, nodes: g.state.nodes.filter((n: any) => n.kind === 'plant').length, money: g.state.money, tut: (window as any).statgrid.tutorial.idx }; });
console.log('after build', st);
await page.keyboard.press(' ');
await page.click('.speed button >> nth=3');
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/p4-running.png` });
await page.keyboard.press('l');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/p5-load.png` });
const info = await page.evaluate(() => {
  const app = (window as any).statgrid;
  const geo = app.world.tmesh.mesh.geometry;
  return { verts: geo.getAttribute('position').count, tris: geo.index.count / 3, date: app.game.dateLabel(), money: app.game.state.money, tut: app.tutorial.idx };
});
console.log('info', info);
console.log('ERRORS:\n' + (errors.join('\n') || '(ingen)'));
await browser.close();
