import { h, fmt, fmtMW, fmtMoney, esc, loadColor } from './dom';
import type { App } from '../main';
import { PLANTS, LINES, PlantType, Voltage, ALL_VOLTAGES, curve, TARIFF, MONTHS, monthOf } from '../sim/config';
import type { GNode, GLine, NewsItem } from '../sim/types';
import { CHAPTERS } from '../sim/campaign';
import { sfx, muted, setMuted } from '../audio';
import { CITIES } from '../data/geo';
import { popAt } from '../sim/config';

const PLANT_ORDER: PlantType[] = ['river', 'reservoir', 'wind', 'offshore', 'solar', 'gas'];

export class HUD {
  app: App;
  root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private toolBtns = new Map<string, HTMLElement>();
  private toastsEl!: HTMLElement;
  private newsEl!: HTMLElement;
  private inspector!: HTMLElement;
  private objectives!: HTMLElement;
  tooltip!: HTMLElement;
  hintEl!: HTMLElement;
  private legend!: HTMLElement;
  private lastHud = 0;
  private newsOpen = false;
  private seenUnlocks = new Set<string>();
  private objCollapsed = false;

  constructor(app: App) {
    this.app = app;
    this.root = document.getElementById('hud')!;
    this.build();
  }

  private build() {
    const app = this.app;
    const r = this.root;
    r.innerHTML = '';
    // ---- toppfelt
    const speedBtns = ['⏸', '▶', '▶▶', '▶▶▶'].map((t, i) =>
      h('button', { title: ['Pause (mellomrom)', 'Normal fart (1 uke/sek)', 'Rask (2,5 uker/sek)', 'Superrask (7 uker/sek)'][i], onclick: () => { sfx.click(); app.setSpeed(i); } }, t));
    speedBtns.forEach((b, i) => (this.els[`sp${i}`] = b));
    const stat = (id: string, ico: string, label: string, extra?: HTMLElement, title?: string) =>
      h('div', { class: 'stat', id: `st-${id}`, title: title ?? '' }, h('span', { class: 'ico' }, ico),
        h('div', { class: 'col' }, h('span', { class: 'l' }, label), (this.els[id] = h('span', { class: 'v' }, '–')), extra ?? null));
    this.els.moneyDelta = h('span', { class: 'delta' });
    this.els.storageBar = h('i');
    this.els.omdBar = h('i');
    const top = h('header', { id: 'topbar' },
      h('div', { class: 'brand' }, 'STATGRID'),
      h('div', { class: 'datebox' }, (this.els.date = h('div', { class: 'd' })), (this.els.season = h('div', { class: 's' }))),
      h('div', { class: 'speed' }, ...speedBtns),
      stat('money', '💰', 'Kasse (MNOK)', this.els.moneyDelta, 'Penger til nye investeringer. Inntekter: levert strøm og eksport. Utgifter: drift, import, brensel og avbruddskostnader (KILE).'),
      stat('balance', '⚡', 'Produksjon / forbruk', undefined, 'Produsert effekt mot etterspurt effekt hos kunder koblet til nettet.'),
      stat('rel', '🛡️', 'Leveringssikkerhet', undefined, 'Andel av forbruket hos tilkoblede kunder som faktisk er levert i dette kapittelet.'),
      stat('storage', '💧', 'Magasinfylling', h('div', { class: 'minibar' }, this.els.storageBar), 'Hvor fulle vannmagasinene er. Fylles under snøsmeltingen i mai–juni, tappes om vinteren.'),
      stat('omd', '🙂', 'Omdømme', h('div', { class: 'minibar' }, this.els.omdBar), 'Folkets tillit. Strømbrudd og naturinngrep trekker ned. Lavt omdømme gjør konsesjoner dyrere.'),
      h('div', { class: 'spacer' }),
      (this.els.mute = h('button', { class: 'iconbtn', title: 'Lyd av/på', onclick: () => { setMuted(!muted); this.els.mute.textContent = muted ? '🔇' : '🔊'; } }, muted ? '🔇' : '🔊')),
      h('button', { class: 'iconbtn', title: 'Hjelp (H)', onclick: () => app.modals.help() }, '❓'),
      h('button', { class: 'iconbtn', title: 'Meny (Esc)', onclick: () => app.modals.pause() }, '☰'),
    );
    r.append(top);

    // ---- verktøylinje
    const tb = h('nav', { id: 'toolbar' });
    tb.append(h('div', { class: 'tgroup' }, 'Produksjon'));
    for (const t of PLANT_ORDER) {
      const s = PLANTS[t];
      const b = h('div', { class: 'tool', onclick: () => app.tools.selectPlant(t) },
        h('span', { class: 'tk' }, s.key), h('span', { class: 'ti' }, s.icon.slice(0, 2)), h('span', { class: 'tl' }, s.short));
      b.addEventListener('mouseenter', () => this.showToolTip(b, `plant:${t}`));
      b.addEventListener('mouseleave', () => this.hideTip());
      this.toolBtns.set(`plant:${t}`, b);
      tb.append(b);
    }
    tb.append(h('div', { class: 'tgroup' }, 'Nett'));
    for (const v of ALL_VOLTAGES) {
      const s = LINES[v];
      const b = h('div', { class: 'tool', onclick: () => app.tools.selectLine(v) },
        h('span', { class: 'tk' }, s.key), h('span', { class: 'swatch', style: { background: s.color } }), h('span', { class: 'tl' }, s.short));
      b.addEventListener('mouseenter', () => this.showToolTip(b, `line:${v}`));
      b.addEventListener('mouseleave', () => this.hideTip());
      this.toolBtns.set(`line:${v}`, b);
      tb.append(b);
    }
    tb.append(h('div', { class: 'tgroup' }, 'Verktøy'));
    const bd = h('div', { class: 'tool', onclick: () => app.tools.selectDemolish() }, h('span', { class: 'tk' }, 'Del'), h('span', { class: 'ti' }, '🧨'), h('span', { class: 'tl' }, 'Riv'));
    bd.addEventListener('mouseenter', () => this.showToolTip(bd, 'demolish'));
    bd.addEventListener('mouseleave', () => this.hideTip());
    this.toolBtns.set('demolish', bd);
    tb.append(bd);
    r.append(tb);

    // ---- høyrepanel
    this.objectives = h('div', { class: 'panel', id: 'objectives' });
    this.inspector = h('div', { class: 'panel hidden', id: 'inspector' });
    this.forecast = h('div', { class: 'panel', id: 'forecast' });
    r.append(h('div', { id: 'side' }, this.objectives, this.forecast, this.inspector));
    this.cardEl = h('div', { id: 'eventcard', class: 'hidden' });
    r.append(this.cardEl);

    // ---- kartmoduser
    const modes: [string, string, string][] = [['none', '🗺️ Kart', 'Vanlig visning'], ['load', '📊 Belastning', 'Fargelegg linjer etter hvor fulle de er (L)'], ['n1', '🛡️ N-1', 'Vis hvilke linjer som er kritiske dersom de faller ut (F)']];
    const mm = h('div', { id: 'mapmodes' });
    for (const [m, label, title] of modes) {
      const b = h('button', { title, onclick: () => { sfx.click(); app.setMapMode(m as any); } }, label);
      this.els[`mm-${m}`] = b;
      mm.append(b);
    }
    r.append(mm);
    this.legend = h('div', { id: 'legend' });
    r.append(this.legend);

    this.hintEl = h('div', { id: 'hint' });
    r.append(this.hintEl);
    this.toastsEl = h('div', { id: 'toasts' });
    r.append(this.toastsEl);
    this.newsEl = h('div', { id: 'newslog', class: 'panel hidden' });
    r.append(this.newsEl);
    r.append(h('button', { id: 'newsbtn', class: 'btn', onclick: () => this.toggleNews() }, '📰 Kraftnytt'));
    document.getElementById('tooltip')?.remove();
    this.tooltip = h('div', { id: 'tooltip', class: 'hidden' });
    document.body.append(this.tooltip);
  }

