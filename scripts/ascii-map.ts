import { generateTerrain, T_SEA, T_LAND, T_FOREIGN, T_LAKE } from '../src/world/terrain';
import { CITIES } from '../src/data/geo';
import { llToTileInt } from '../src/world/projection';

const t0 = Date.now();
const t = generateTerrain();
console.log(`map ${t.W}x${t.H} generated in ${Date.now() - t0} ms`);
const step = Number(process.argv[2] ?? 2);
const cityAt = new Map<string, string>();
for (const c of CITIES) {
  const [i, j] = llToTileInt(c.lon, c.lat);
  cityAt.set(`${Math.floor(i / step)},${Math.floor(j / step)}`, c.name[0]);
}
for (let j = 0; j < t.H; j += step) {
  let row = '';
  for (let i = 0; i < t.W; i += step) {
    const k = j * t.W + i;
    const c = cityAt.get(`${i / step},${j / step}`);
    if (c) { row += c; continue; }
    const ty = t.type[k];
    if (ty === T_SEA) row += '.';
    else if (ty === T_LAKE) row += '~';
    else if (ty === T_FOREIGN) row += ':';
    else row += t.level[k] >= 10 ? '#' : t.level[k] >= 6 ? '%' : t.level[k] >= 3 ? '+' : '-';
  }
  console.log(row);
}
