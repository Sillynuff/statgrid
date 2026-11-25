// Stilisert geografi for Norge. Koordinater er [lengdegrad, breddegrad].
export type LL = [number, number];

// Riksgrensen fra Svinesund til Grense Jakobselv (brukes både av Norge- og utlandspolygonet)
export const LAND_BORDER: LL[] = [
  [11.25, 59.1], [11.5, 59.4], [11.8, 59.8], [12.4, 60.1], [12.6, 60.5], [12.8, 61.0],
  [12.55, 61.55], [12.15, 61.95], [12.2, 62.6], [12.1, 63.3], [12.7, 64.0], [13.6, 64.6],
  [14.2, 65.1], [14.5, 65.6], [15.0, 66.1], [15.5, 66.4], [16.4, 67.0], [16.6, 67.5],
  [17.9, 67.95], [18.1, 68.45], [19.0, 68.5], [20.0, 68.4], [20.55, 69.06], [21.3, 69.3],
  [22.4, 68.72], [23.6, 68.7], [24.6, 68.65], [25.4, 69.1], [25.8, 69.45], [26.4, 69.85],
  [27.0, 69.92], [27.9, 70.08], [28.6, 69.82], [29.3, 69.45], [28.93, 69.05], [29.6, 69.2],
  [30.2, 69.45], [30.82, 69.79],
];

// Kystlinjen fra Grense Jakobselv rundt Nordkapp, ned vestkysten og til Svinesund
const COAST: LL[] = [
  [30.82, 69.79], [30.05, 69.73], [30.5, 70.0], [31.1, 70.37], [30.0, 70.42], [29.0, 70.6],
  [28.4, 70.95], [27.5, 71.08], [26.5, 70.98], [25.78, 71.17], [24.6, 70.95], [23.68, 70.68],
  [22.6, 70.45], [21.5, 70.28], [20.6, 70.1], [19.8, 69.92], [18.95, 69.7], [18.3, 69.45],
  [17.6, 69.12], [17.0, 68.85], [16.4, 68.55], [15.9, 68.2], [15.3, 67.8], [14.4, 67.28],
  [13.6, 66.95], [13.1, 66.6], [12.75, 66.15], [12.35, 65.85], [12.15, 65.45], [11.75, 65.15],
  [11.2, 64.85], [10.6, 64.55], [10.15, 64.2], [9.7, 63.85], [9.1, 63.72], [8.4, 63.45],
  [7.7, 63.13], [7.0, 62.92], [6.4, 62.7], [5.9, 62.42], [5.4, 62.2], [5.05, 61.95],
  [4.95, 61.6], [4.85, 61.1], [4.75, 60.8], [4.95, 60.45], [5.05, 60.15], [5.15, 59.8],
  [5.2, 59.42], [5.3, 59.15], [5.55, 58.92], [5.55, 58.75], [5.8, 58.48], [6.2, 58.33],
  [6.7, 58.12], [7.05, 57.98], [7.5, 58.02], [8.0, 58.12], [8.6, 58.32], [9.0, 58.55],
  [9.45, 58.82], [9.75, 58.98], [10.1, 59.0], [10.45, 59.05], [10.5, 59.3], [10.4, 59.55],
  [10.55, 59.85], [10.72, 59.88], [10.62, 59.62], [10.68, 59.35], [10.85, 59.15], [11.05, 59.1],
  [11.25, 59.1],
];

export const NORWAY_POLY: LL[] = [...LAND_BORDER.slice(0, -1), ...COAST];

export const ISLANDS: LL[][] = [
  // Lofoten og Vesterålen (med Hinnøya)
  [[12.95, 67.85], [13.6, 68.08], [14.4, 68.22], [15.1, 68.4], [15.7, 68.55], [16.2, 68.5],
   [16.75, 68.6], [16.6, 68.95], [16.0, 69.2], [15.3, 69.05], [14.7, 68.8], [14.1, 68.5],
   [13.4, 68.25]],
  // Senja
  [[17.1, 69.0], [17.8, 69.22], [18.2, 69.45], [17.7, 69.6], [17.15, 69.45], [16.85, 69.2]],
  // Kvaløya / Ringvassøya
  [[18.45, 69.62], [18.9, 69.78], [19.3, 70.05], [18.8, 70.12], [18.35, 69.85]],
  // Sørøya
  [[22.0, 70.45], [22.6, 70.48], [23.1, 70.62], [22.6, 70.7], [22.0, 70.6]],
  // Hitra og Frøya
  [[8.2, 63.45], [9.1, 63.55], [9.0, 63.68], [8.4, 63.72], [7.95, 63.62]],
  // Karmøy
  [[5.1, 59.15], [5.28, 59.2], [5.32, 59.42], [5.15, 59.38]],
];

