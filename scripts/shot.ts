// Kjører spillet i Edge (headless) og tar skjermbilder for visuell sjekk.
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const scenario = process.argv[3] ?? 'basic';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/01-menu.png` });

if (scenario !== 'menu') {
  await page.evaluate(() => (window as any).statgrid.newCampaign());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/02-intro.png` });
  await page.click('text=Til verks');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/03-tutorial.png` });
  // bygg litt via API
  const info = await page.evaluate(() => {
    const app = (window as any).statgrid;
    const g = app.game;
    app.tutorial.skip();
    const oslo = g.nodeByRef('oslo');
    const sites: [number, number, number][] = [];
    for (let j = oslo.j - 9; j <= oslo.j + 9; j++)
      for (let i = oslo.i - 9; i <= oslo.i + 9; i++) {
        const c = g.checkPlant('river', i, j);
        if (c.ok) sites.push([i, j, c.quality]);
      }
    sites.sort((a, b) => b[2] - a[2]);
    const p1 = g.placePlant('river', sites[0][0], sites[0][1]);
    g.buildLine({ node: p1.id }, { node: oslo.id }, 'v22');
    const s2 = sites.find((s) => Math.hypot(s[0] - sites[0][0], s[1] - sites[0][1]) > 2)!;
    const p2 = g.placePlant('river', s2[0], s2[1]);
    g.buildLine({ node: p2.id }, { node: oslo.id }, 'v22');
    const dr = g.nodeByRef('drammen');
    g.buildLine({ node: oslo.id }, { node: dr.id }, 'v22');
    for (let w = 0; w < 30; w++) g.tick();
    app.world.sync();
    app.world.setSeason(g.woy, true);
    app.world.focusTile(oslo.i, oslo.j, 22, true);
    app.select({ node: p1 });
    return { money: g.state.money, date: g.dateLabel(), oslo: [oslo.demand, oslo.served] };
  });
  console.log('state', JSON.stringify(info));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/04-oslo.png` });
  await page.evaluate(() => { const a = (window as any).statgrid; a.select(null); a.tools.selectPlant('reservoir'); });
  await page.mouse.move(800, 450);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/05-overlay.png` });
  await page.evaluate(() => { const a = (window as any).statgrid; a.tools.cancel(); a.world.focusLL(12, 64, 230, true); a.world.setView(0.9, 0); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/06-norway.png` });
  await page.evaluate(() => { const a = (window as any).statgrid; for (let w = 0; w < 22; w++) a.game.tick(); a.world.setSeason(a.game.woy, true); a.world.focusLL(7.2, 61.2, 60, true); a.world.setView(0.95, 0.4); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/07-winter-west.png` });
}
console.log('ERRORS:\n' + (errors.join('\n') || '(ingen)'));
await browser.close();
