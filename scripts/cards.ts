// Tester hendelseskort, auto-pause og prognosepanel.
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => (window as any).statgrid.newCampaign());
await page.waitForTimeout(500);
await page.click('text=Til verks');
await page.click('#coach >> text=Hopp over');
await page.evaluate(() => {
  const a = (window as any).statgrid, g = a.game;
  const o = g.nodeByRef('oslo');
  let best: any = null;
  for (let j = o.j - 7; j <= o.j + 7; j++) for (let i = o.i - 7; i <= o.i + 7; i++) { const k = g.checkPlant('river', i, j); if (k.ok && (!best || k.quality > best.q)) best = { i, j, q: k.quality }; }
  const p = g.placePlant('river', best.i, best.j);
  g.buildLine({ node: p.id }, { node: o.id }, 'v22');
  a.world.sync();
  a.world.focusTile(o.i, o.j, 40, true);
  a.setSpeed(3);
});
const waitCard = async (name: string) => {
  await page.waitForSelector('#eventcard:not(.hidden)', { timeout: 60000 });
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => ({ date: (window as any).statgrid.game.dateLabel(), speed: (window as any).statgrid.speed, title: document.querySelector('#eventcard h3')?.textContent }));
  console.log(name, JSON.stringify(info));
  await page.screenshot({ path: `${out}/${name}.png` });
};
await waitCard('c1');
await page.click('#eventcard [data-act="go"]');
await waitCard('c2');
await page.click('#eventcard [data-act="show"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/c3-showme.png` });
await page.keyboard.press(' ');
const sp = await page.evaluate(() => (window as any).statgrid.speed);
console.log('speed after close', sp);
console.log('ERRORS:\n' + (errors.join('\n') || '(ingen)'));
await browser.close();
