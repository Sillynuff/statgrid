import type { App } from '../main';
import { h, fmt, esc } from './dom';
import { CHAPTERS } from '../sim/campaign';
import { sfx } from '../audio';

export class Modals {
  app: App;
  root: HTMLElement;
  constructor(app: App) {
    this.app = app;
    this.root = document.getElementById('modal-root')!;
  }

  close() {
    this.root.innerHTML = '';
    this.app.modalOpen = false;
  }

  private open(content: HTMLElement, opts: { dismiss?: boolean } = {}) {
    this.root.innerHTML = '';
    const ov = h('div', { class: 'overlay' }, content);
    if (opts.dismiss) ov.addEventListener('click', (e) => { if (e.target === ov) this.close(); });
    this.root.append(ov);
    this.app.modalOpen = true;
    this.app.hud?.hideTip();
  }

  // ---------------------------------------------------------------- hovedmeny
  mainMenu() {
    const app = this.app;
    this.root.innerHTML = '';
    app.modalOpen = true;
    const hasSave = app.hasSave();
    const progress = app.loadProgress();
    const menu = h('div', { class: 'menu' },
      h('div', { class: 'logo' }, 'STATGRID'),
      h('div', { class: 'tag' }, 'Bygg kraftnettet som lyste opp Norge – fra 1900 til 2050.'),
      h('div', { class: 'mbtns' },
        hasSave ? h('button', { class: 'btn primary', onclick: () => { sfx.click(); app.continueGame(); } }, '▶  Fortsett') : null,
        h('button', { class: `btn ${hasSave ? '' : 'primary'}`, onclick: () => { sfx.click(); this.campaignMenu(progress); } }, '📜  Kampanje'),
        h('button', { class: 'btn', onclick: () => { sfx.click(); this.freeSetup(); } }, '🗺️  Fri modus'),
        h('button', { class: 'btn', onclick: () => { sfx.click(); this.help(); } }, '❓  Slik spiller du'),
      ),
      h('div', { class: 'foot' }, 'Et spill om kraftsystemet: produksjon, nett, N-1, magasiner og utenlandsforbindelser. Tallene er forenklet – prinsippene er ekte.'),
    );
    this.root.append(menu);
  }

