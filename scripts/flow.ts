// Tester kapittelflyt, pausemeny, hjelp og fri modus.
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/f0-menu.png` });
await page.evaluate(() => (window as any).statgrid.newCampaign());
await page.waitForTimeout(500);
await page.click('text=Til verks');
await page.waitForTimeout(300);
await page.click('#coach >> text=Hopp over');
// bygg noe raskt via API slik at Kristiania har strøm, og hopp til slutten av kapittelet
await page.evaluate(() => {
  const a = (window as any).statgrid, g = a.game;
  const o = g.nodeByRef('oslo');
  g.state.money = 5000;
  for (const ref of ['oslo', 'drammen', 'fredrikstad', 'tonsberg', 'skien', 'hamar']) {
    const c = g.nodeByRef(ref);
    let best: any = null;
    for (let j = c.j - 7; j <= c.j + 7; j++) for (let i = c.i - 7; i <= c.i + 7; i++) { const k = g.checkPlant('river', i, j); if (k.ok && (!best || k.quality > best.q)) best = { i, j, q: k.quality }; }
    const p = g.placePlant('river', best.i, best.j);
    g.buildLine({ node: p.id }, { node: c.id }, 'v22');
    const p2 = g.placePlant('river', best.i + (best.i > c.i ? -2 : 2), best.j);
    if (p2) g.buildLine({ node: p2.id }, { node: c.id }, 'v22');
  }
  void o;
  g.state.week = (1919 - 1900) * 52 + 30;
  for (let i = 0; i < 23 && !g.state.ended; i++) g.tick();
  a.world.sync();
});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/f1-chapter-end.png` });
await page.click('.modal .btn.primary');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/f2-chapter2-intro.png` });
await page.click('text=Til verks');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/f3-chapter2.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/f4-pause.png` });
await page.click('.modal >> text=Slik spiller du');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/f5-help.png` });
await page.click('text=Skjønner');
await page.waitForTimeout(300);
const st = await page.evaluate(() => { const g = (window as any).statgrid.game; return { ch: g.state.chapter, year: g.year, money: Math.round(g.state.money), results: g.state.chapterResults }; });
console.log('state', JSON.stringify(st));
await page.evaluate(() => (window as any).statgrid.toMenu());
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/f6-menu-continue.png` });
await page.click('text=Fri modus');
await page.waitForTimeout(400);
await page.click('text=2020 – grønt skifte');
await page.click('text=Start ▶');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/f7-free.png` });
console.log('ERRORS:\n' + (errors.join('\n') || '(ingen)'));
await browser.close();