// Alt land øst for riksgrensen (Sverige, Finland, Russland) innenfor kartet
export const FOREIGN_POLY: LL[] = [
  ...LAND_BORDER,
  [31.6, 69.86], [32.6, 69.8], [32.6, 57.0], [11.85, 57.0], [11.6, 57.8], [11.2, 58.35],
];

// Østersjøen og Bottenviken (trekkes fra utlandspolygonet)
export const BALTIC_POLY: LL[] = [
  [16.6, 57.0], [16.6, 57.8], [16.7, 58.6], [17.8, 58.9], [18.6, 59.4], [18.9, 59.9],
  [17.6, 60.5], [17.2, 60.7], [17.4, 61.7], [17.6, 62.6], [19.0, 63.5], [20.6, 63.9],
  [21.5, 64.5], [21.3, 65.3], [22.3, 65.8], [24.0, 65.85], [25.3, 65.3], [25.2, 64.9],
  [24.4, 64.6], [23.0, 63.8], [21.4, 63.2], [21.4, 62.4], [21.5, 61.5], [21.4, 60.7],
  [22.0, 60.3], [23.5, 59.9], [25.0, 60.2], [27.0, 60.5], [28.5, 60.5], [30.0, 59.9],
  [32.6, 59.9], [32.6, 57.0],
];

// Kvitsjøen-bukta på Kola er utenfor kartet. Fjorder: polylinjer som graves ut som sjø.
export const FJORDS: { pts: LL[]; w: number }[] = [
  { pts: [[10.55, 59.05], [10.58, 59.4], [10.62, 59.65], [10.72, 59.88]], w: 0.9 }, // Oslofjorden
  { pts: [[10.5, 59.55], [10.3, 59.7], [10.2, 59.73]], w: 0.6 }, // Drammensfjorden
  { pts: [[4.8, 61.07], [5.4, 61.08], [6.0, 61.12], [6.6, 61.15], [7.1, 61.2], [7.5, 61.4]], w: 0.7 }, // Sognefjorden
  { pts: [[6.6, 61.15], [6.9, 61.0], [7.15, 60.85]], w: 0.5 }, // Aurlandsfjorden
  { pts: [[5.3, 59.75], [5.8, 59.95], [6.2, 60.15], [6.55, 60.3], [6.95, 60.45]], w: 0.7 }, // Hardangerfjorden
  { pts: [[6.55, 60.3], [6.55, 60.07]], w: 0.5 }, // Sørfjorden (Odda)
  { pts: [[5.5, 59.05], [5.9, 59.1], [6.2, 59.0], [6.6, 59.05]], w: 0.6 }, // Boknafjorden/Lysefjorden
  { pts: [[5.6, 59.25], [6.0, 59.45], [6.3, 59.62]], w: 0.5 }, // Saudafjorden
  { pts: [[5.0, 61.9], [5.6, 61.85], [6.2, 61.85], [6.7, 61.85]], w: 0.6 }, // Nordfjorden
  { pts: [[5.9, 62.45], [6.5, 62.35], [6.9, 62.2], [7.2, 62.1]], w: 0.6 }, // Storfjorden
  { pts: [[6.6, 62.75], [7.1, 62.7], [7.7, 62.57]], w: 0.6 }, // Romsdalsfjorden
  { pts: [[7.5, 63.0], [8.0, 62.85], [8.55, 62.68]], w: 0.5 }, // Sunndalsfjorden
  { pts: [[9.6, 63.72], [10.0, 63.55], [10.4, 63.47], [10.8, 63.6], [11.2, 63.8], [11.5, 64.0]], w: 0.8 }, // Trondheimsfjorden
  { pts: [[12.6, 66.12], [13.3, 66.22], [14.1, 66.33]], w: 0.5 }, // Ranfjorden
  { pts: [[12.9, 65.75], [13.19, 65.84]], w: 0.5 }, // Vefsnfjorden
  { pts: [[14.0, 67.25], [14.7, 67.22], [15.3, 67.25]], w: 0.5 }, // Saltfjorden
  { pts: [[15.8, 68.25], [16.6, 68.38], [17.4, 68.44]], w: 0.6 }, // Ofotfjorden
  { pts: [[19.9, 69.95], [20.2, 69.75], [20.3, 69.45]], w: 0.5 }, // Lyngenfjorden
  { pts: [[22.6, 70.35], [23.0, 70.15], [23.3, 69.97]], w: 0.6 }, // Altafjorden
  { pts: [[25.7, 71.02], [25.4, 70.6], [25.1, 70.1]], w: 0.8 }, // Porsangerfjorden
  { pts: [[27.0, 71.0], [27.0, 70.6]], w: 0.6 }, // Laksefjorden
  { pts: [[28.3, 70.92], [28.3, 70.6], [28.4, 70.35]], w: 0.6 }, // Tanafjorden
  { pts: [[30.7, 70.0], [30.0, 70.05], [29.2, 70.1], [28.7, 70.12]], w: 0.7 }, // Varangerfjorden
  // Leia innenfor skjærgården i Nordland/Troms: åpent hav mellom øyer og fastland
  { pts: [[14.0, 67.6], [15.2, 68.0], [16.0, 68.4]], w: 1.4 }, // Vestfjorden
];