  campaignMenu(progress: Record<number, number>) {
    const app = this.app;
    const list = h('div', { class: 'chapters' });
    CHAPTERS.forEach((c, i) => {
      const reached = i === 0 || progress[i - 1] !== undefined || app.hasChapterSnapshot(i);
      const stars = progress[i] ?? 0;
      list.append(h('div', { class: 'chapter-row' },
        h('div', { class: 'cn' }, `${i + 1}. ${c.title}`, h('small', {}, c.era)),
        h('div', { class: 'cs' }, progress[i] !== undefined ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''),
        h('button', { class: `btn ${i === 0 && !reached ? 'primary' : ''}`, disabled: !reached, onclick: () => { sfx.click(); i === 0 ? app.newCampaign() : app.loadChapterSnapshot(i); } }, reached ? 'Spill' : '🔒'),
      ));
    });
    this.open(h('div', { class: 'modal' },
      h('h1', {}, 'Kampanje'),
      h('p', {}, 'Fem kapitler gjennom norsk krafthistorie. Nettet du bygger følger med videre fra kapittel til kapittel. Opplåste kapitler kan spilles på nytt fra starten.'),
      list,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.mainMenu() }, 'Tilbake')),
    ));
  }

  freeSetup() {
    const app = this.app;
    const yearOpt = (y: number, label: string, checked = false) =>
      h('label', {}, h('input', { type: 'radio', name: 'fy', value: String(y), checked }), h('span', {}, label));
    const form = h('div', {},
      h('div', { class: 'subhead' }, 'Startår'),
      h('div', { class: 'opt' }, yearOpt(1900, '1900 – pionertid'), yearOpt(1950, '1950 – gjenreisning', true), yearOpt(1990, '1990 – kraftmarked'), yearOpt(2020, '2020 – grønt skifte')),
      h('div', { class: 'subhead' }, 'Budsjett'),
      h('div', { class: 'opt' }, h('label', {}, h('input', { type: 'radio', name: 'fb', value: 'normal', checked: true }), h('span', {}, '💰 Normalt')), h('label', {}, h('input', { type: 'radio', name: 'fb', value: 'unl' }), h('span', {}, '♾️ Ubegrenset (sandkasse)'))),
    );
    this.open(h('div', { class: 'modal' },
      h('h1', {}, 'Fri modus'),
      h('p', {}, 'Hele Norge er åpent. Byer og industri vokser, og nye teknologier kommer etter hvert. Bygg det beste kraftsystemet du kan.'),
      form,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => this.mainMenu() }, 'Tilbake'),
        h('button', { class: 'btn primary big', onclick: () => {
          const y = Number((form.querySelector('input[name=fy]:checked') as HTMLInputElement).value);
          const unl = (form.querySelector('input[name=fb]:checked') as HTMLInputElement).value === 'unl';
          sfx.click();
          app.newFree(y, unl);
        } }, 'Start ▶')),
    ));
  }

  // ---------------------------------------------------------------- kapittel
  chapterIntro(idx: number, onStart: () => void) {
    const c = CHAPTERS[idx];
    this.open(h('div', { class: 'modal' },
      h('div', { class: 'era' }, `Kapittel ${idx + 1} av ${CHAPTERS.length} · ${c.era}`),
      h('h1', {}, c.title),
      ...c.intro.map((p) => h('p', {}, p)),
      h('div', { class: 'subhead' }, 'Mål'),
      h('ul', {}, ...c.main.map((o) => h('li', {}, o.text))),
      h('div', { class: 'subhead' }, 'Stjernemål'),
      h('ul', {}, ...c.stars.map((o) => h('li', {}, `⭐ ${o.text}`))),
      h('div', { class: 'subhead' }, 'Nytt i denne perioden'),
      h('div', { class: 'chips' }, ...c.unlocks.map((u) => h('span', { class: 'chip' }, u))),
      h('div', { class: 'factbox' }, '💡 ', c.fact),
      idx > 0 ? h('p', { style: { fontSize: '13px', color: 'var(--muted)' } }, `Du får ${fmt(c.grant)} MNOK i statlig bevilgning for å komme i gang.`) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn primary big', onclick: () => { sfx.click(); this.close(); onStart(); } }, 'Til verks! ⚡')),
    ));
  }

  chapterEnd(idx: number, stars: number, onNext: () => void, onRetry: () => void) {
    const app = this.app, g = app.game;
    const c = CHAPTERS[idx];
    const st = g.state;
    const starEl = h('div', { class: 'stars' }, h('span', {}, '★'), h('span', {}, '★'), h('span', {}, '★'));
    const oc = g.objectiveCache;
    const last = idx === CHAPTERS.length - 1;
    this.open(h('div', { class: 'modal' },
      h('div', { class: 'era' }, `Kapittel ${idx + 1} · ${c.era}`),
      h('h1', {}, stars > 0 ? 'Kapittel fullført!' : 'Tiden er ute'),
      starEl,
      h('p', { style: { textAlign: 'center' } }, stars === 0 ? 'Du nådde ikke alle hovedmålene denne gangen. Prøv igjen – eller fortsett likevel.' : stars === 3 ? 'Perfekt! Et robust og effektivt kraftsystem. 🎉' : stars === 2 ? 'Godt jobbet! Klarer du alle stjernene?' : 'Hovedmålene er nådd. Stjernemålene gir ekstra utfordring.'),
      h('div', { class: 'summary' },
        h('div', {}, h('span', {}, 'Leveringssikkerhet'), h('b', {}, `${(g.reliability() * 100).toFixed(2).replace('.', ',')} %`)),
        h('div', {}, h('span', {}, 'Kasse'), h('b', {}, st.unlimited ? '∞' : `${fmt(st.money)} MNOK`)),
        h('div', {}, h('span', {}, 'Byer med strøm'), h('b', {}, `${g.cityNodes().filter((n) => g.isPowered(n)).length}`)),
        h('div', {}, h('span', {}, 'Nett bygd'), h('b', {}, `${fmt(st.lines.reduce((s, l) => s + l.tiles * 7, 0))} km`)),
      ),
      h('ul', {}, ...c.main.map((o, i) => h('li', {}, `${oc.main[i]?.done ? '✅' : '❌'} ${o.text}`)), ...c.stars.map((o, i) => h('li', {}, `${oc.stars[i]?.done ? '⭐' : '☆'} ${o.text} (${oc.stars[i]?.label ?? ''})`))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { sfx.click(); this.close(); onRetry(); } }, '↺ Prøv kapittelet igjen'),
        h('button', { class: 'btn primary big', onclick: () => { sfx.click(); this.close(); onNext(); } }, last ? 'Avslutt kampanjen 🎉' : stars > 0 ? 'Neste kapittel ▶' : 'Fortsett likevel ▶'),
      ),
    ));
    const spans = Array.from(starEl.children) as HTMLElement[];
    spans.forEach((s, i) => { if (i < stars) setTimeout(() => { s.classList.add('lit'); sfx.star(i); }, 500 + i * 450); });
    if (stars > 0) { sfx.fanfare(); this.confetti(); }
  }

  campaignDone() {
    const g = this.app.game;
    const total = Object.values(g.state.chapterResults).reduce((a, b) => a + b, 0);
    this.open(h('div', { class: 'modal' },
      h('h1', {}, 'Gratulerer!'),
      h('p', {}, `Du har bygget kraftsystemet fra de første lyspærene i 1900 til et elektrifisert Norge i 2050. Totalt ${total} av ${CHAPTERS.length * 3} stjerner.`),
      h('p', {}, 'Spillet fortsetter nå i fri modus – bygg videre så lenge du vil!'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary big', onclick: () => this.close() }, 'Fortsett ▶')),
    ));
    this.confetti();
  }

  // ---------------------------------------------------------------- annet
  pause() {
    const app = this.app;
    const prevSpeed = app.speed;
    app.setSpeed(0);
    this.open(h('div', { class: 'modal', style: { width: 'min(420px, 92vw)' } },
      h('h2', {}, '⏸ Pause'),
      h('div', { class: 'mbtns', style: { display: 'grid', gap: '8px' } },
        h('button', { class: 'btn primary', onclick: () => { this.close(); app.setSpeed(prevSpeed); } }, 'Fortsett'),
        h('button', { class: 'btn', onclick: () => { app.save(); app.hud.toast('💾', 'Spillet er lagret', '', 'good', 1800); this.close(); } }, '💾 Lagre'),
        h('button', { class: 'btn', onclick: () => this.help() }, '❓ Slik spiller du'),
        h('label', { class: 'btn', style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' } }, (() => { const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = app.autoPause; cb.addEventListener('change', () => app.setAutoPause(cb.checked)); return cb; })(), 'Pause og forklar ved viktige hendelser'),
        app.game.state.mode === 'campaign' ? h('button', { class: 'btn', onclick: () => { this.close(); app.loadChapterSnapshot(app.game.state.chapter); } }, '↺ Start kapittelet på nytt') : null,
        h('button', { class: 'btn', onclick: () => { app.save(); app.toMenu(); } }, '🏠 Lagre og gå til hovedmenyen'),
      ),
    ), { dismiss: true });
  }

  confirm(title: string, text: string, ok: string, onOk: () => void) {
    this.open(h('div', { class: 'modal', style: { width: 'min(440px, 92vw)' } },
      h('h2', {}, title), h('p', {}, text),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.close() }, 'Avbryt'), h('button', { class: 'btn danger', onclick: () => { this.close(); onOk(); } }, ok)),
    ), { dismiss: true });
  }

  help() {
    const inGame = !!this.app.game && !document.querySelector('.menu');
    const sec = (t: string, ...ps: string[]) => h('div', {}, h('h4', {}, t), ...ps.map((p) => h('p', { html: p })));
    this.open(h('div', { class: 'modal', style: { width: 'min(860px, 94vw)' } },
      h('h1', {}, 'Slik spiller du'),
      h('div', { class: 'help-grid' },
        sec('🎯 Målet', 'Bygg kraftverk og linjer slik at byer og industri får strøm – hele året, også når det stormer. Følg målene i panelet til høyre.'),
        sec('🖱️ Kontroller', 'Venstre-dra: flytt kartet · Scroll: zoom · Høyre-dra: roter<br><span class="kbd">WASD</span> flytt · <span class="kbd">Mellomrom</span> pause · <span class="kbd">1</span>–<span class="kbd">6</span> kraftverk · <span class="kbd">Z</span>–<span class="kbd">N</span> linjer · <span class="kbd">L</span> belastning · <span class="kbd">F</span> N-1 · <span class="kbd">Esc</span> avbryt'),
        sec('⚡ Balanse', 'Produksjon og forbruk må være i balanse hele tiden. Mangler det kraft eller kapasitet, blir det strømbrudd – og omdømmet faller.'),
        sec('🌊 Vannkraft', '<b>Elvekraft</b> følger vannføringen: mye under snøsmeltingen, lite om vinteren. <b>Magasinkraft</b> lagrer vårflommen og produserer når det trengs. Sjekk magasinfyllingen før vinteren!'),
        sec('🔌 Spenning', 'Høyere spenning = mer kapasitet, lengre rekkevidde og mindre tap – men dyrere. 22 kV er lokalt, 420 kV binder landet sammen. HVDC-kabler brukes over havet.'),
        sec('🛡️ N-1', 'Et robust nett tåler at én linje faller ut uten at noen mister strømmen. Bygg ringer og doble forbindelser til viktige byer. Bruk N-1-visningen for å finne svake punkter.'),
        sec('🌍 Utenlandsforbindelser', 'Kabler til nabolandene gir import i tørre år og eksportinntekter i våte år. Kraften flyter dit prisen er høyest – så lenge det er ledig kapasitet.'),
        sec('⏳ Byggetid', 'Linjer og kraftverk tar tid å bygge. Forbruket vokser hvert år – planlegg i forkant! Du kan bygge mens spillet står på pause.'),
      ),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { inGame ? this.close() : this.mainMenu(); } }, 'Skjønner! 👍')),
    ), { dismiss: true });
  }

  confetti() {
    const colors = ['#ffd23f', '#3de0ff', '#5ee06a', '#ff6b6b', '#c38bff', '#ffffff'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = `${Math.random() * 100}vw`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${2 + Math.random() * 2.5}s`;
      c.style.animationDelay = `${Math.random() * 0.8}s`;
      document.body.append(c);
      setTimeout(() => c.remove(), 6000);
    }
  }

  escText(s: string) { return esc(s); }
}
