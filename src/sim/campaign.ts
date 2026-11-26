import { CITIES, INDUSTRIES } from '../data/geo';
import { LINES } from './config';
import type { Game } from './game';

/** note: kort, synlig tips under målet (f.eks. hva som hindrer en industrikunde). */
export interface ObjectiveStatus { done: boolean; progress: number; label: string; note?: string }
export interface Objective {
  id: string;
  text: string;
  hint?: string;
  sticky?: boolean; // forblir oppnådd når det først er nådd
  finalOnly?: boolean; // vurderes ved kapittelslutt
  eval: (g: Game) => ObjectiveStatus;
}

export interface Chapter {
  title: string;
  era: string;
  startYear: number;
  startWoy: number;
  endYear: number;
  grant: number;
  focus: [number, number, number]; // lon, lat, zoom-avstand
  intro: string[];
  fact: string;
  unlocks: string[];
  main: Objective[];
  stars: Objective[];
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const fmtMW = (x: number) => `${x < 10 ? x.toFixed(1).replace('.', ',') : Math.round(x)} MW`;

function citiesPowered(n: number, chapterMax?: number): Objective {
  return {
    id: `cities${n}`, text: `Gi strøm til ${n} byer`,
    hint: 'Byer får strøm når de er koblet til et kraftverk med nok produksjon.',
    eval: (g) => {
      const c = g.cityNodes().filter((x) => (chapterMax === undefined || g.cityDef(x).chapter <= chapterMax) && g.isPowered(x)).length;
      return { done: c >= n, progress: Math.min(1, c / n), label: `${c}/${n}` };
    },
  };
}

function cityPowered(id: string): Objective {
  const def = CITIES.find((c) => c.id === id)!;
  return {
    id: `city-${id}`, text: `Elektrifiser ${def.oldName ? `${def.oldName[0]} (${def.name})` : def.name}`, sticky: true,
    eval: (g) => {
      const n = g.nodeByRef(id);
      const ok = !!n && g.isPowered(n);
      return { done: ok, progress: ok ? 1 : 0, label: ok ? '✓' : '' };
    },
  };
}

function industries(ids: string[], n: number): Objective {
  const names = ids.map((id) => INDUSTRIES.find((x) => x.id === id)!.name);
  return {
    id: `ind-${ids.join('-')}-${n}`,
    text: n === ids.length ? `Forsyn industrien: ${names.join(', ')}` : `Forsyn ${n} av ${ids.length} industrikunder (${names.join(', ')})`,
    hint: 'Industrikunder dukker opp på kartet underveis. Lever minst 90 % av behovet i én uke før fristen for å få bonus.',
    eval: (g) => {
      const c = ids.filter((id) => { const nd = g.nodeByRef(id); return !!nd && (nd.questDone || g.isPowered(nd)); }).length;
      if (c >= n) return { done: true, progress: 1, label: `${c}/${n}` };
      // Tips for den første aktive kunden som ennå ikke er i mål.
      let note: string | undefined;
      for (const id of ids) {
        const nd = g.nodeByRef(id);
        if (!nd || !g.isActive(nd) || nd.questDone || g.isPowered(nd)) continue;
        const name = g.indDef(nd).name;
        const st = g.industryStatus(nd);
        const ln = LINES[st.bestLine];
        const perLine = `Hver ${ln.short}-linje tar ${fmtMW(g.lineCap(st.bestLine))}.`;
        if (st.limit === 'unconnected')
          note = `${name} trenger ${fmtMW(st.need)} i én uke. ${perLine} Byene får strøm før industrien.`;
        else if (st.limit === 'lines')
          note = `${name} får ${fmtMW(st.got)} av ${fmtMW(st.need)}. Linjene inn tar bare ${fmtMW(st.lineCap)}, så bygg flere linjer inn. ${perLine}`;
        else
          note = `${name} får ${fmtMW(st.got)} av ${fmtMW(st.need)}. ${g.sharesGridWithCity(nd) ? 'Byene i nettet får strøm først, så det trengs mer kraft.' : 'Kraftverkene i nettet gir ikke nok.'} Elvene gir mest under vårflommen (mai–juni), og et magasin kan spare vann til når du trenger det.`;
        break;
      }
      return { done: false, progress: Math.min(1, c / n), label: `${c}/${n}`, note };
    },
  };
}

function allCities(): Objective {
  return {
    id: 'allcities', text: 'Gi strøm til alle aktive byer',
    eval: (g) => {
      const all = g.cityNodes();
      const c = all.filter((x) => g.isPowered(x)).length;
      return { done: c >= all.length, progress: c / Math.max(1, all.length), label: `${c}/${all.length}` };
    },
  };
}

function sameGrid(ids: string[]): Objective {
  const names = ids.map((id) => CITIES.find((c) => c.id === id)!.name);
  return {
    id: `grid-${ids.join('-')}`, text: `Ett nasjonalt nett: koble ${names.join(', ')} sammen`, sticky: true,
    hint: 'Byene må henge sammen gjennom linjer i drift – samme sammenhengende nett.',
    eval: (g) => {
      const comps = g.components();
      const roots = ids.map((id) => { const n = g.nodeByRef(id); return n ? comps.get(n.id) : undefined; });
      const counts = new Map<number, number>();
      for (const r of roots) if (r !== undefined) counts.set(r, (counts.get(r) ?? 0) + 1);
      const best = Math.max(0, ...counts.values());
      return { done: best === ids.length, progress: best / ids.length, label: `${best}/${ids.length}` };
    },
  };
}

function reliability(p: number): Objective {
  return {
    id: `rel${p}`, text: `Leveringssikkerhet på minst ${pct(p)} i kapittelet`, finalOnly: true,
    hint: 'Andel av forbruket hos tilkoblede kunder som faktisk ble levert. Unngå mørklegging!',
    eval: (g) => {
      const r = g.reliability();
      return { done: r >= p, progress: Math.min(1, r / p), label: pct(r) };
    },
  };
}

function n1(ids: string[], label: string): Objective {
  return {
    id: `n1-${label}`, text: `N-1-sikkerhet for ${label}`,
    hint: 'En by er N-1-sikker når den fortsatt får strøm selv om hvilken som helst linje faller ut. Bygg ringer, ikke greiner!',
    eval: (g) => {
      const c = ids.filter((id) => g.nodeByRef(id)?.n1 === 'ok').length;
      return { done: c === ids.length, progress: c / ids.length, label: `${c}/${ids.length}` };
    },
  };
}

function exportRevenue(x: number): Objective {
  return {
    id: `exp${x}`, text: `Tjen ${x.toLocaleString('nb-NO')} MNOK på krafteksport`, sticky: true,
    eval: (g) => {
      const v = g.state.stats.exportRev;
      return { done: v >= x, progress: Math.min(1, v / x), label: `${Math.round(v).toLocaleString('nb-NO')}` };
    },
  };
}

function interconnectors(n: number): Objective {
  return {
    id: `ic${n}`, text: `Bygg forbindelser til ${n} ulike naboland`, sticky: true,
    hint: 'Utenlandsforbindelser gir mulighet til å eksportere i våte år og importere i tørre år.',
    eval: (g) => {
      const c = g.connectedCountries();
      return { done: c >= n, progress: Math.min(1, c / n), label: `${c}/${n}` };
    },
  };
}

function renewable(p: number): Objective {
  return {
    id: `ren${p}`, text: `Minst ${Math.round(p * 100)} % fornybar produksjon`, finalOnly: true,
    hint: 'Målt som glidende snitt de siste årene. Gasskraft trekker ned.',
    eval: (g) => {
      const r = g.state.stats.renewEMA;
      return { done: r >= p, progress: Math.min(1, r / p), label: `${Math.round(r * 100)} %` };
    },
  };
}

function offshore(mw: number): Objective {
  return {
    id: `off${mw}`, text: `Bygg ${mw.toLocaleString('nb-NO')} MW havvind`, sticky: true,
    eval: (g) => {
      const c = g.state.nodes.filter((n) => n.ptype === 'offshore' && n.progress >= 1).reduce((s, n) => s + (n.cap ?? 0), 0);
      return { done: c >= mw, progress: Math.min(1, c / mw), label: `${Math.round(c)} MW` };
    },
  };
}

const bigCities = CITIES.filter((c) => c.pop[2] >= 50).map((c) => c.id);

export const CHAPTERS: Chapter[] = [
  {
    title: 'Lyset kommer', era: '1900–1920', startYear: 1900, startWoy: 18, endYear: 1920, grant: 80,
    focus: [10.2, 59.75, 40],
    intro: [
      'Det er våren 1900. Gatene i Kristiania lyses fortsatt opp av gass, og de fleste nordmenn har aldri sett en lyspære.',
      'Fossene er Norges "hvite kull". Du har fått ansvaret for å bygge de første kraftverkene og linjene på Østlandet.',
    ],
    fact: 'Den første offentlige elektriske gatebelysningen i Norge ble tent i Hammerfest i 1891.',
    unlocks: ['Elvekraftverk', '22 kV-linjer', 'Magasinkraftverk (1905)', '66 kV-linjer (1912)'],
    main: [cityPowered('oslo'), citiesPowered(5, 0), industries(['rjukan'], 1)],
    stars: [reliability(0.97), citiesPowered(8, 0)],
  },
  {
    title: 'Industrieventyret', era: '1920–1950', startYear: 1920, startWoy: 0, endYear: 1950, grant: 250,
    focus: [7.6, 60.6, 85],
    intro: [
      'Vannkraften har gjort Norge til et industriland. Smelteverk og fabrikker bygges der fossene er.',
      'Nå skal også Vestlandet, Sørlandet og Trøndelag få strøm. Avstandene er store – du trenger høyere spenning.',
    ],
    fact: 'Høyere spenning gir lavere strøm for samme effekt. Tapene i linja går ned med kvadratet av strømmen.',
    unlocks: ['132 kV-linjer (1930)', 'Større kraftverk (1925)'],
    main: [citiesPowered(16), cityPowered('bergen'), cityPowered('trondheim'), industries(['odda', 'sauda', 'ardal'], 2)],
    stars: [reliability(0.98), industries(['odda', 'sauda', 'ardal'], 3)],
  },
  {
    title: 'Samkjøringen', era: '1950–1980', startYear: 1950, startWoy: 0, endYear: 1980, grant: 1500,
    focus: [14.5, 65.0, 190],
    intro: [
      'Etter krigen skal hele landet ha strøm – fra Lindesnes til Kirkenes.',
      'Regionale nett skal bindes sammen til ett nasjonalt nett. Da kan overskudd ett sted dekke underskudd et annet. Og stormene kommer…',
    ],
    fact: 'N-1-kriteriet: nettet skal tåle at en hvilken som helst komponent faller ut uten at kunder mister strømmen.',
    unlocks: ['300 kV (1958)', '420 kV (1972)', 'Forbindelser til Sverige (1960)', 'Stormer og linjeutfall'],
    main: [sameGrid(['oslo', 'bergen', 'trondheim', 'bodo', 'tromso']), allCities(), industries(['sunndal', 'ranajern', 'mosjoenal', 'husnes', 'karmoy'], 3)],
    stars: [reliability(0.99), n1(['oslo', 'bergen', 'trondheim', 'stavanger', 'kristiansand'], 'de fem største byene')],
  },
  {
    title: 'Kraftmarkedet', era: '1980–2015', startYear: 1980, startWoy: 0, endYear: 2015, grant: 3000,
    focus: [8.5, 59.0, 120],
    intro: [
      'Kraftmarkedet åpnes. Strømmen flyter dit prisen er høyest – også ut av landet.',
      'Med kabler til kontinentet kan du selge vannkraft i våte år og importere i tørre. Men pass på magasinene!',
    ],
    fact: 'Skagerrak-kablene til Danmark (fra 1977) var Norges første HVDC-forbindelser.',
    unlocks: ['HVDC-kabler', 'Danmark (1977)', 'Finland (1985)', 'Gasskraft (1995)', 'Vindkraft (1998)', 'Nederland (2008)'],
    main: [interconnectors(2), exportRevenue(3000), industries(['mongstad', 'trolla', 'melkoya'], 2)],
    stars: [reliability(0.995), n1(bigCities, 'alle byer over 50 000 innbyggere')],
  },
  {
    title: 'Det grønne skiftet', era: '2015–2050', startYear: 2015, startWoy: 0, endYear: 2050, grant: 6000,
    focus: [12.0, 63.5, 200],
    intro: [
      'Bilene, industrien og sokkelen skal elektrifiseres. Datasentre og batterifabrikker står i kø for nettilknytning.',
      'Forbruket øker raskere enn på flere tiår. Klarer du å bygge nok fornybar kraft og nett i tide?',
    ],
    fact: 'Kø for nettilknytning er en av de største utfordringene i det grønne skiftet: nettet tar ofte lengre tid å bygge enn fabrikken.',
    unlocks: ['Solkraft (2012)', 'Tyskland (2020)', 'Storbritannia (2021)', 'Havvind (2022)'],
    main: [industries(['sverdrup', 'datakrs', 'battery', 'hydrogen', 'melkoya2', 'datamid'], 4), allCities(), renewable(0.98)],
    stars: [reliability(0.997), offshore(2000)],
  },
];
