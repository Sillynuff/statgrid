import type { App } from '../main';
import { h } from './dom';
import { sfx } from '../audio';

interface Step {
  text: string | ((app: App) => string);
  target?: () => HTMLElement | undefined | null;
  done?: (app: App) => boolean;
  button?: string;
  onEnter?: (app: App) => void;
}

export class Tutorial {
  app: App;
  idx = -1;
  el: HTMLElement | null = null;
  private steps: Step[];
  private highlighted: HTMLElement | null = null;

  constructor(app: App) {
    this.app = app;
    const osloPowered = (a: App) => !!a.game.nodeByRef('oslo')?.everPowered;
    this.steps = [
      {
        text: '<b>Velkommen, kraftbygger!</b><br>Kristiania (Oslo) har ikke strøm ennå. La oss gjøre noe med det.<br><br>Dra med venstre musknapp for å flytte kartet, scroll for å zoome og dra med høyre musknapp for å rotere.',
        button: 'Sett i gang!',
        onEnter: (a) => a.world.focusLL(10.6, 59.95, 34),
      },
      {
        text: 'Først trenger vi et kraftverk. Velg <b>Elvekraftverk</b> i verktøylinja (eller trykk <span class="kbd">1</span>).',
        target: () => this.app.hud.toolButton('plant:river'),
        done: (a) => a.tools.mode.kind === 'plant' && a.tools.mode.t === 'river',
      },
      {
        text: 'Kartet viser nå <b>vannkraftpotensialet</b>. Grønne og turkise felt har mye fall og vann – der gir kraftverket mest.<br><br>De <b>lysende ringene</b> markerer gode fossefall som en 22 kV-linje når fram til fra Kristiania. Klikk på en av dem for å bygge.',
        done: (a) => a.game.state.nodes.some((n) => n.ptype === 'river'),
      },
      {
        text: 'Kraftverket står der, men strømmen må fraktes. Velg <b>22 kV-linje</b> (<span class="kbd">Z</span>), klikk på kraftverket og deretter på <b>Kristiania</b>.',
        target: () => this.app.hud.toolButton('line:v22'),
        done: (a) => {
          const o = a.game.nodeByRef('oslo');
          return !!o && a.game.state.lines.some((l) => l.a === o.id || l.b === o.id);
        },
      },
      {
        text: 'Det tar tid å bygge. Start klokka med <b>▶</b> (eller <span class="kbd">mellomrom</span>). Du kan alltid pause for å planlegge i ro og mak.',
        target: () => document.querySelector('.speed') as HTMLElement,
        done: (a) => a.speed > 0 || osloPowered(a),
      },
      {
        text: (a) => {
          const g = a.game, o = g.nodeByRef('oslo');
          const need = o ? g.consumerDemand(o, 3, true) : 4;
          const plant = a.game.state.nodes.find((n) => n.ptype === 'river');
          const per = g.riverWinterMW(plant?.quality ?? 0.6);
          const nf = (x: number) => x.toFixed(1).replace('.', ',');
          return `Mens anlegget bygges bør du bygge <b>kraftverk nr. 2</b> – gjerne ved den andre ringen.<br><br>`
            + `Kristiania trenger rundt <b>${nf(need)} MW</b> midt på vinteren, men elvene fryser og hvert elvekraftverk gir da bare rundt <b>${nf(per)} MW</b>. `
            + `Du trenger altså minst <b>${Math.max(2, Math.ceil(need / per))} kraftverk</b> før frosten kommer i november.`;
        },
        done: osloPowered,
      },
      {
        text: '💡 <b>Lyset er tent i Kristiania!</b><br><br>Følg målene i panelet til høyre. Klikk på byer, linjer og kraftverk for detaljer. Hold øye med <b>magasinfylling</b> og <b>leveringssikkerhet</b> i toppen.<br><br>Lykke til!',
        button: 'Tusen takk!',
        onEnter: () => sfx.objective(),
      },
    ];
  }

  start() {
    if (this.app.game.state.flags.tutorialDone) return;
    this.go(0);
  }

  private go(i: number) {
    this.idx = i;
    this.render();
    this.steps[i]?.onEnter?.(this.app);
  }

  skip() {
    this.app.game.state.flags.tutorialDone = true;
    this.clear();
    this.idx = -1;
  }

  private clear() {
    this.el?.remove();
    this.el = null;
    this.highlighted?.classList.remove('coach-target');
    this.highlighted = null;
  }

  private render() {
    this.clear();
    const s = this.steps[this.idx];
    if (!s) { this.skip(); return; }
    const btns = h('div', { class: 'btns' },
      this.idx < this.steps.length - 1 ? h('button', { class: 'btn', onclick: () => this.skip() }, 'Hopp over') : null,
      s.button ? h('button', { class: 'btn primary', onclick: () => { sfx.click(); this.next(); } }, s.button) : null,
    );
    this.el = h('div', { id: 'coach' }, h('div', { class: 'step' }, `Opplæring ${this.idx + 1}/${this.steps.length}`), h('div', { html: typeof s.text === 'function' ? s.text(this.app) : s.text }), btns);
    document.getElementById('hud')!.append(this.el);
    const tgt = s.target?.();
    if (tgt) { tgt.classList.add('coach-target'); this.highlighted = tgt; }
    this.position();
  }

  private position() {
    if (!this.el) return;
    const s = this.steps[this.idx];
    const tgt = s?.target?.();
    if (tgt) {
      const r = tgt.getBoundingClientRect();
      if (r.left < 120) { this.el.style.left = `${r.right + 24}px`; this.el.style.top = `${Math.max(80, r.top - 10)}px`; }
      else { this.el.style.left = `${Math.max(20, r.left - 40)}px`; this.el.style.top = `${r.bottom + 18}px`; }
      this.el.style.bottom = '';
    } else {
      this.el.style.left = '120px';
      this.el.style.top = '';
      this.el.style.bottom = '70px';
    }
  }

  next() {
    if (this.idx >= this.steps.length - 1) { this.skip(); return; }
    this.go(this.idx + 1);
  }

  update() {
    if (this.idx < 0) return;
    const s = this.steps[this.idx];
    if (s?.done && s.done(this.app)) { sfx.built(); this.next(); }
    else this.position();
  }
}