  // ---------------------------------------------------------------- tooltips
  private showToolTip(el: HTMLElement, key: string) {
    const g = this.app.game;
    let html = '';
    if (key.startsWith('plant:')) {
      const t = key.slice(6) as PlantType;
      const s = PLANTS[t];
      const unlocked = g.isUnlockedPlant(t);
      const cap = g.plantCap(t);
      html = `<div class="tt">${s.icon} ${s.name}</div><div style="max-width:260px;color:#c9d5e6;margin-bottom:4px">${s.desc}</div>
        ${unlocked ? `<div class="row"><span>Kapasitet</span><b>${fmt(cap)} MW</b></div><div class="row"><span>Pris</span><b>ca. ${fmt(cap * s.costPerMW[s.costPerMW.length - 1][1] * g.costMult())} MNOK</b></div><div class="row"><span>Byggetid</span><b>${s.buildWeeks} uker</b></div>` : `<div class="err">🔒 Tilgjengelig fra ${s.unlock}</div>`}`;
    } else if (key.startsWith('line:')) {
      const v = key.slice(5) as Voltage;
      const s = LINES[v];
      const unlocked = g.isUnlockedLine(v);
      html = `<div class="tt" style="color:${s.color}">${s.name}</div><div style="max-width:260px;color:#c9d5e6;margin-bottom:4px">${s.desc}</div>
        ${unlocked ? `<div class="row"><span>Kapasitet</span><b>${fmt(g.lineCap(v))} MW</b></div><div class="row"><span>Maks lengde</span><b>${fmt(s.maxTiles * 7)} km</b></div><div class="row"><span>Tap ved full last</span><b>${s.lossPct} % per 100 km</b></div>` : `<div class="err">🔒 Tilgjengelig fra ${s.unlock}</div>`}`;
    } else if (key === 'demolish') {
      html = `<div class="tt">🧨 Riv</div><div style="max-width:240px;color:#c9d5e6">Fjern linjer, stasjoner eller kraftverk. Du får tilbake 20 % (60 % hvis det ikke er ferdigbygd).</div>`;
    }
    const rect = el.getBoundingClientRect();
    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
    this.tooltip.style.left = `${rect.right - 8}px`;
    this.tooltip.style.top = `${rect.top - 16}px`;
  }
  hideTip() { this.tooltip.classList.add('hidden'); }
  showTipAt(x: number, y: number, html: string) {
    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
    const w = this.tooltip.offsetWidth, hh = this.tooltip.offsetHeight;
    this.tooltip.style.left = `${Math.min(x, window.innerWidth - w - 30)}px`;
    this.tooltip.style.top = `${Math.min(y, window.innerHeight - hh - 30)}px`;
  }

