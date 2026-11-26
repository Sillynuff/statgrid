import * as THREE from 'three';
import type { App } from '../main';
import { PLANTS, LINES, PlantType, Voltage } from '../sim/config';
import type { Endpoint } from '../sim/game';
import type { GNode, GLine } from '../sim/types';
import { surfaceY } from '../render/terrainMesh';
import { fmt, fmtMW, esc } from './dom';
import { sfx } from '../audio';

type Mode =
  | { kind: 'none' }
  | { kind: 'plant'; t: PlantType }
  | { kind: 'line'; v: Voltage; from: Endpoint | null }
  | { kind: 'demolish' };

export class Tools {
  app: App;
  mode: Mode = { kind: 'none' };
  private down: { x: number; y: number; t: number; button: number } | null = null;
  private lastPick: { i: number; j: number; x: number; z: number } | null = null;
  private lastMouse = { x: 0, y: 0 };
  hoverNode: GNode | null = null;
  hoverLine: GLine | null = null;

  constructor(app: App) {
    this.app = app;
    const el = app.world.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button }; });
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerleave', () => { this.app.hud.hideTip(); this.app.world.setHover(null, null); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  activeKey(): string | null {
    const m = this.mode;
    if (m.kind === 'plant') return `plant:${m.t}`;
    if (m.kind === 'line') return `line:${m.v}`;
    if (m.kind === 'demolish') return 'demolish';
    return null;
  }

  selectPlant(t: PlantType) {
    const g = this.app.game;
    if (!g.isUnlockedPlant(t)) { sfx.error(); this.app.hud.toast('🔒', `${PLANTS[t].name} er ikke oppfunnet ennå`, `Tilgjengelig fra ${PLANTS[t].unlock}.`, 'bad', 2500); return; }
    if (this.mode.kind === 'plant' && this.mode.t === t) { this.cancel(); return; }
    sfx.click();
    this.cancel(false);
    this.mode = { kind: 'plant', t };
    const res = PLANTS[t].resource;
    const ov = res === 'coast' ? 'coast' : res;
    this.app.world.setOverlay(ov as any, (i, j) => g.siteQuality(t, i, j));
    this.refreshSuggestions();
    this.app.emitUi('tool', this.mode);
    this.refreshHint();
  }

  /**
   * I starten av kampanjen: vis de beste elvekraftstedene innen 22 kV-rekkevidde av Kristiania,
   * til spilleren har bygd to elvekraftverk.
   */
  refreshSuggestions() {
    const g = this.app.game, w = this.app.world;
    const active = this.mode.kind === 'plant' && this.mode.t === 'river' && g.state.mode === 'campaign' && g.state.chapter === 0
      && g.state.nodes.filter((n) => n.ptype === 'river').length < 2;
    const oslo = active ? g.nodeByRef('oslo') : undefined;
    // litt innenfor maks linjelengde, siden linja ikke alltid kan gå i rett linje
    w.setSuggestions(oslo ? g.suggestSites('river', oslo, LINES.v22.maxTiles - 0.5, 3) : []);
  }

  selectLine(v: Voltage) {
    const g = this.app.game;
    if (!g.isUnlockedLine(v)) { sfx.error(); this.app.hud.toast('🔒', `${LINES[v].short} er ikke tilgjengelig ennå`, `Kommer i ${LINES[v].unlock}.`, 'bad', 2500); return; }
    if (this.mode.kind === 'line' && this.mode.v === v) { this.cancel(); return; }
    sfx.click();
    const from = this.mode.kind === 'line' ? this.mode.from : null;
    this.cancel(false);
    this.mode = { kind: 'line', v, from };
    this.app.emitUi('tool', this.mode);
    this.refreshHint();
  }

  selectDemolish() {
    if (this.mode.kind === 'demolish') { this.cancel(); return; }
    sfx.click();
    this.cancel(false);
    this.mode = { kind: 'demolish' };
    this.refreshHint();
  }

  cancel(refresh = true) {
    const w = this.app.world;
    if (this.mode.kind === 'plant') w.setOverlay('none', null);
    this.mode = { kind: 'none' };
    w.setSuggestions([]);
    w.setGhostModel(null);
    w.setPreviewLine(null);
    w.setHover(null, null);
    this.app.hud.hideTip();
    if (refresh) { this.refreshHint(); this.app.hud.update(true); }
  }

  /** Esc / høyreklikk: gå ett steg tilbake */
  back(): boolean {
    if (this.mode.kind === 'line' && this.mode.from) { this.mode.from = null; this.app.world.setPreviewLine(null); this.refreshHint(); return true; }
    if (this.mode.kind !== 'none') { this.cancel(); return true; }
    return false;
  }

  refreshHint() {
    const m = this.mode, hud = this.app.hud;
    if (m.kind === 'none') hud.setHint('🖱️ Dra for å flytte · scroll for zoom · høyreklikk-dra for å rotere · klikk på noe for detaljer');
    else if (m.kind === 'plant') hud.setHint(`Klikk for å bygge <b>${PLANTS[m.t].name}</b> – grønne/blå felt er best · <kbd>Esc</kbd> avbryter`);
    else if (m.kind === 'line' && !m.from) hud.setHint(`<b>${LINES[m.v].short}</b>: klikk på et kraftverk, en by eller en stasjon for å starte linja`);
    else if (m.kind === 'line') hud.setHint('Klikk på endepunktet · klikk på tomt land for å sette en stasjon og fortsette · <kbd>Esc</kbd>/høyreklikk avslutter');
    else hud.setHint('🧨 Klikk på en linje, stasjon eller et kraftverk for å rive · <kbd>Esc</kbd> avbryter');
  }

  private endpointAt(i: number, j: number): { ep: Endpoint; node?: GNode } {
    const g = this.app.game;
    const n = g.nodeAtTile(i, j, 1.2);
    if (n) return { ep: { node: n.id }, node: n };
    return { ep: { tile: [i, j] } };
  }

  private epPos(ep: Endpoint): THREE.Vector3 {
    const g = this.app.game;
    const t = this.app.terrain;
    if ('node' in ep) {
      const n = g.node(ep.node)!;
      return new THREE.Vector3(n.i + 0.5, surfaceY(t, n.i, n.j) + 0.5, n.j + 0.5);
    }
    return new THREE.Vector3(ep.tile[0] + 0.5, surfaceY(t, ep.tile[0], ep.tile[1]) + 0.5, ep.tile[1] + 0.5);
  }

  private onMove(e: PointerEvent) {
    this.lastMouse = { x: e.clientX, y: e.clientY };
    if (e.buttons !== 0 && this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) { this.app.hud.hideTip(); return; }
    this.updateHover();
  }

  updateHover() {
    if (this.app.modalOpen) return;
    const { x: mx, y: my } = this.lastMouse;
    const app = this.app, g = app.game, w = app.world, hud = app.hud;
    const p = w.pick(mx, my);
    this.lastPick = p;
    const el = w.renderer.domElement;
    if (!p) { w.setHover(null, null); hud.hideTip(); this.hoverNode = null; this.hoverLine = null; return; }
    const m = this.mode;
    const tx = mx, ty = my;
    if (m.kind === 'plant') {
      const c = g.checkPlant(m.t, p.i, p.j);
      w.setHover(p.i, p.j, c.ok);
      w.setGhostModel(m.t, p.i, p.j, c.ok);
      const s = PLANTS[m.t];
      hud.showTipAt(tx + 18, ty + 18, `<div class="tt">${s.icon} ${s.name}</div>
        <div class="row"><span>Stedskvalitet</span><b>${Math.round(c.quality * 100)} %</b></div>
        <div class="row"><span>Kapasitet</span><b>${fmt(c.cap)} MW</b></div>
        <div class="row"><span>Forventet snitt</span><b>${fmtMW(c.expected)}</b></div>
        <div class="row"><span>Kostnad</span><b>${fmt(c.cost)} MNOK</b></div>
        <div class="row"><span>Byggetid</span><b>${c.weeks} uker</b></div>
        ${c.ok ? '<div class="okk">✓ Klikk for å bygge</div>' : `<div class="err">✗ ${esc(c.reason ?? '')}</div>`}`);
      el.style.cursor = c.ok ? 'pointer' : 'not-allowed';
      return;
    }
    if (m.kind === 'line') {
      const tgt = this.endpointAt(p.i, p.j);
      if (tgt.node) w.setHover(tgt.node.i, tgt.node.j, true, tgt.node.kind === 'city' || tgt.node.kind === 'market' ? 3 : 1);
      else w.setHover(p.i, p.j, true);
      if (!m.from) {
        w.setPreviewLine(null);
        const name = tgt.node ? g.nodeName(tgt.node) : 'Ny transformatorstasjon';
        hud.showTipAt(tx + 18, ty + 18, `<div class="tt">${esc(name)}</div><div class="okk">Klikk for å starte ${LINES[m.v].short}-linje her</div>`);
        el.style.cursor = 'crosshair';
        return;
      }
      const plan = g.planLine(m.from, tgt.ep, m.v);
      w.setPreviewLine(this.epPos(m.from), this.epPos(tgt.ep), plan.ok, LINES[m.v].color);
      const toName = tgt.node ? g.nodeName(tgt.node) : 'ny stasjon';
      hud.showTipAt(tx + 18, ty + 18, `<div class="tt" style="color:${LINES[m.v].color}">${LINES[m.v].short} → ${esc(toName)}</div>
        <div class="row"><span>Lengde</span><b>${fmt(plan.km)} km${plan.seaTiles > 0.3 ? ` (${fmt(plan.seaTiles * 7)} km sjø)` : ''}</b></div>
        <div class="row"><span>Kapasitet</span><b>${fmt(plan.cap)} MW</b></div>
        <div class="row"><span>Kostnad</span><b>${fmt(plan.cost)} MNOK</b></div>
        <div class="row"><span>Byggetid</span><b>${plan.weeks} uker</b></div>
        ${plan.ok ? '<div class="okk">✓ Klikk for å bygge</div>' : `<div class="err">✗ ${esc(plan.reason ?? '')}</div>`}`);
      el.style.cursor = plan.ok ? 'crosshair' : 'not-allowed';
      return;
    }
    // inspeksjon / riving
    const n = g.nodeAtTile(p.i, p.j, 1.0);
    const l = n ? undefined : g.lineAt(p.x, p.z, 0.45);
    this.hoverNode = n ?? null;
    this.hoverLine = l ?? null;
    if (n) {
      w.setHover(n.i, n.j, m.kind !== 'demolish' || n.kind === 'plant' || n.kind === 'station', n.kind === 'city' || n.kind === 'market' ? 3 : 1);
      hud.showTipAt(tx + 18, ty + 18, this.nodeTip(n));
      el.style.cursor = 'pointer';
    } else if (l) {
      w.setHover(null, null);
      const load = Math.abs(l.flow ?? 0) / l.cap;
      hud.showTipAt(tx + 18, ty + 18, `<div class="tt" style="color:${LINES[l.v].color}">${LINES[l.v].short}: ${esc(g.lineName(l))}</div>
        <div class="row"><span>Flyt</span><b>${fmtMW(Math.abs(l.flow ?? 0))} / ${fmtMW(l.cap)}</b></div><div class="row"><span>Belastning</span><b>${Math.round(load * 100)} %</b></div>
        ${l.outage > 0 ? `<div class="err">Utfall: ${l.outage} uker</div>` : ''}${m.kind === 'demolish' ? '<div class="err">Klikk for å rive</div>' : ''}`);
      el.style.cursor = 'pointer';
    } else {
      w.setHover(null, null);
      hud.hideTip();
      el.style.cursor = '';
    }
  }

  private nodeTip(n: GNode): string {
    const g = this.app.game;
    const name = esc(g.nodeName(n));
    if (n.kind === 'city') {
      if (!g.isActive(n)) return `<div class="tt">${name}</div><div style="color:var(--muted)">Blir aktiv i et senere kapittel</div>`;
      return `<div class="tt">🏙️ ${name}</div><div class="row"><span>Forbruk</span><b>${fmtMW(n.demand ?? 0)}</b></div><div class="row"><span>Levert</span><b>${fmtMW(n.served ?? 0)}</b></div>
        ${n.blackout ? '<div class="err">Strømbrudd!</div>' : n.everPowered ? '' : '<div style="color:var(--warn)">Venter på strøm</div>'}`;
    }
    if (n.kind === 'industry') {
      const d = g.indDef(n);
      return `<div class="tt">🏭 ${name}</div><div class="row"><span>Behov</span><b>${fmtMW(n.demand ?? d.mw)}</b></div>${n.questDone ? '' : `<div class="row"><span>Bonus før ${d.deadline}</span><b>${d.reward} MNOK</b></div>`}`;
    }
    if (n.kind === 'market') {
      const d = g.marketDef(n);
      return `<div class="tt">🌍 ${name}</div><div class="row"><span>Pris</span><b>${fmt(g.marketPrice(d.id))} øre/kWh</b></div><div style="color:var(--muted)">${d.ac ? 'Kobles med ≥132 kV' : 'Krever HVDC-kabel'}</div>`;
    }
    if (n.kind === 'plant') {
      const s = PLANTS[n.ptype!];
      return `<div class="tt">${s.icon} ${s.name}</div>${n.progress < 1 ? `<div style="color:var(--accent)">Bygges: ${Math.round(n.progress * 100)} %</div>` : `<div class="row"><span>Produksjon</span><b>${fmtMW(n.out ?? 0)} / ${fmtMW(n.cap ?? 0)}</b></div>`}${this.mode.kind === 'demolish' ? '<div class="err">Klikk for å rive</div>' : ''}`;
    }
    return `<div class="tt">🔌 Transformatorstasjon</div>${this.mode.kind === 'demolish' ? '<div class="err">Klikk for å rive</div>' : ''}`;
  }

  private onUp(e: PointerEvent) {
    const d = this.down;
    this.down = null;
    if (!d || this.app.modalOpen) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 6 || performance.now() - d.t > 700) return;
    if (d.button === 2) { this.back(); this.updateHover(); return; }
    if (d.button !== 0) return;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    const p = this.app.world.pick(e.clientX, e.clientY);
    if (!p) return;
    this.click(p);
    this.updateHover();
  }

  private click(p: { i: number; j: number; x: number; z: number }) {
    const app = this.app, g = app.game, m = this.mode;
    if (m.kind === 'plant') {
      const c = g.checkPlant(m.t, p.i, p.j);
      if (!c.ok) { sfx.error(); app.hud.toast('✋', c.reason ?? 'Kan ikke bygge her', '', 'bad', 2000); if (c.reason === 'Ikke nok penger') app.hud.flashStat('money'); return; }
      const n = g.placePlant(m.t, p.i, p.j);
      if (n) { sfx.place(); app.floatText(n.i + 0.5, n.j + 0.5, `−${fmt(c.cost)} MNOK`, '#ffb3b3'); app.world.sync(); this.refreshSuggestions(); app.emitUi('placed', n); }
      return;
    }
    if (m.kind === 'line') {
      const tgt = this.endpointAt(p.i, p.j);
      if (!m.from) {
        if (!tgt.node) {
          // sjekk at tomta kan brukes til stasjon
          const plan = g.planLine(tgt.ep, { tile: [p.i + 2, p.j] }, m.v);
          if (plan.reason && /Stasjoner|Opptatt|nabolandet|Norge|Utenfor/.test(plan.reason)) { sfx.error(); app.hud.toast('✋', plan.reason, '', 'bad', 2000); return; }
        }
        m.from = tgt.ep;
        sfx.click();
        this.refreshHint();
        return;
      }
      const plan = g.planLine(m.from, tgt.ep, m.v);
      if (!plan.ok) { sfx.error(); app.hud.toast('✋', plan.reason ?? 'Kan ikke bygge linja', '', 'bad', 2200); if (plan.reason === 'Ikke nok penger') app.hud.flashStat('money'); return; }
      const l = g.buildLine(m.from, tgt.ep, m.v);
      if (l) {
        sfx.line();
        const b = g.node(l.b)!;
        app.floatText(b.i + 0.5, b.j + 0.5, `−${fmt(plan.cost)} MNOK`, '#ffb3b3');
        m.from = { node: l.b };
        app.world.sync();
        app.emitUi('lineBuilt', l);
      }
      return;
    }
    if (m.kind === 'demolish') {
      const n = g.nodeAtTile(p.i, p.j, 1.0);
      if (n && (n.kind === 'plant' || n.kind === 'station')) { app.confirmDemolish({ node: n }); return; }
      const l = n ? undefined : g.lineAt(p.x, p.z, 0.45);
      if (l) { g.demolishLine(l); sfx.place(); app.world.sync(); return; }
      sfx.error();
      return;
    }
    // inspeksjon
    const n = g.nodeAtTile(p.i, p.j, 1.0);
    if (n) { sfx.click(); app.select({ node: n }); return; }
    const l = g.lineAt(p.x, p.z, 0.45);
    if (l) { sfx.click(); app.select({ line: l }); return; }
    app.select(null);
  }
}
