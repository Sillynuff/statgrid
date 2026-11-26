// Laster en sen spilltilstand og tar skjermbilder av et stort nett.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const out = process.argv[2] ?? '.';
const state = readFileSync(`${out}/late.json`, 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('statgrid-save-v1', s), state);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/l0-menu.png` });
await page.click('text=Fortsett');
await page.waitForTimeout(1500);
// lukk eventuelle modaler
await page.evaluate(() => { const a = (window as any).statgrid; a.modals.close(); a.game.state.ended = false; for (let i = 0; i < 6; i++) a.game.tick(); while (!a.game.stepN1(100)) {} a.world.sync(); a.world.setSeason(a.game.woy, true); });
const shots: [string, string][] = [
  ['l1-overview', 'a.world.focusLL(13, 64.5, 230, true); a.world.setView(0.75, 0);'],
  ['l2-south', 'a.world.focusLL(7.5, 59.3, 75, true); a.world.setView(0.95, 0.2);'],
  ['l3-bergen', 'a.world.focusLL(5.6, 60.5, 30, true); a.world.setView(1.0, -0.4);'],
  ['l4-n1', "a.world.focusLL(9, 60, 110, true); a.world.setView(0.8, 0); a.setMapMode('n1');"],
  ['l5-north', "a.setMapMode('n1'); a.world.focusLL(17, 68.6, 45, true); a.world.setView(1.0, 0.6);"],
];
for (const [name, js] of shots) {
  await page.evaluate((code) => { const a = (window as any).statgrid; eval(code); }, js);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
const fps = await page.evaluate(() => new Promise<number>((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log('fps (swiftshader, CPU-rendering):', fps);
console.log('ERRORS:\n' + (errors.join('\n') || '(ingen)'));
await browser.close();