  setHint(html: string | null) {
    if (!html) this.hintEl.classList.add('hidden');
    else { this.hintEl.innerHTML = html; this.hintEl.classList.remove('hidden'); }
  }

  // ---------------------------------------------------------------- toasts / nyheter
  toast(icon: string, title: string, text = '', kind: string = 'info', ms = 4200) {
    const t = h('div', { class: `toast ${kind}` }, h('span', { class: 'ic' }, icon), h('div', {}, h('b', {}, title), text ? h('span', {}, text) : null));
    this.toastsEl.prepend(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastChild!.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  onNews(n: NewsItem) {
    // disse forklares i et eget hendelseskort når auto-pause er på
    const covered = /^(Vinteren nærmer seg|Tørrår|Våtår|Kuldeperiode|Energikrise|Ny industrikunde|Ekstremværet)/;
    if (this.app.autoPause && covered.test(n.title)) { if (this.newsOpen) this.renderNews(); return; }
    const short = n.text.length > 130 ? n.text.slice(0, 127) + '…' : n.text;
    this.toast(n.icon, n.title, n.kind === 'history' || n.kind === 'quest' || n.kind === 'bad' ? short : '', n.kind, n.kind === 'quest' || n.kind === 'history' ? 7000 : 4500);
    if (this.newsOpen) this.renderNews();
    const btn = document.getElementById('newsbtn');
    if (btn && !this.newsOpen) btn.textContent = '📰 Kraftnytt •';
  }

  private toggleNews() {
    this.newsOpen = !this.newsOpen;
    this.newsEl.classList.toggle('hidden', !this.newsOpen);
    document.getElementById('newsbtn')!.textContent = '📰 Kraftnytt';
    if (this.newsOpen) this.renderNews();
  }
  private renderNews() {
    const g = this.app.game;
    this.newsEl.innerHTML = '<h3>📰 Kraftnytt</h3>';
    for (const n of g.state.news) {
      const y = 1900 + Math.floor(n.week / 52);
      this.newsEl.append(h('div', { class: 'news-item' }, h('span', { class: 'ic' }, n.icon),
        h('div', {}, h('div', { class: 'dt' }, `${MONTHS[monthOf(n.week % 52)]} ${y}`), h('b', {}, n.title), h('div', {}, n.text))));
    }
  }

  // ---------------------------------------------------------------- oppdatering
  update(force = false) {
    const now = performance.now();
    if (!force && now - this.lastHud < 220) return;
    this.lastHud = now;
    const app = this.app, g = app.game, st = g.state;
    this.els.date.textContent = g.dateLabel();
    const woy = g.woy;
    const seasonTxt = woy < 9 || woy > 47 ? '❄️ Vinter' : woy < 22 ? '🌱 Vår – snøsmelting' : woy < 35 ? '☀️ Sommer' : '🍂 Høst';
    const evs = st.events.map((e) => ({ dry: '🏜️ tørrår', wet: '🌧️ våtår', cold: '🥶 kulde', price: '📈 høye priser', storm: '' })[e.type]).filter(Boolean);
    this.els.season.textContent = `${seasonTxt}${evs.length ? ' · ' + evs.join(', ') : ''}`;
    for (let i = 0; i < 4; i++) this.els[`sp${i}`].classList.toggle('on', app.speed === i);
    this.els.money.textContent = st.unlimited ? '∞' : fmtMoney(st.money);
    const L = g.weekLedger;
    const weekly = L.revenue + L.exportRev - L.importCost - L.fuel - L.maint - L.kile - L.losses;
    const yr = weekly * 52;
    this.els.moneyDelta.textContent = `${yr >= 0 ? '+' : ''}${fmt(yr)} /år`;
    this.els.moneyDelta.className = `delta ${yr >= 0 ? 'pos' : 'neg'}`;
    const T = g.totals;
    this.els.balance.innerHTML = `${fmtMW(T.gen)} <span style="color:var(--muted);font-weight:600">/ ${fmtMW(T.demand)}</span>`;
    const rel = g.reliability();
    this.els.rel.textContent = `${(rel * 100).toFixed(1).replace('.', ',')} %`;
    this.els.rel.style.color = rel >= 0.995 ? 'var(--good)' : rel >= 0.97 ? 'var(--warn)' : 'var(--bad)';
    const sl = T.storageMax > 0 ? T.storage / T.storageMax : 0;
    this.els.storage.textContent = T.storageMax > 0 ? `${Math.round(sl * 100)} %` : '–';
    this.els.storageBar.style.width = `${sl * 100}%`;
    this.els.storageBar.style.background = sl < 0.2 ? 'var(--bad)' : 'var(--accent-2)';
    this.els.omd.textContent = `${Math.round(st.omdomme)}`;
    this.els.omdBar.style.width = `${st.omdomme}%`;
    this.els.omdBar.style.background = st.omdomme < 30 ? 'var(--bad)' : st.omdomme < 55 ? 'var(--warn)' : 'var(--good)';
    document.getElementById('st-omd')!.firstElementChild!.textContent = st.omdomme < 30 ? '😠' : st.omdomme < 55 ? '😐' : '🙂';

    // verktøy-låser
    for (const [key, el] of this.toolBtns) {
      let locked = false, unlockYear = 0;
      if (key.startsWith('plant:')) { const t = key.slice(6) as PlantType; locked = !g.isUnlockedPlant(t); unlockYear = PLANTS[t].unlock; }
      if (key.startsWith('line:')) { const v = key.slice(5) as Voltage; locked = !g.isUnlockedLine(v); unlockYear = LINES[v].unlock; }
      el.classList.toggle('locked', locked);
      const tk = el.querySelector('.tk') as HTMLElement;
      if (locked) tk.textContent = `${unlockYear}`;
      else {
        tk.textContent = key.startsWith('plant:') ? PLANTS[key.slice(6) as PlantType].key : key.startsWith('line:') ? LINES[key.slice(5) as Voltage].key : 'Del';
        if (!this.seenUnlocks.has(key)) {
          this.seenUnlocks.add(key);
          if (unlockYear > 0 && g.year - unlockYear <= 1 && g.year > 1900) { el.classList.add('newly'); setTimeout(() => el.classList.remove('newly'), 20000); }
        }
      }
      el.classList.toggle('on', app.tools.activeKey() === key);
    }
    for (const m of ['none', 'load', 'n1']) this.els[`mm-${m}`].classList.toggle('on', app.world.mapMode === m);
    this.renderObjectives();
    this.renderForecast();
    this.renderLegend();
    this.renderInspector();
  }

  private renderLegend() {
    const app = this.app;
    const ov = app.world.tmesh.overlay;
    let html = '';
    if (ov !== 'none') {
      const names: Record<string, string> = { hydro: '💧 Vannkraftpotensial', wind: '🌬️ Vindressurs', offshore: '🌊 Havvind-ressurs', solar: '☀️ Solinnstråling', coast: '🔥 Kystnære tomter' };
      html = `<div class="panel"><b>${names[ov]}</b><div class="heat"></div><div style="display:flex;justify-content:space-between;color:var(--muted);font-size:11px"><span>Dårlig</span><span>Utmerket</span></div></div>`;
    } else if (app.world.mapMode === 'load') {
      html = `<div class="panel"><b>Linjebelastning</b>
        <div class="legend-row"><i style="background:#5ee06a"></i>Under 70 %</div>
        <div class="legend-row"><i style="background:#ffb020"></i>70–95 %</div>
        <div class="legend-row"><i style="background:#ff3b3b"></i>Full (flaskehals)</div></div>`;
    } else if (app.world.mapMode === 'n1') {
      const g = app.game;
      const crit = g.state.lines.filter((l) => l.critical).length;
      const ok = g.state.nodes.filter((n) => n.n1 === 'ok').length, risk = g.state.nodes.filter((n) => n.n1 === 'risk').length;
      html = `<div class="panel"><b>N-1-analyse (vinterlast)</b>
        <div class="legend-row"><i style="background:#ff8a1f"></i>Kritisk linje (${crit})</div>
        <div class="legend-row"><i style="background:#5ee06a"></i>Utfall tåles</div>
        <div style="margin-top:4px">🛡️ ${ok} sikre · ⚠️ ${risk} sårbare kunder</div>
        <div style="color:var(--muted);font-size:11px;max-width:220px;margin-top:3px">Hvis en kritisk linje faller ut, mister noen kunder strømmen. Bygg alternative veier (masket nett).</div></div>`;
    } else {
      html = `<div class="panel" style="opacity:.9"><b>Spenningsnivå</b>${ALL_VOLTAGES.filter((v) => app.game.isUnlockedLine(v)).map((v) => `<div class="legend-row"><i style="background:${LINES[v].color}"></i>${LINES[v].short}</div>`).join('')}</div>`;
    }
    if (this.legend.innerHTML !== html) this.legend.innerHTML = html;
  }

  private renderObjectives() {
    const g = this.app.game;
    const ch = g.chapterDef;
    let html = '';
    if (ch) {
      const oc = g.objectiveCache;
      const row = (o: { text: string; hint?: string }, s: { done: boolean; progress: number; label: string } | undefined, star: boolean) =>
        `<div class="obj ${s?.done ? 'done' : ''} ${star ? 'star' : ''}" title="${esc(o.hint ?? '')}"><div class="ck">${s?.done ? (star ? '★' : '✓') : star ? '☆' : ''}</div>
          <div class="ot">${esc(o.text)}<div class="pb"><i style="width:${Math.round((s?.progress ?? 0) * 100)}%"></i></div></div><div class="op">${esc(s?.label ?? '')}</div></div>`;
      const span = ch.endYear * 52 - (ch.startYear * 52 + ch.startWoy);
      const done = (g.state.week - ((ch.startYear - 1900) * 52 + ch.startWoy)) / span;
      html = `<button class="collapse-btn" data-act="collapse">${this.objCollapsed ? '▼' : '▲'}</button>
        <div class="era">Kapittel ${g.state.chapter + 1} · ${ch.era}</div><h3>${esc(ch.title)}</h3>`;
      if (!this.objCollapsed) {
        html += ch.main.map((o, i) => row(o, oc.main[i], false)).join('');
        html += `<div class="subhead">Stjernemål</div>` + ch.stars.map((o, i) => row(o, oc.stars[i], true)).join('');
      }
      html += `<div class="timebar">Tid igjen: til ${ch.endYear}<div class="pb"><i style="width:${Math.min(100, done * 100).toFixed(1)}%"></i></div></div>`;
      const { mainDone } = g.chapterProgress();
      if (mainDone) html += `<div style="margin-top:8px;font-size:12px;color:var(--good);font-weight:800">✓ Hovedmålene er nådd! Spill videre til ${ch.endYear} for flere stjerner, eller spol fram med ▶▶▶.</div>`;
    } else {
      const T = g.totals;
      const st = g.state;
      html = `<div class="era">Fri modus${st.unlimited ? ' · ubegrenset budsjett' : ''}</div><h3>Ditt kraftsystem</h3>
        <div class="obj"><div class="ot">Installert kapasitet</div><div class="op">${fmtMW(T.capacity)}</div></div>
        <div class="obj"><div class="ot">Byer med strøm</div><div class="op">${g.cityNodes().filter((n) => g.isPowered(n)).length}/${g.cityNodes().length}</div></div>
        <div class="obj"><div class="ot">Nettlinjer</div><div class="op">${fmt(st.lines.reduce((s, l) => s + l.tiles * 7, 0))} km</div></div>
        <div class="obj"><div class="ot">Fornybarandel</div><div class="op">${Math.round(st.stats.renewEMA * 100)} %</div></div>
        <div class="obj"><div class="ot">Nett-tap</div><div class="op">${T.gen > 0 ? ((T.loss / T.gen) * 100).toFixed(1).replace('.', ',') : '0'} %</div></div>
        <div class="obj"><div class="ot">Import / eksport nå</div><div class="op">${fmtMW(T.imp)} / ${fmtMW(T.exp)}</div></div>`;
    }
    if (this.objectives.innerHTML !== html) {
      this.objectives.innerHTML = html;
      this.objectives.querySelector('[data-act="collapse"]')?.addEventListener('click', () => { this.objCollapsed = !this.objCollapsed; this.update(true); });
    }
  }

  // ---------------------------------------------------------------- inspektør
  private inspectorKey = '';
  renderInspector() {
    const app = this.app, g = app.game;
    const sel = app.selection;
    if (!sel) { this.inspector.classList.add('hidden'); this.inspectorKey = ''; return; }
    this.inspector.classList.remove('hidden');
    let html = '';
    const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    const bar = (frac: number, color: string) => `<div class="loadbar"><i style="width:${Math.min(100, frac * 100)}%;background:${color}"></i></div>`;
    const btns: { label: string; act: () => void; cls?: string; disabled?: boolean; title?: string }[] = [];
    if (sel.node) {
      const n = g.node(sel.node.id);
      if (!n) { app.select(null); return; }
      const name = g.nodeName(n);
      if (n.kind === 'city') {
        const d = CITIES.find((c) => c.id === n.ref)!;
        const active = g.isActive(n);
        const pop = popAt(d.pop, g.yearFrac);
        const f5 = g.forecast(n, 5);
        const dem = n.demand ?? 0, srv = n.served ?? 0;
        html = `<div class="head"><span class="big">🏙️</span><div><h3>${esc(name)}</h3><span class="pill ${!active ? 'info' : n.blackout ? 'bad' : n.everPowered ? 'ok' : 'warn'}">${!active ? 'Ikke aktiv ennå' : n.blackout ? 'Strømbrudd!' : n.everPowered ? 'Har strøm' : 'Venter på strøm'}</span></div></div>`;
        html += kv('Innbyggere', `${fmt(pop * 1000)}`);
        if (active) {
          html += kv('Forbruk nå', fmtMW(dem)) + kv('Levert', fmtMW(srv)) + (dem > 0 ? bar(srv / dem, srv >= dem * 0.99 ? 'var(--good)' : 'var(--bad)') : '');
          const f0 = g.forecast(n, 0);
          html += kv('Snitt i år → om 5 år', `${fmtMW(f0)} → ${fmtMW(f5)} <small style="color:var(--muted)">(+${fmt((f5 / Math.max(0.001, f0) - 1) * 100)} %)</small>`);
          html += kv('N-1-sikker', n.n1 === 'ok' ? '<span class="pill ok">🛡️ Ja</span>' : n.n1 === 'risk' ? '<span class="pill bad">⚠️ Nei</span>' : '–');
          html += kv('Linjer inn', `${g.linesOf(n.id).length}`);
          html += `<div class="desc">Forbruket er størst om vinteren (oppvarming). Byen vokser – planlegg kapasitet i forkant.</div>`;
        } else html += `<div class="desc">Denne byen blir en del av spillet i et senere kapittel.</div>`;
      } else if (n.kind === 'industry') {
        const d = g.indDef(n);
        const dem = n.demand ?? 0, srv = n.served ?? 0;
        html = `<div class="head"><span class="big">🏭</span><div><h3>${esc(name)}</h3><span class="pill ${n.questDone ? 'ok' : 'warn'}">${n.questDone ? 'Tilkoblet' : `Frist ${d.deadline}`}</span></div></div>`;
        html += kv('Kunde', esc(d.owner)) + kv('Behov', fmtMW(dem)) + kv('Levert', fmtMW(srv)) + (dem > 0 ? bar(srv / dem, srv >= dem * 0.9 ? 'var(--good)' : 'var(--warn)') : '');
        if (!n.questDone) html += kv('Anleggsbidrag', `${fmt(d.reward)} MNOK ${g.yearFrac > d.deadline ? '<span class="pill bad">utløpt</span>' : ''}`);
        html += kv('N-1-sikker', n.n1 === 'ok' ? '🛡️ Ja' : n.n1 === 'risk' ? '⚠️ Nei' : '–');
        html += `<div class="fact">${esc(d.fact)}</div>`;
      } else if (n.kind === 'market') {
        const d = g.marketDef(n);
        const active = g.isActive(n);
        const ne = n.netExport ?? 0;
        html = `<div class="head"><span class="big">🌍</span><div><h3>${esc(name)}</h3><span class="pill ${active ? 'info' : 'warn'}">${active ? (d.ac ? 'Vekselstrøm (≥132 kV)' : 'Krever HVDC-kabel') : `Åpner ${d.year}`}</span></div></div>`;
        html += kv('Kraftpris nå', `${fmt(g.marketPrice(d.id))} øre/kWh`);
        html += kv('Din pris (tariff)', `${fmt(curve(TARIFF, g.yearFrac))} øre/kWh`);
        html += kv('Utveksling', ne > 0.05 ? `<span style="color:var(--good)">Eksport ${fmtMW(ne)}</span>` : ne < -0.05 ? `<span style="color:var(--warn)">Import ${fmtMW(-ne)}</span>` : '–');
        html += `<div class="desc">Når prisen her er høyere enn vannverdien i magasinene dine, eksporteres kraft. Når du mangler kraft, importeres den.</div><div class="fact">${esc(d.fact)}</div>`;
      } else if (n.kind === 'plant') {
        const s = PLANTS[n.ptype!];
        const building = n.progress < 1;
        html = `<div class="head"><span class="big">${s.icon}</span><div><h3>${esc(s.name)}</h3><span class="pill ${building ? 'warn' : (n.out ?? 0) > 0.01 ? 'ok' : 'info'}">${building ? `Under bygging ${Math.round(n.progress * 100)} %` : (n.out ?? 0) > 0.01 ? 'I drift' : 'Står stille'}</span></div></div>`;
        if (building) html += bar(n.progress, 'var(--accent)') + kv('Ferdig om', `${Math.ceil((1 - n.progress) * n.buildWeeks)} uker`);
        html += kv('Kapasitet', fmtMW(n.cap ?? 0));
        if (!building) html += kv('Produserer nå', fmtMW(n.out ?? 0)) + bar((n.out ?? 0) / (n.cap || 1), 'var(--accent-2)') + kv('Tilgjengelig nå', fmtMW(n.avail ?? 0));
        html += kv('Stedskvalitet', `${Math.round((n.quality ?? 0) * 100)} %`);
        html += kv('Forventet snitt', fmtMW((n.cap ?? 0) * g.expectedFactor(n.ptype!, n.quality ?? 1)));
        if (n.ptype === 'reservoir' && n.storageMax) {
          const lvl = (n.storage ?? 0) / n.storageMax;
          html += kv('Magasin', `${Math.round(lvl * 100)} %`) + bar(lvl, 'var(--accent-2)') + kv('Vannverdi', `${fmt(g.waterValue(n))} øre/kWh`);
        }
        if (n.ptype === 'gas') html += kv('Brensel + CO₂', `${fmt(g.marginalCost(n))} øre/kWh`);
        if (!g.linesOf(n.id).length) html += `<div class="fact" style="border-color:var(--warn)">⚠️ Ikke koblet til nettet! Trekk en linje fra kraftverket.</div>`;
        html += `<div class="desc">${esc(s.desc)}</div>`;
        if (n.upgrade) html += kv('Oppgraderes', `${Math.round(n.upgrade.progress * 100)} % → ${fmtMW(n.upgrade.cap)}`);
        const up = g.plantUpgrade(n);
        if (up) btns.push({ label: `⚙️ Moderniser til ${fmt(up.cap)} MW (${fmt(up.cost)})`, act: () => { if (g.upgradePlant(n)) sfx.place(); else sfx.error(); }, disabled: !up.ok, cls: 'primary' });
        btns.push({ label: '🧨 Riv', act: () => app.confirmDemolish({ node: n }), cls: 'danger' });
      } else if (n.kind === 'station') {
        html = `<div class="head"><span class="big">🔌</span><div><h3>Transformatorstasjon</h3><span class="pill info">${g.linesOf(n.id).length} linjer</span></div></div>
          <div class="desc">Knutepunkt i nettet. Her kan linjer med ulike spenningsnivåer kobles sammen.</div>`;
        btns.push({ label: '🧨 Riv', act: () => app.confirmDemolish({ node: n }), cls: 'danger' });
      }
    } else if (sel.line) {
      const l = g.state.lines.find((x) => x.id === sel.line!.id);
      if (!l) { app.select(null); return; }
      const s = LINES[l.v];
      const load = Math.abs(l.flow ?? 0) / l.cap;
      const building = l.progress < 1;
      html = `<div class="head"><span class="big">⚡</span><div><h3 style="color:${s.color}">${esc(s.name)}</h3><span class="pill ${l.outage > 0 ? 'bad' : building ? 'warn' : load > 0.95 ? 'bad' : 'ok'}">${l.outage > 0 ? `Utfall – ${l.outage} uker` : building ? `Bygges ${Math.round(l.progress * 100)} %` : load > 0.95 ? 'Flaskehals!' : 'I drift'}</span></div></div>`;
      html += kv('Strekning', esc(g.lineName(l))) + kv('Lengde', `${fmt(l.tiles * 7)} km${l.seaTiles > 0.3 ? ` (${fmt(l.seaTiles * 7)} km sjøkabel)` : ''}`);
      if (building) html += bar(l.progress, 'var(--accent)') + kv('Ferdig om', `${Math.ceil((1 - l.progress) * l.buildWeeks)} uker`);
      html += kv('Kapasitet', fmtMW(l.cap));
      if (!building) html += kv('Flyt nå', `${fmtMW(Math.abs(l.flow ?? 0))} (${Math.round(load * 100)} %)`) + bar(load, loadColor(load)) + kv('Tap', fmtMW(l.loss ?? 0));
      html += kv('N-1', l.critical ? '<span class="pill bad">Kritisk</span>' : '<span class="pill ok">Utfall tåles</span>');
      if (l.upgrade) html += kv('Oppgraderes', `${Math.round(l.upgrade.progress * 100)} % → ${LINES[l.upgrade.v].short}`);
      if (l.outage > 1) {
        const c = g.rushRepairCost(l);
        btns.push({ label: `🚁 Hastereparasjon (${fmt(c)} MNOK)`, act: () => { if (g.rushRepair(l)) sfx.built(); else sfx.error(); }, cls: 'primary', disabled: !g.state.unlimited && g.state.money < c });
      }
      if (!building) for (const o of g.upgradeOptions(l)) {
        if (!g.isUnlockedLine(o.v)) continue;
        btns.push({ label: `⬆️ ${LINES[o.v].short} (${fmt(o.cost)})`, act: () => { if (g.upgradeLine(l, o.v)) sfx.place(); else sfx.error(); }, disabled: !o.ok, title: o.reason });
      }
      btns.push({ label: '🧨 Riv', act: () => app.confirmDemolish({ line: l }), cls: 'danger' });
    }
    const key = html + '|' + btns.map((b) => b.label + b.disabled).join(',');
    if (key === this.inspectorKey) return;
    this.inspectorKey = key;
    this.inspector.innerHTML = `<button class="collapse-btn" data-act="close" title="Lukk">✕</button>` + html;
    if (btns.length) {
      const bw = h('div', { class: 'btns' });
      for (const b of btns) bw.append(h('button', { class: `btn ${b.cls ?? ''}`, disabled: b.disabled, title: b.title ?? '', onclick: () => { b.act(); this.inspectorKey = ''; this.update(true); } }, b.label));
      this.inspector.append(bw);
    }
    this.inspector.querySelector('[data-act="close"]')!.addEventListener('click', () => app.select(null));
  }

  flashStat(id: string) {
    const el = document.getElementById(`st-${id}`);
    if (!el) return;
    el.classList.remove('flash-bad');
    void el.offsetWidth;
    el.classList.add('flash-bad');
  }

  toolButton(key: string) { return this.toolBtns.get(key); }

  // ---------------------------------------------------------------- prognose
  private forecast!: HTMLElement;
  private forecastOpen = true;
  private forecastKey = '';
  private renderForecast() {
    const g = this.app.game;
    const data = g.forecastBalance(12);
    const maxV = Math.max(1, ...data.map((d) => Math.max(d.demand, d.supply)));
    const any = data.some((d) => d.demand > 0.01 || d.supply > 0.01);
    const key = this.forecastOpen + '|' + data.map((d) => `${d.demand.toFixed(1)}:${d.supply.toFixed(1)}`).join(',');
    if (key === this.forecastKey) return;
    this.forecastKey = key;
    let body = '';
    if (!this.forecastOpen) body = '';
    else if (!any) body = '<div style="font-size:12px;color:var(--muted);margin-top:6px">Bygg et kraftverk og koble til en by, så ser du prognosen her.</div>';
    else {
      const W = 290, H = 92, bw = W / data.length;
      let bars = '';
      const firstDeficit = data.findIndex((d) => d.supply < d.demand * 0.999);
      const firstTight = data.findIndex((d) => d.supply < d.demand * 1.08);
      data.forEach((d, i) => {
        const x = i * bw;
        const hs = (d.supply / maxV) * (H - 14), hd = (d.demand / maxV) * (H - 14);
        const deficit = d.supply < d.demand * 0.999;
        const winter = d.woy < 12 || d.woy > 44;
        const tip = `${d.label}: produksjon ${fmtMW(d.supply)}, forbruk ${fmtMW(d.demand)}${deficit ? ` – UNDERSKUDD ${fmtMW(d.demand - d.supply)}` : ''}`;
        bars += `<g><title>${tip}</title>`;
        if (winter) bars += `<rect x="${x}" y="0" width="${bw}" height="${H - 12}" fill="rgba(160,200,255,0.07)"/>`;
        bars += `<rect x="${x + 3}" y="${H - 12 - hs}" width="${bw - 6}" height="${hs}" rx="2" fill="${deficit ? '#ff5d5d' : d.supply < d.demand * 1.08 ? '#ffb020' : '#3de0ff'}" opacity="${i === 0 ? 1 : 0.8}"/>`;
        bars += `<rect x="${x + 1}" y="${H - 13 - hd}" width="${bw - 2}" height="2.5" fill="#ffd23f"/>`;
        bars += `<text x="${x + bw / 2}" y="${H - 1}" text-anchor="middle" font-size="9" fill="${i === 0 ? '#fff' : '#9fb0c8'}" font-weight="${i === 0 ? 800 : 600}">${d.label}</text></g>`;
      });
      const msg = firstDeficit < 0
        ? (firstTight >= 0 ? `<span style="color:var(--warn)">Knapp margin i ${data[firstTight].label} – lite rom for kulde eller variasjon.</span>` : '<span style="color:var(--good)">✓ God margin hele året (uten storm og tørke).</span>')
        : firstDeficit === 0
          ? `<span style="color:var(--bad)">⚠️ Underskudd nå: ${fmtMW(data[0].demand - data[0].supply)} mangler.</span>`
          : `<span style="color:var(--warn)">⚠️ Underskudd ventet i ${data[firstDeficit].label} (${fmtMW(data[firstDeficit].demand - data[firstDeficit].supply)}). Du har ca. ${Math.round((firstDeficit * 52) / 12)} uker på deg.</span>`;
      body = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;margin-top:6px">${bars}</svg>
        <div style="display:flex;gap:10px;font-size:10px;color:var(--muted);margin:2px 0 4px"><span><i style="display:inline-block;width:10px;height:8px;background:#3de0ff;border-radius:2px"></i> forventet produksjon</span><span><i style="display:inline-block;width:10px;height:3px;background:#ffd23f;vertical-align:middle"></i> forbruk</span><span><i style="display:inline-block;width:10px;height:8px;background:#ffb020;border-radius:2px"></i> knapt</span><span>lyst felt = vinter</span></div>
        <div style="font-size:12px;font-weight:700">${msg}</div>`;
    }
    this.forecast.innerHTML = `<button class="collapse-btn" data-act="fc">${this.forecastOpen ? '▲' : '▼'}</button><div class="era">Prognose · neste 12 måneder</div><h3 style="font-size:14px">📈 Kraftbalanse</h3>${body}`;
    this.forecast.querySelector('[data-act="fc"]')!.addEventListener('click', () => { this.forecastOpen = !this.forecastOpen; this.forecastKey = ''; this.renderForecast(); });
  }

  // ---------------------------------------------------------------- hendelseskort
  private cardEl!: HTMLElement;
  private cardQueue: EventCard[] = [];
  private cardShowing: EventCard | null = null;
  private resumeSpeed = 1;
  get cardOpen() { return !!this.cardShowing; }

  showCard(c: EventCard) {
    const app = this.app;
    if (!app.autoPause) {
      this.toast(c.icon, c.title, c.what, c.kind ?? 'bad', 7000);
      return;
    }
    if (this.cardShowing?.key === c.key || this.cardQueue.some((q) => q.key === c.key)) return;
    if (!this.cardShowing && this.cardQueue.length === 0) this.resumeSpeed = Math.max(1, app.speed);
    app.setSpeed(0);
    this.cardQueue.push(c);
    if (!this.cardShowing) this.nextCard();
  }

  private nextCard() {
    const c = this.cardQueue.shift() ?? null;
    this.cardShowing = c;
    if (!c) { this.cardEl.classList.add('hidden'); return; }
    const app = this.app;
    sfx.alert();
    const sec = (t: string, v?: string) => (v ? `<div class="ec-sec"><b>${t}</b><div>${v}</div></div>` : '');
    this.cardEl.className = `ec-${c.kind ?? 'bad'}`;
    this.cardEl.innerHTML = `<div class="ec-head"><span class="ec-ic">${c.icon}</span><div><div class="ec-date">${app.game.dateLabel()}${this.cardQueue.length ? ` · ${this.cardQueue.length} til` : ''}</div><h3>${esc(c.title)}</h3></div></div>
      ${sec('Hva skjer?', c.what)}${sec('Hvorfor?', c.why)}${sec('Hva kan du gjøre?', c.todo)}
      <div class="ec-btns"><label class="ec-auto"><input type="checkbox" checked> Pause ved viktige hendelser</label><span style="flex:1"></span>
      ${c.focus ? '<button class="btn" data-act="show">📍 Vis meg</button>' : ''}<button class="btn primary" data-act="go">${this.cardQueue.length ? 'Neste ▸' : 'Fortsett ▶'}</button></div>`;
    this.cardEl.querySelector('[data-act="show"]')?.addEventListener('click', () => { sfx.click(); c.focus?.(); });
    this.cardEl.querySelector('[data-act="go"]')!.addEventListener('click', () => this.closeCard());
    const cb = this.cardEl.querySelector('input') as HTMLInputElement;
    cb.addEventListener('change', () => app.setAutoPause(cb.checked));
  }

  closeCard() {
    if (!this.cardShowing) return;
    sfx.click();
    if (this.cardQueue.length) { this.nextCard(); return; }
    this.cardShowing = null;
    this.cardEl.classList.add('hidden');
    this.app.setSpeed(this.resumeSpeed);
  }
  chapterCount() { return CHAPTERS.length; }
}

export interface EventCard {
  key: string;
  icon: string;
  title: string;
  what: string;
  why?: string;
  todo?: string;
  kind?: 'bad' | 'good' | 'info' | 'quest';
  focus?: () => void;
}

export type { GNode, GLine };