export const LAKES: { pts: LL[]; w: number }[] = [
  { pts: [[10.62, 61.05], [10.75, 60.85], [10.95, 60.7], [11.15, 60.45]], w: 0.6 }, // Mjøsa
  { pts: [[11.85, 62.35], [11.9, 62.05], [11.95, 61.85]], w: 0.5 }, // Femunden
  { pts: [[8.8, 59.95], [8.6, 60.0], [8.4, 60.05]], w: 0.4 }, // Tinnsjå/Møsvatn-ish
];

// Fjellområder: [lon, lat, amplitude (høydenivåer), radius (grader i lat-ekvivalent)]
export const MOUNTAINS: [number, number, number, number][] = [
  [8.3, 61.6, 7.5, 0.9], // Jotunheimen
  [7.4, 60.15, 5.0, 0.9], // Hardangervidda
  [9.3, 62.3, 5.5, 0.6], // Dovrefjell
  [9.8, 61.9, 4.5, 0.5], // Rondane
  [9.2, 62.75, 4.5, 0.45], // Trollheimen
  [7.2, 59.2, 4.0, 0.7], // Setesdalsheiene
  [6.8, 61.75, 5.5, 0.6], // Jostedalsbreen
  [7.5, 62.4, 5.0, 0.6], // Romsdal/Sunnmøre
  [6.3, 60.6, 4.5, 0.6], // Vestlandet indre
  [12.3, 63.0, 3.5, 0.4], // Sylan
  [13.8, 65.3, 4.0, 0.5], // Børgefjell
  [14.0, 66.7, 5.5, 0.6], // Saltfjellet/Svartisen
  [16.2, 67.3, 4.5, 0.6], // Sulitjelma
  [18.0, 68.2, 4.5, 0.6], // Narvikfjellene
  [20.2, 69.6, 5.5, 0.45], // Lyngsalpene
  [14.5, 68.3, 4.5, 0.4], // Lofotveggen
  [24.0, 69.4, 2.0, 1.2], // Finnmarksvidda (platå)
  [17.5, 66.0, 3.0, 1.0], // Svensk fjellkjede
  [13.2, 62.5, 2.0, 0.9],
];

export interface CityDef {
  id: string; name: string; oldName?: [string, number]; lon: number; lat: number;
  pop: [number, number, number]; // tusen innbyggere ca. 1900, 1950, 2020
  chapter: number; // kapittelet byen blir aktiv i (0-basert)
}

