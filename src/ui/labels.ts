import * as THREE from 'three';
import type { App } from '../main';
import type { GNode } from '../sim/types';
import { surfaceY } from '../render/terrainMesh';
import { CITIES } from '../data/geo';
import { PLANTS } from '../sim/config';
import { fmt, fmtMW } from './dom';

interface Lbl { el: HTMLElement; nm: HTMLElement; sub: HTMLElement; bar: HTMLElement; fill: HTMLElement; key: string; pos: THREE.Vector3 }

export class Labels {
  app: App;
  root: HTMLElement;
  private lbls = new Map<number, Lbl>();
  private floaties: { el: HTMLElement; pos: THREE.Vector3; born: number }[] = [];

  constructor(app: App) {
    this.app = app;
    this.root = document.getElementById('labels')!;
  }

  clear() {
    this.root.innerHTML = '';
    this.lbls.clear();
  }

  private make(n: GNode): Lbl {
    const el = document.createElement('div');
    el.className = 'lbl';
    const nm = document.createElement('div'); nm.className = 'nm';
    const sub = document.createElement('div'); sub.className = 'sub';
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('i');
    bar.append(fill);
    el.append(nm, sub, bar);
    this.root.append(el);
    const t = this.app.terrain;
    const lift = n.kind === 'city' ? 1.1 : n.kind === 'market' ? 2.0 : n.kind === 'industry' ? 1.4 : 1.2;
    return { el, nm, sub, bar, fill, key: '', pos: new THREE.Vector3(n.i + 0.5, surfaceY(t, n.i, n.j) + lift, n.j + 0.5) };
  }

  floatText(x: number, z: number, text: string, color = '#ffd23f') {
    const el = document.createElement('div');
    el.className = 'floaty';
    el.textContent = text;
    el.style.color = color;
    this.root.append(el);
    const t = this.app.terrain;
    this.floaties.push({ el, pos: new THREE.Vector3(x, surfaceY(t, Math.floor(x), Math.floor(z)) + 1.5, z), born: performance.now() });
  }

  update() {
    const app = this.app, g = app.game, w = app.world;
    const dist = w.camDistance();
    const seen = new Set<number>();
    for (const n of g.state.nodes) {
      if (!g.isVisible(n)) continue;
      let show = false;
      let cls = 'lbl';
      let name = '', sub = '', barFrac = -1, barColor = 'var(--good)';
      if (n.kind === 'city') {
        const d = CITIES.find((c) => c.id === n.ref)!;
        const active = g.isActive(n);
        const importance = Math.sqrt(d.pop[2]);
        show = active ? dist < 60 + importance * 9 : dist < 45;
        name = g.nodeName(n);
        if (!active) cls += ' dark small';
        else {
          if (n.blackout) cls += ' black';
          else if (!n.everPowered) cls += ' dark';
          const dem = n.demand ?? 0;
          sub = n.everPowered ? `${n.blackout ? '⚠️' : '💡'} ${fmtMW(dem)}${n.n1 === 'ok' ? ' 🛡️' : ''}` : `🕯️ trenger ${fmtMW(dem)}`;
          if (n.everPowered && dem > 0) { barFrac = (n.served ?? 0) / dem; barColor = barFrac >= 0.99 ? 'var(--good)' : 'var(--bad)'; }
          if (importance < 6 && dist > 140) sub = '';
        }
      } else if (n.kind === 'industry') {
        const d = g.indDef(n);
        show = dist < 220;
        name = `🏭 ${d.name}`;
        cls += n.questDone ? '' : ' quest';
        sub = n.questDone ? `${fmtMW(n.served ?? 0)} / ${fmtMW(n.demand ?? 0)}` : `trenger ${fmtMW(n.demand ?? d.mw)}${g.yearFrac <= d.deadline ? ` · ${d.reward} MNOK før ${d.deadline}` : ''}`;
        if (n.questDone && (n.demand ?? 0) > 0) { barFrac = (n.served ?? 0) / n.demand!; barColor = barFrac >= 0.9 ? 'var(--good)' : 'var(--bad)'; }
      } else if (n.kind === 'market') {
        const d = g.marketDef(n);
        show = dist < 260;
        cls += ' market';
        name = `${d.name}`;
        const ne = n.netExport ?? 0;
        sub = `${fmt(g.marketPrice(d.id))} øre/kWh${Math.abs(ne) > 0.5 ? (ne > 0 ? ` · ⬆ eksport ${fmtMW(ne)}` : ` · ⬇ import ${fmtMW(-ne)}`) : ''}`;
      } else if (n.kind === 'plant') {
        const s = PLANTS[n.ptype!];
        if (n.progress < 1) { show = dist < 120; cls += ' building'; sub = `🏗️ ${Math.round(n.progress * 100)} %`; }
        else if (n.upgrade) { show = dist < 120; cls += ' building'; sub = `⚙️ ${Math.round(n.upgrade.progress * 100)} %`; }
        else { show = dist < 32; cls += ' plant'; sub = `${s.icon.slice(0, 2)} ${fmtMW(n.out ?? 0)}`; if (!g.linesOf(n.id).length) { sub = '⚠️ ikke tilkoblet'; show = dist < 140; } }
      } else if (n.kind === 'station' && n.progress < 1) {
        show = dist < 70; cls += ' building'; sub = `🏗️ ${Math.round(n.progress * 100)} %`;
      }
      if (!show) continue;
      let l = this.lbls.get(n.id);
      if (!l) { l = this.make(n); this.lbls.set(n.id, l); }
      const sp = w.toScreen(l.pos);
      if (!sp.visible) { l.el.style.display = 'none'; seen.add(n.id); continue; }
      seen.add(n.id);
      l.el.style.display = '';
      l.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
      const key = `${cls}|${name}|${sub}|${barFrac.toFixed(2)}`;
      if (key !== l.key) {
        l.key = key;
        l.el.className = cls;
        l.nm.textContent = name;
        l.sub.textContent = sub;
        l.sub.style.display = sub ? '' : 'none';
        l.bar.style.display = barFrac >= 0 ? '' : 'none';
        l.fill.style.width = `${Math.min(100, barFrac * 100)}%`;
        l.fill.style.background = barColor;
      }
    }
    for (const [id, l] of this.lbls) if (!seen.has(id)) { l.el.remove(); this.lbls.delete(id); }

    const now = performance.now();
    this.floaties = this.floaties.filter((f) => {
      if (now - f.born > 1800) { f.el.remove(); return false; }
      const sp = w.toScreen(f.pos);
      f.el.style.left = `${sp.x}px`;
      f.el.style.top = `${sp.y}px`;
      return true;
    });
  }
}
