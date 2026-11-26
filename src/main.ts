import './ui/style.css';
import { generateTerrain, Terrain } from './world/terrain';
import { World, MapMode } from './render/world';
import { Game } from './sim/game';
import type { GameState, GNode, GLine } from './sim/types';
import { CHAPTERS } from './sim/campaign';
import { HUD } from './ui/hud';
import { Tools } from './ui/tools';
import { Labels } from './ui/labels';
import { Modals } from './ui/modals';
import { Tutorial } from './ui/tutorial';
import { sfx } from './audio';
import { PLANTS, LINES, PlantType, Voltage, riverFlow } from './sim/config';
import type { EventCard } from './ui/hud';

const SAVE_KEY = 'statgrid-save-v1';
const PROGRESS_KEY = 'statgrid-progress-v1';
const SNAP_KEY = (i: number) => `statgrid-chapter-${i}-v1`;
const SPEEDS = [0, 1, 2.5, 7]; // uker per sekund

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export class App {
  terrain: Terrain;
  world: World;
  game!: Game;
  hud!: HUD;
  tools!: Tools;
  labels!: Labels;
  modals: Modals;
  tutorial!: Tutorial;
  speed = 0;
  modalOpen = false;
  selection: { node?: GNode; line?: GLine } | null = null;
  private acc = 0;
  private lastT = performance.now();
  private uiListeners = new Map<string, ((p: any) => void)[]>();
  private autosaveWeek = 0;
  inGame = false;
  autoPause = (() => { try { return localStorage.getItem('statgrid-autopause') !== '0'; } catch { return true; } })();
  private pendingBlackouts: GNode[] = [];
  private lastBlackoutCard = -999;
  private lastBlackoutCause = '';

  setAutoPause(on: boolean) {
    this.autoPause = on;
    try { localStorage.setItem('statgrid-autopause', on ? '1' : '0'); } catch { /* ignorer */ }
  }

  constructor() {
    this.terrain = generateTerrain();
    this.world = new World(document.getElementById('viewport')!, this.terrain);
    this.modals = new Modals(this);
    // tittelskjerm-kamera
    this.world.focusLL(9.5, 62.2, 150, true);
    this.world.setView(0.95, -0.5);
    this.bindKeys();
    requestAnimationFrame((t) => this.loop(t));
  }

  emitUi(ev: string, p?: any) { for (const f of this.uiListeners.get(ev) ?? []) f(p); }
  onUi(ev: string, f: (p: any) => void) { if (!this.uiListeners.has(ev)) this.uiListeners.set(ev, []); this.uiListeners.get(ev)!.push(f); }

  // ---------------------------------------------------------------- oppstart / lagring
  hasSave() { return !!store()?.getItem(SAVE_KEY); }
  hasChapterSnapshot(i: number) { return !!store()?.getItem(SNAP_KEY(i)); }
  loadProgress(): Record<number, number> {
    try { return JSON.parse(store()?.getItem(PROGRESS_KEY) ?? '{}'); } catch { return {}; }
  }
  private saveProgress(ch: number, stars: number) {
    const p = this.loadProgress();
    p[ch] = Math.max(p[ch] ?? 0, stars);
    store()?.setItem(PROGRESS_KEY, JSON.stringify(p));
  }

  save() {
    if (!this.inGame) return;
    try { store()?.setItem(SAVE_KEY, JSON.stringify(this.game.state)); } catch { /* full lagring */ }
  }

  private start(state: GameState) {
    this.game = new Game(this.terrain, state);
    this.game.prime();
    // fjern gammelt HUD-innhold
    this.labels?.clear();
    this.hud = new HUD(this);
    this.labels = this.labels ?? new Labels(this);
    this.labels.clear();
    if (!this.tools) this.tools = new Tools(this);
    else this.tools.cancel(false);
    this.tutorial = new Tutorial(this);
    this.world.setGame(this.game);
    this.world.setSeason(this.game.woy, true);
    this.bindGameEvents();
    this.selection = null;
    this.world.select(null, null);
    this.setSpeed(0);
    this.modals.close();
    document.getElementById('hud')!.classList.remove('hidden');
    this.inGame = true;
    this.tools.refreshHint();
    this.game.evaluateObjectives();
    this.hud.update(true);
    this.autosaveWeek = this.game.state.week;
  }

  newCampaign() {
    const st = Game.createState('campaign', this.terrain);
    this.start(st);
    this.game.beginChapter();
    this.snapshotChapter(0);
    const ch = CHAPTERS[0];
    this.world.focusLL(ch.focus[0], ch.focus[1], ch.focus[2]);
    this.modals.chapterIntro(0, () => this.tutorial.start());
  }

  newFree(year: number, unlimited: boolean) {
    const st = Game.createState('free', this.terrain, { startYear: year, unlimited });
    this.start(st);
    this.game.news('🗺️', 'Fri modus', `Året er ${year}. Hele landet venter på strøm!`, 'info');
    this.world.focusLL(10.5, 60.5, 120);
  }

  continueGame() {
    try {
      const st = JSON.parse(store()!.getItem(SAVE_KEY)!) as GameState;
      this.start(st);
      const n = this.game.nodeByRef('oslo')!;
      this.world.focusTile(n.i, n.j, 90);
      this.hud.toast('💾', 'Velkommen tilbake!', this.game.dateLabel(), 'good', 2500);
      if (st.ended) this.onChapterEnd();
    } catch (e) {
      console.error(e);
      this.hud?.toast('⚠️', 'Kunne ikke laste lagret spill', '', 'bad');
    }
  }

  private snapshotChapter(i: number) {
    try { store()?.setItem(SNAP_KEY(i), JSON.stringify(this.game.state)); } catch { /* ignorer */ }
  }

  loadChapterSnapshot(i: number) {
    const raw = store()?.getItem(SNAP_KEY(i));
    if (!raw) { if (i === 0) this.newCampaign(); return; }
    const st = JSON.parse(raw) as GameState;
    this.start(st);
    const ch = CHAPTERS[i];
    this.world.focusLL(ch.focus[0], ch.focus[1], ch.focus[2]);
    this.modals.chapterIntro(i, () => { if (i === 0) this.tutorial.start(); });
  }

  toMenu() {
    this.inGame = false;
    this.setSpeed(0);
    this.tools?.cancel(false);
    document.getElementById('hud')!.classList.add('hidden');
    this.labels?.clear();
    this.modals.mainMenu();
  }

  // ---------------------------------------------------------------- spillhendelser
  private bindGameEvents() {
    const g = this.game;
    g.on('news', (n) => {
      this.hud.onNews(n);
      if (n.kind === 'bad') sfx.alert();
      if (n.kind === 'history') sfx.click();
    });
    g.on('powered', (n: GNode) => {
      sfx.powered();
      this.world.burst(n.i + 0.5, 1.5, n.j + 0.5, '#ffe066', 30);
      if (n.kind === 'city') this.floatText(n.i + 0.5, n.j + 0.5, '💡 Strøm!', '#ffe066');
    });
    g.on('quest', ({ node, reward }) => { sfx.coin(); this.floatText(node.i + 0.5, node.j + 0.5, `+${reward} MNOK`, '#5ee06a'); });
    g.on('blackout', (n: GNode) => {
      if (n.kind === 'city' || n.kind === 'industry') {
        this.pendingBlackouts.push(n);
        sfx.error();
        this.hud.flashStat('rel');
      }
    });
    g.on('restored', (n: GNode) => this.floatText(n.i + 0.5, n.j + 0.5, '✓ Strømmen er tilbake', '#5ee06a'));
    g.on('outage', (l: GLine) => {
      sfx.storm();
      const a = g.node(l.a)!, b = g.node(l.b)!;
      if (!l.critical) { this.hud.toast('🌩️', 'Ekstremvær slo ut en linje', `${g.lineName(l)} er ute i ${l.outage} uker – men nettet har en annen vei (N-1). 💪`, 'good', 6000); return; }
      this.card({
        key: `storm-${l.id}-${g.state.week}`, icon: '🌩️', title: 'Ekstremvær slår ut en linje',
        what: `Linja ${g.lineName(l)} er ute av drift i ${l.outage} uker.`,
        why: 'Lange luftlinjer over fjell og langs kysten er utsatt for sterk vind, ising og trefall – særlig om vinteren.',
        todo: l.critical
          ? 'Denne linja er <b>kritisk</b>: noen kunder har ingen annen vei for strømmen. Klikk på linja for hastereparasjon, og bygg en ekstra forbindelse (N-1) så det tåles neste gang.'
          : 'Nettet ditt har en alternativ vei, så kundene merker det trolig ikke. Det er N-1 i praksis! 💪',
        kind: l.critical ? 'bad' : 'good',
        focus: () => { this.world.focusTile((a.i + b.i) / 2, (a.j + b.j) / 2, 40); this.select({ line: l }); },
      });
    });
    g.on('objective', (o) => {
      sfx.objective();
      this.hud.toast('🎯', 'Mål nådd!', o.text, 'good', 5000);
      this.modals.confetti();
    });
    g.on('built', (p) => {
      if (p.done && p.node) sfx.built();
      this.world.sync();
    });
    g.on('removed', () => this.world.sync());
    g.on('network', () => this.world.sync());
    g.on('chapterEnd', () => this.onChapterEnd());
    g.on('campaignDone', () => this.modals.campaignDone());
    g.on('industry', (n: GNode) => {
      this.floatText(n.i + 0.5, n.j + 0.5, '📋 Ny kunde!', '#ffd23f');
      const d = g.indDef(n);
      this.card({
        key: `ind-${d.id}`, icon: '🏭', title: `Ny industrikunde: ${d.name}`, kind: 'quest',
        what: `${d.owner} vil etablere seg og trenger <b>${d.mw} MW</b> – først halvparten, så fullt behov etter et års tid.`,
        why: d.fact,
        todo: `Lever minst 90 % av behovet i én uke før <b>${d.deadline}</b> for å få <b>${d.reward} MNOK</b> i anleggsbidrag. Det er lettest under vårflommen. Byene får strøm først, og hver linje har en grense for hvor mye den kan frakte. Etterpå bruker industrien like mye strøm hele året, også om vinteren.`,
        focus: () => { this.world.focusTile(n.i, n.j, 35); this.select({ node: n }); },
      });
    });
    g.on('winterWarning', ({ deficit, early }: { deficit: number; early: boolean }) => {
      this.hud.flashStat('balance');
      const rf = Math.round(riverFlow(4) * 100);
      const weeks = PLANTS.river.buildWeeks;
      const per = g.riverWinterMW(0.55);
      const plants = Math.max(1, Math.ceil(deficit / Math.max(0.1, per)));
      this.card({
        key: `winter-${g.year}`, icon: '❄️', title: early ? 'Planlegg for vinteren' : 'Vinteren nærmer seg', kind: 'bad',
        what: `Prognosen viser et underskudd på rundt <b>${Math.ceil(deficit)} MW</b> i vinter – også når det du allerede bygger er ferdig.`,
        why: `Om vinteren bruker folk opptil 30 % mer strøm til lys og varme, samtidig som elvene fryser. Et elvekraftverk gir da bare rundt ${rf} % av kapasiteten – omtrent <b>${per.toFixed(1).replace('.', ',')} MW</b> for et godt fall.`,
        todo: early
          ? `Bygg omtrent <b>${plants} elvekraftverk til</b> nå. De tar ${weeks} uker og står klare før frosten hvis du starter med en gang.${g.isUnlockedPlant('reservoir') ? ' Et magasinkraftverk kan spare vårflommen til vinteren.' : ''} Følg med på <b>📈 Kraftbalanse</b> i panelet til høyre.`
          : `Bygg mer produksjon nå – et elvekraftverk tar ${weeks} uker å bygge${g.isUnlockedPlant('reservoir') ? ', og et magasinkraftverk kan spare vårflommen til vinteren' : ''}. Følg med på <b>📈 Kraftbalanse</b> i panelet til høyre.`,
      });
    });
    g.on('climate', (type: string) => {
      const texts: Record<string, Omit<EventCard, 'key'>> = {
        dry: { icon: '🏜️', title: 'Tørrår', kind: 'bad', what: 'Det har kommet lite snø i fjellet, og tilsiget til elver og magasiner blir rundt 30 % lavere enn normalt i år.', why: 'Vannkraft avhenger av nedbør. I tørre år fylles ikke magasinene opp under snøsmeltingen.', todo: 'Spar på vannet før vinteren, bygg reservekapasitet og bruk utenlandsforbindelser for import hvis du har dem.' },
        wet: { icon: '🌧️', title: 'Våtår', kind: 'good', what: 'Rekordmye nedbør gir rundt 30 % mer tilsig i år.', why: 'Mye vann i magasinene betyr lav vannverdi.', todo: 'Har du kabler til utlandet, vil overskuddet eksporteres og gi inntekter.' },
        cold: { icon: '🥶', title: 'Kuldeperiode', kind: 'bad', what: 'Streng kulde i hele landet øker forbruket med nesten 20 % de neste tre ukene.', why: 'Mye av oppvarmingen i Norge er elektrisk, så forbruket følger temperaturen.', todo: 'Har du lite margin, kan det bli strømbrudd. Hastebygging hjelper ikke nå – men husk det til neste vinter.' },
        price: { icon: '📈', title: 'Energikrise i Europa', kind: 'bad', what: 'Kraftprisene på kontinentet har tredoblet seg.', why: 'Gassmangel i Europa gir høye priser. Med kabler flyter norsk kraft dit prisen er høyest.', todo: 'Eksport gir store inntekter, men pass på at magasinene ikke tømmes før vinteren.' },
      };
      const t = texts[type];
      if (t) this.card({ key: `climate-${type}-${g.year}`, ...t });
    });
  }

  card(c: EventCard) {
    if (!this.inGame) return;
    this.hud.showCard(c);
  }

  /** Etter en uke: lag ett samlet kort for nye strømbrudd, med årsak */
  private flushBlackouts() {
    if (!this.pendingBlackouts.length) return;
    const g = this.game;
    const nodes = this.pendingBlackouts.filter((n) => n.blackout);
    this.pendingBlackouts = [];
    if (!nodes.length) return;
    const names = nodes.map((n) => g.nodeName(n));
    const diag = g.diagnose(nodes[0]);
    const recent = g.state.week - this.lastBlackoutCard < 13 && diag.cause === this.lastBlackoutCause;
    if (recent) { this.hud.toast('⚠️', `Strømbrudd i ${names.join(', ')}`, '', 'bad', 3500); return; }
    this.lastBlackoutCard = g.state.week;
    this.lastBlackoutCause = diag.cause;
    const todo = diag.cause === 'gen'
      ? `Bygg mer produksjon i dette nettet${g.isUnlockedPlant('reservoir') ? ' – gjerne et magasinkraftverk som kan lagre vann til vinteren' : ''}, eller koble det sammen med et nett som har overskudd.`
      : diag.cause === 'grid'
        ? 'Bygg en ekstra linje ved siden av, eller klikk på linja og oppgrader til høyere spenning for mer kapasitet.'
        : 'Vent på reparasjon eller bruk hastereparasjon på linja. Bygg en ekstra forbindelse, så tåler byen utfall neste gang (N-1).';
    const n0 = nodes[0];
    this.card({
      key: `black-${g.state.week}`, icon: '⚠️', title: `Strømbrudd i ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` og ${names.length - 3} til` : ''}`,
      what: 'Kundene får ikke all strømmen de trenger. Det koster omdømme og avbruddskostnader (KILE), og trekker ned leveringssikkerheten.',
      why: diag.text, todo, kind: 'bad',
      focus: () => {
        if (diag.line) { const a = g.node(diag.line.a)!, b = g.node(diag.line.b)!; this.world.focusTile((a.i + b.i) / 2, (a.j + b.j) / 2, 35); this.select({ line: diag.line }); }
        else { this.world.focusTile(n0.i, n0.j, 35); this.select({ node: n0 }); }
      },
    });
  }

  private onChapterEnd() {
    const g = this.game;
    this.setSpeed(0);
    this.tools.cancel();
    const idx = g.state.chapter;
    const { stars } = g.chapterProgress();
    this.saveProgress(idx, stars);
    this.save();
    this.modals.chapterEnd(idx, stars, () => {
      g.advanceChapter();
      if (g.state.mode === 'campaign') {
        this.snapshotChapter(g.state.chapter);
        this.save();
        const ch = CHAPTERS[g.state.chapter];
        this.world.focusLL(ch.focus[0], ch.focus[1], ch.focus[2]);
        this.modals.chapterIntro(g.state.chapter, () => {});
        this.hud.update(true);
      } else {
        this.save();
        this.hud.update(true);
      }
    }, () => this.loadChapterSnapshot(idx));
  }

  // ---------------------------------------------------------------- handlinger
  setSpeed(i: number) {
    this.speed = i;
    if (this.inGame) this.hud?.update(true);
  }

  setMapMode(m: MapMode) {
    this.world.mapMode = this.world.mapMode === m ? 'none' : m;
    if (m === 'n1') this.game.n1Dirty = this.game.n1Dirty || false;
    this.hud.update(true);
  }

  select(sel: { node?: GNode; line?: GLine } | null) {
    this.selection = sel;
    this.world.select(sel?.node ?? null, sel?.line ?? null);
    this.hud.update(true);
  }

  confirmDemolish(t: { node?: GNode; line?: GLine }) {
    const g = this.game;
    if (t.line) { g.demolishLine(t.line); sfx.place(); this.select(null); this.world.sync(); return; }
    const n = t.node!;
    if (n.kind === 'station') { g.demolishNode(n); sfx.place(); this.select(null); this.world.sync(); return; }
    const name = n.kind === 'plant' ? PLANTS[n.ptype!].name.toLowerCase() : 'anlegget';
    this.modals.confirm('Rive?', `Vil du rive dette ${name}et? Tilhørende linjer rives også. Du får tilbake ${n.progress >= 1 ? '20' : '60'} % av kostnaden.`, '🧨 Riv', () => {
      g.demolishNode(n); sfx.place(); this.select(null); this.world.sync();
    });
  }

  floatText(x: number, z: number, text: string, color?: string) { this.labels.floatText(x, z, text, color); }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.inGame) return;
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (this.hud?.cardOpen && (k === 'escape' || k === ' ' || k === 'enter')) { e.preventDefault(); this.hud.closeCard(); return; }
      if (k === 'escape') {
        if (this.modalOpen) { if (!document.querySelector('.menu')) this.modals.close(); return; }
        if (this.tools.back()) return;
        if (this.selection) { this.select(null); return; }
        this.modals.pause();
        return;
      }
      if (this.modalOpen) return;
      if (k === ' ') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); return; }
      if (k === '+' || k === '=') { this.setSpeed(Math.min(3, this.speed + 1)); return; }
      if (k === '-') { this.setSpeed(Math.max(0, this.speed - 1)); return; }
      if (k === 'h') { this.modals.help(); return; }
      if (k === 'l') { this.setMapMode('load'); return; }
      if (k === 'f') { this.setMapMode('n1'); return; }
      if (k === 'delete' || k === 'backspace') { if (this.selection) this.confirmDemolish(this.selection); else this.tools.selectDemolish(); return; }
      for (const t of Object.keys(PLANTS) as PlantType[]) if (PLANTS[t].key === k) { this.tools.selectPlant(t); return; }
      for (const v of Object.keys(LINES) as Voltage[]) if (LINES[v].key.toLowerCase() === k) { this.tools.selectLine(v); return; }
    });
  }

  // ---------------------------------------------------------------- løkke
  private loop(t: number) {
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.inGame && !this.modalOpen && !this.game.state.ended) {
      this.acc += dt * SPEEDS[this.speed];
      let ticks = 0;
      while (this.acc >= 1 && ticks < 4) {
        this.acc -= 1;
        ticks++;
        this.game.tick();
        if (this.game.state.ended || this.speed === 0) { this.acc = 0; break; }
      }
      if (this.acc > 2) this.acc = 0;
      if (ticks) {
        this.flushBlackouts();
        this.world.setSeason(this.game.woy);
        if (this.game.state.week - this.autosaveWeek >= 26) { this.autosaveWeek = this.game.state.week; this.save(); }
      }
      this.game.stepN1(6);
    } else if (!this.inGame) {
      // sakte rotasjon bak menyen
      const c = this.world.controls;
      const off = this.world.camera.position.clone().sub(c.target);
      off.applyAxisAngle({ x: 0, y: 1, z: 0 } as any, dt * 0.03);
      this.world.camera.position.copy(c.target).add(off);
    }
    this.world.update(dt);
    if (this.inGame) {
      this.labels.update();
      this.hud.update();
      this.tutorial.update();
    }
    this.world.render();
    requestAnimationFrame((tt) => this.loop(tt));
  }
}

// ---------------------------------------------------------------- start
const loading = document.getElementById('loading')!;
setTimeout(() => {
  const app = new App();
  (window as any).statgrid = app;
  loading.classList.add('fade');
  setTimeout(() => loading.remove(), 700);
  app.modals.mainMenu();
}, 30);