export const CITIES: CityDef[] = [
  { id: 'oslo', name: 'Oslo', oldName: ['Kristiania', 1925], lon: 10.75, lat: 59.91, pop: [230, 430, 1000], chapter: 0 },
  { id: 'drammen', name: 'Drammen', lon: 10.2, lat: 59.74, pop: [25, 40, 120], chapter: 0 },
  { id: 'fredrikstad', name: 'Fredrikstad', lon: 10.94, lat: 59.22, pop: [30, 55, 115], chapter: 0 },
  { id: 'tonsberg', name: 'Tønsberg', lon: 10.41, lat: 59.27, pop: [15, 30, 55], chapter: 0 },
  { id: 'skien', name: 'Skien', lon: 9.6, lat: 59.2, pop: [25, 50, 95], chapter: 0 },
  { id: 'hamar', name: 'Hamar', lon: 11.07, lat: 60.79, pop: [6, 12, 35], chapter: 0 },
  { id: 'lillehammer', name: 'Lillehammer', lon: 10.47, lat: 61.12, pop: [3, 6, 28], chapter: 0 },
  { id: 'kongsberg', name: 'Kongsberg', lon: 9.65, lat: 59.67, pop: [5, 10, 28], chapter: 0 },

  { id: 'bergen', name: 'Bergen', lon: 5.32, lat: 60.39, pop: [72, 150, 285], chapter: 1 },
  { id: 'stavanger', name: 'Stavanger', lon: 5.73, lat: 58.97, pop: [30, 60, 230], chapter: 1 },
  { id: 'trondheim', name: 'Trondheim', oldName: ['Trondhjem', 1931], lon: 10.4, lat: 63.43, pop: [38, 85, 200], chapter: 1 },
  { id: 'kristiansand', name: 'Kristiansand', lon: 7.99, lat: 58.15, pop: [15, 35, 90], chapter: 1 },
  { id: 'arendal', name: 'Arendal', lon: 8.77, lat: 58.46, pop: [10, 15, 40], chapter: 1 },
  { id: 'haugesund', name: 'Haugesund', lon: 5.27, lat: 59.41, pop: [10, 20, 45], chapter: 1 },
  { id: 'alesund', name: 'Ålesund', lon: 6.15, lat: 62.47, pop: [12, 20, 55], chapter: 1 },
  { id: 'molde', name: 'Molde', lon: 7.16, lat: 62.74, pop: [2, 7, 27], chapter: 1 },
  { id: 'kristiansund', name: 'Kristiansund', lon: 7.73, lat: 63.11, pop: [12, 15, 24], chapter: 1 },
  { id: 'forde', name: 'Førde', lon: 5.85, lat: 61.45, pop: [1, 2, 13], chapter: 1 },
  { id: 'larvik', name: 'Larvik', lon: 10.03, lat: 59.05, pop: [10, 20, 47], chapter: 1 },
  { id: 'kongsvinger', name: 'Kongsvinger', lon: 12.0, lat: 60.19, pop: [2, 5, 18], chapter: 1 },
  { id: 'steinkjer', name: 'Steinkjer', lon: 11.49, lat: 64.01, pop: [3, 6, 14], chapter: 1 },
  { id: 'roros', name: 'Røros', lon: 11.38, lat: 62.57, pop: [2, 3, 6], chapter: 1 },

  { id: 'bodo', name: 'Bodø', lon: 14.4, lat: 67.28, pop: [5, 10, 52], chapter: 2 },
  { id: 'tromso', name: 'Tromsø', lon: 18.96, lat: 69.65, pop: [7, 12, 77], chapter: 2 },
  { id: 'narvik', name: 'Narvik', lon: 17.43, lat: 68.44, pop: [3, 10, 19], chapter: 2 },
  { id: 'harstad', name: 'Harstad', lon: 16.54, lat: 68.8, pop: [2, 5, 25], chapter: 2 },
  { id: 'moirana', name: 'Mo i Rana', lon: 14.14, lat: 66.31, pop: [1, 7, 26], chapter: 2 },
  { id: 'mosjoen', name: 'Mosjøen', lon: 13.19, lat: 65.84, pop: [1, 4, 10], chapter: 2 },
  { id: 'namsos', name: 'Namsos', lon: 11.5, lat: 64.47, pop: [2, 5, 13], chapter: 2 },
  { id: 'alta', name: 'Alta', lon: 23.27, lat: 69.97, pop: [1, 4, 21], chapter: 2 },
  { id: 'hammerfest', name: 'Hammerfest', lon: 23.68, lat: 70.66, pop: [2, 4, 11], chapter: 2 },
  { id: 'kirkenes', name: 'Kirkenes', lon: 30.05, lat: 69.73, pop: [1, 5, 10], chapter: 2 },
  { id: 'svolvaer', name: 'Svolvær', lon: 14.57, lat: 68.23, pop: [1, 4, 5], chapter: 2 },
  { id: 'sogndal', name: 'Sogndal', lon: 7.1, lat: 61.23, pop: [1, 2, 8], chapter: 2 },
  { id: 'vadso', name: 'Vadsø', lon: 29.75, lat: 70.16, pop: [2, 3, 6], chapter: 2 },
];

