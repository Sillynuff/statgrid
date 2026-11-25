export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

const nf0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export function fmt(x: number, dec = 0): string {
  if (!isFinite(x)) return '∞';
  return dec ? nf1.format(x) : nf0.format(Math.round(x));
}
export function fmtMW(x: number): string {
  if (Math.abs(x) >= 10000) return `${nf1.format(x / 1000)} GW`;
  if (Math.abs(x) > 0.0005 && Math.abs(x) < 1) return `${nf0.format(Math.round((x * 1000) / 10) * 10)} kW`;
  return `${Math.abs(x) < 10 ? nf1.format(x) : nf0.format(x)} MW`;
}
export function fmtMoney(x: number): string {
  if (x >= 1e8) return '∞';
  if (Math.abs(x) >= 100000) return `${nf1.format(x / 1000)} mrd`;
  return `${nf0.format(x)}`;
}
export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
export function loadColor(load: number) {
  return load > 0.95 ? 'var(--bad)' : load > 0.7 ? 'var(--warn)' : 'var(--good)';
}
