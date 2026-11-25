# ⚡ Statgrid – bygg Norges kraftnett

Et 3D voxel-strategispill om å bygge ut kraftsystemet i Norge, fra de første lyspærene i Kristiania i 1900 til et elektrifisert Norge i 2050.

## Kom i gang

```bash
npm install
npm run dev        # åpner på http://localhost:5173
npm run build      # produksjonsbygg i dist/ (statiske filer, kan legges på hvilken som helst webserver)
```

## Spillet

**Kampanje (5 kapitler)**, der nettet du bygger følger med videre:

| Kapittel | Periode | Tema |
|---|---|---|
| 1. Lyset kommer | 1900–1920 | Første kraftverk og 22 kV-linjer på Østlandet. Rjukan-kontrakten. Guidet opplæring. |
| 2. Industrieventyret | 1920–1950 | Smelteverk på Vestlandet, høyere spenning over lengre avstander. |
| 3. Samkjøringen | 1950–1980 | Ett nasjonalt nett fra Oslo til Tromsø, 300/420 kV, Sverige, stormer og N-1. |
| 4. Kraftmarkedet | 1980–2015 | HVDC-kabler, eksport og import, tørrår, gass og vind, kraft til sokkelen. |
| 5. Det grønne skiftet | 2015–2050 | Datasentre, batterifabrikker, havvind, energikrise og fornybarmål. |

Hvert kapittel har hovedmål og to stjernemål (1–3 ★). Du kan alltid prøve et kapittel på nytt eller fortsette likevel.

**Fri modus** lar deg velge startår (1900, 1950, 1990 eller 2020) og vanlig eller ubegrenset budsjett.

## Kraftsystemfaget i spillet

- **Balanse:** Produksjon må dekke forbruk hver uke. Underskudd gir strømbrudd, avbruddskostnad (KILE) og lavere omdømme.
- **Økonomisk lastfordeling:** En min-cost-flow-løser velger billigste produksjon innenfor linjekapasitetene, slik at flaskehalser oppstår naturlig.
- **Vannkraft:** Elvekraft følger vannføringen (vårflom, lite om vinteren). Magasinkraft lagrer vann og har en *vannverdi* som stiger når magasinet tømmes.
- **Spenningsnivåer:** 22 / 66 / 132 / 300 / 420 kV og HVDC. Høyere spenning gir mer kapasitet, lengre rekkevidde og lavere tap. Lange sjøstrekninger krever HVDC.
- **N-1:** Analysen sjekker om kundene fortsatt får strøm hvis en hvilken som helst linje faller ut (dimensjonerende vinterlast). Stormer slår ut linjer, og et masket nett tåler det.
- **Utenlandsforbindelser:** Sverige, Finland, Danmark, Nederland, Tyskland og Storbritannia har egne priser. Kraften flyter dit prisen er høyest.
- **Byggetid og vekst:** Forbruket vokser hvert år, og linjer og kraftverk tar tid å bygge. Planlegg i forkant.

Tallene er forenklet for spillbarhetens skyld, men proporsjonene og prinsippene følger virkeligheten.

## Kontroller

| | |
|---|---|
| Venstre-dra / WASD | Flytt kartet |
| Scroll | Zoom |
| Høyre-dra | Roter |
| `1`–`6` | Kraftverk (elv, magasin, vind, havvind, sol, gass) |
| `Z X C V B N` | Linjer (22, 66, 132, 300, 420 kV, HVDC) |
| `Mellomrom` | Pause/start · `+`/`-` endrer fart |
| `L` / `F` | Belastnings- og N-1-visning |
| `Esc` | Avbryt / meny · `H` hjelp |

Du kan bygge mens spillet står på pause. Når du trekker en linje og klikker på tomt land, settes det automatisk inn en transformatorstasjon, og linja fortsetter derfra.

## Kodestruktur

```
src/
  data/geo.ts          Kystlinje, grenser, fjorder, byer, industri, utenlandsmarkeder, historikk
  world/               Projeksjon, støy og terrenggenerator (høyder, elver, ressurskart)
  sim/
    config.ts          Teknologikatalog (kraftverk, spenningsnivåer, kurver for forbruk/tilsig)
    flow.ts            Min-cost-flow-løser (markedsklarering med nettbegrensninger)
    game.ts            Spilltilstand, bygging, ukessimulering, økonomi, hendelser, N-1
    campaign.ts        Kapitler og mål
  render/              Three.js: voxel-terreng, modeller, linjer med master og energipulser
  ui/                  HUD, verktøy, etiketter, menyer og opplæring
  audio.ts             Syntetiserte lydeffekter (WebAudio)
scripts/               Testverktøy: ASCII-kart, headless bot gjennom hele kampanjen, skjermbilder (Edge)
```

Testverktøy (krever at `npm run dev` kjører for skjermbildeskriptene):

```bash
npx tsx scripts/ascii-map.ts 2     # kartet som ASCII
npx tsx scripts/bot.ts unl         # bot spiller hele kampanjen (ytelse og kjørefeil)
npx tsx scripts/play.ts <mappe>    # spiller med mus/tastatur i Edge og tar skjermbilder
```

Fremdrift lagres automatisk i nettleseren (localStorage).