export interface IndustryDef {
  id: string; name: string; owner: string; kind: 'smelter' | 'factory' | 'datacenter' | 'platform' | 'hydrogen';
  lon: number; lat: number; mw: number; year: number; deadline: number; reward: number; chapter: number;
  fact: string;
}

export const INDUSTRIES: IndustryDef[] = [
  { id: 'rjukan', name: 'Rjukan', owner: 'Norsk Hydro', kind: 'factory', lon: 8.59, lat: 59.88, mw: 30, year: 1906, deadline: 1916, reward: 120, chapter: 0,
    fact: 'Vemork ved Rjukan var verdens største kraftverk da det åpnet i 1911. Strømmen ble brukt til å lage kunstgjødsel av luft.' },
  { id: 'odda', name: 'Odda smelteverk', owner: 'Smelteverket', kind: 'smelter', lon: 6.55, lat: 60.07, mw: 40, year: 1921, deadline: 1932, reward: 180, chapter: 1,
    fact: 'Odda Smelteverk produserte karbid og cyanamid fra 1908, drevet av billig vannkraft fra Tyssedal.' },
  { id: 'sauda', name: 'Sauda smelteverk', owner: 'Electric Furnace Products', kind: 'smelter', lon: 6.35, lat: 59.65, mw: 50, year: 1924, deadline: 1936, reward: 200, chapter: 1,
    fact: 'Amerikanske eiere bygget smelteverk i Sauda i 1923 – kraftkrevende industri flyttet dit vannkraften var.' },
  { id: 'ardal', name: 'Årdal aluminium', owner: 'Årdal Verk', kind: 'smelter', lon: 7.7, lat: 61.24, mw: 120, year: 1940, deadline: 1950, reward: 400, chapter: 1,
    fact: 'Aluminiumsverket i Årdal ble planlagt under krigen og startet opp i 1948. Aluminium kalles "fast strøm".' },
  { id: 'sunndal', name: 'Sunndalsøra', owner: 'Årdal og Sunndal Verk', kind: 'smelter', lon: 8.56, lat: 62.67, mw: 250, year: 1953, deadline: 1962, reward: 700, chapter: 2,
    fact: 'Aura kraftverk ble bygget for å forsyne aluminiumsverket på Sunndalsøra, som åpnet i 1954.' },
  { id: 'ranajern', name: 'Norsk Jernverk', owner: 'Staten', kind: 'factory', lon: 14.2, lat: 66.27, mw: 160, year: 1954, deadline: 1964, reward: 500, chapter: 2,
    fact: 'Jernverket i Mo i Rana var et av de største industriprosjektene i etterkrigs-Norge.' },
  { id: 'mosjoenal', name: 'Mosjøen aluminium', owner: 'Mosal', kind: 'smelter', lon: 13.25, lat: 65.8, mw: 120, year: 1957, deadline: 1967, reward: 400, chapter: 2,
    fact: 'Mosjøen Aluminiumverk startet i 1958 og hentet kraft fra Røssåga.' },
  { id: 'husnes', name: 'Husnes', owner: 'Sør-Norge Aluminium', kind: 'smelter', lon: 5.75, lat: 59.86, mw: 150, year: 1964, deadline: 1973, reward: 450, chapter: 2,
    fact: 'Sør-Norge Aluminium på Husnes ble åpnet i 1965 og hentet kraft fra Folgefonna-området.' },
  { id: 'karmoy', name: 'Karmøy aluminium', owner: 'Norsk Hydro', kind: 'smelter', lon: 5.27, lat: 59.32, mw: 220, year: 1966, deadline: 1976, reward: 600, chapter: 2,
    fact: 'Hydro Karmøy startet produksjonen i 1967, og er i dag et av verdens mest energieffektive verk.' },
  { id: 'mongstad', name: 'Mongstad', owner: 'Statoil', kind: 'factory', lon: 5.03, lat: 60.81, mw: 120, year: 1983, deadline: 1993, reward: 400, chapter: 3,
    fact: 'Raffineriet på Mongstad åpnet i 1975 og er Norges største.' },
  { id: 'trolla', name: 'Troll A', owner: 'Equinor', kind: 'platform', lon: 3.73, lat: 60.64, mw: 100, year: 1994, deadline: 2004, reward: 600, chapter: 3,
    fact: 'Troll A var i 1996 den første plattformen som fikk kraft fra land, gjennom kabel fra Kollsnes.' },
  { id: 'melkoya', name: 'Melkøya LNG', owner: 'Hammerfest LNG', kind: 'factory', lon: 23.6, lat: 70.69, mw: 230, year: 2004, deadline: 2014, reward: 900, chapter: 3,
    fact: 'Hammerfest LNG på Melkøya gjør naturgass fra Snøhvit om til flytende gass. Elektrifiseringen krever enorme mengder kraft fra nettet.' },
  { id: 'sverdrup', name: 'Johan Sverdrup', owner: 'Equinor', kind: 'platform', lon: 2.6, lat: 58.85, mw: 300, year: 2016, deadline: 2026, reward: 1500, chapter: 4,
    fact: 'Johan Sverdrup-feltet får kraft fra land og har blant verdens laveste CO₂-utslipp per fat.' },
  { id: 'datakrs', name: 'Datasenter Sør', owner: 'Datasenteraktør', kind: 'datacenter', lon: 8.1, lat: 58.2, mw: 300, year: 2020, deadline: 2030, reward: 1400, chapter: 4,
    fact: 'Kjølig klima og fornybar kraft gjør Norge attraktivt for datasentre, men de trenger mye nettkapasitet.' },
  { id: 'battery', name: 'Batterifabrikk', owner: 'Batteriprodusent', kind: 'factory', lon: 14.05, lat: 66.32, mw: 350, year: 2024, deadline: 2034, reward: 1600, chapter: 4,
    fact: 'Batterifabrikker er en del av det grønne industriløftet, og hver av dem trenger hundrevis av megawatt.' },
  { id: 'hydrogen', name: 'Hydrogenfabrikk', owner: 'Hydrogenprodusent', kind: 'hydrogen', lon: 13.98, lat: 66.8, mw: 250, year: 2027, deadline: 2038, reward: 1300, chapter: 4,
    fact: 'Grønn hydrogen lages ved elektrolyse av vann. Da kreves store mengder fornybar strøm.' },
  { id: 'melkoya2', name: 'Melkøya elektrifisering', owner: 'Hammerfest LNG', kind: 'factory', lon: 23.75, lat: 70.62, mw: 350, year: 2028, deadline: 2040, reward: 1800, chapter: 4,
    fact: 'Elektrifiseringen av Melkøya forutsetter ny 420 kV-linje helt opp til Hammerfest.' },
  { id: 'datamid', name: 'Datasenter Midt', owner: 'Datasenteraktør', kind: 'datacenter', lon: 10.9, lat: 63.5, mw: 250, year: 2030, deadline: 2042, reward: 1300, chapter: 4,
    fact: 'Midt-Norge har hatt stor vekst i datasentre og kraftkrevende industri.' },
];

export interface MarketDef {
  id: string; name: string; country: string; lon: number; lat: number; ac: boolean; year: number;
  basePrice: number; flag: string[]; fact: string;
}

export const MARKETS: MarketDef[] = [
  { id: 'se3', name: 'Sverige (Sør)', country: 'SE', lon: 12.6, lat: 59.55, ac: true, year: 1960, basePrice: 28, flag: ['#1d5ea8', '#f5c400'],
    fact: 'Hasle–Borgvik ble en av de første sterke forbindelsene til Sverige. Norden har lenge samkjørt kraftnettene.' },
  { id: 'se2', name: 'Sverige (Midt)', country: 'SE', lon: 12.9, lat: 63.35, ac: true, year: 1960, basePrice: 26, flag: ['#1d5ea8', '#f5c400'],
    fact: 'Nea–Järpströmmen kobler Trøndelag til Sverige.' },
  { id: 'se1', name: 'Sverige (Nord)', country: 'SE', lon: 19.2, lat: 68.0, ac: true, year: 1960, basePrice: 24, flag: ['#1d5ea8', '#f5c400'],
    fact: 'Ofoten–Ritsem binder sammen nordnorsk og nordsvensk vannkraft.' },
  { id: 'fi', name: 'Finland', country: 'FI', lon: 26.6, lat: 69.45, ac: true, year: 1985, basePrice: 32, flag: ['#ffffff', '#1a4b8c'],
    fact: 'Varangerbotn–Ivalo forbinder Finnmark med Finland.' },
  { id: 'dk', name: 'Danmark', country: 'DK', lon: 9.3, lat: 57.4, ac: false, year: 1977, basePrice: 36, flag: ['#c8102e', '#ffffff'],
    fact: 'Skagerrak 1 ble satt i drift i 1977 – Norges første likestrømskabel (HVDC) til utlandet.' },
  { id: 'nl', name: 'Nederland', country: 'NL', lon: 6.6, lat: 57.3, ac: false, year: 2008, basePrice: 44, flag: ['#ae1c28', '#ffffff', '#21468b'],
    fact: 'NorNed (2008) var med sine 580 km verdens lengste sjøkabel for kraft da den ble lagt.' },
  { id: 'de', name: 'Tyskland', country: 'DE', lon: 8.0, lat: 57.15, ac: false, year: 2020, basePrice: 46, flag: ['#000000', '#dd0000', '#ffce00'],
    fact: 'NordLink til Tyskland åpnet i 2020: tysk vind og sol kan balanseres med norsk vannkraft.' },
  { id: 'uk', name: 'Storbritannia', country: 'UK', lon: 2.4, lat: 59.6, ac: false, year: 2021, basePrice: 50, flag: ['#012169', '#c8102e', '#ffffff'],
    fact: 'North Sea Link fra Kvilldal til England var verdens lengste sjøkabel for kraft (720 km) da den åpnet i 2021.' },
];

export interface HistoryNote { year: number; week?: number; title: string; text: string }
export const HISTORY: HistoryNote[] = [
  { year: 1900, title: 'Det elektriske lyset', text: 'Kristiania får sitt første kommunale elektrisitetsverk. Bare de rikeste har strøm.' },
  { year: 1906, title: 'Hjemfallsretten', text: 'Panikkloven vedtas: staten vil sikre at fossefallene forblir norske.' },
  { year: 1917, title: 'Konsesjonslovene', text: 'Konsesjonslovene sikrer at vannkraften etter en tid faller tilbake til fellesskapet.' },
  { year: 1921, title: 'NVE opprettes', text: 'Norges vassdrags- og elektrisitetsvesen samler forvaltningen av vannkraften.' },
  { year: 1940, title: 'Krigsårene', text: 'Utbyggingen bremses. Mange anlegg blir mål for sabotasje – som tungtvannsaksjonen på Vemork.' },
  { year: 1946, title: 'Gjenreisingen', text: 'Elektrifisering av hele landet blir et nasjonalt mål. Stortinget satser på storskala vannkraft.' },
  { year: 1960, title: 'Samkjøring', text: 'Kraftverkene i Norge og Norden begynner å "samkjøre": overskudd ett sted dekker underskudd et annet.' },
  { year: 1972, title: 'Første 420 kV', text: 'De høyeste spenningsnivåene tas i bruk. Høyere spenning gir lavere tap over lange avstander.' },
  { year: 1991, title: 'Energiloven', text: 'Kraftmarkedet åpnes for konkurranse. Nettet blir et nøytralt monopol som alle skal ha tilgang til.' },
  { year: 1992, title: 'Systemansvarlig', text: 'Et eget statlig foretak får ansvar for sentralnettet og for å holde frekvensen stabil.' },
  { year: 1996, title: 'Nord Pool', text: 'Norge og Sverige får felles kraftbørs. Prisen settes time for time.' },
  { year: 2003, title: 'Tørrår', text: 'Lite nedbør gir lave magasiner og høye priser. Utenlandsforbindelsene redder vinteren.' },
  { year: 2016, title: 'Elbil-landet', text: 'Norge har verdens høyeste andel elbiler. Strømforbruket i boligene endrer seg.' },
  { year: 2022, title: 'Energikrisen', text: 'Gasskrise i Europa gir rekordhøye priser. Flaskehalser deler Norge i prisområder.' },
  { year: 2030, title: 'Klimamålet', text: 'Utslippene skal ned 55 %. Elektrifisering av sokkel, industri og transport krever mer nett.' },
  { year: 2040, title: 'Havvind', text: 'Havvind leverer en stor del av den nye kraften. Nettet må tåle mer variabel produksjon.' },
];
