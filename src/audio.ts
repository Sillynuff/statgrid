// Små syntetiserte lydeffekter (ingen lydfiler nødvendig)
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let muted = (() => { try { return localStorage.getItem('statgrid-muted') === '1'; } catch { return false; } })();

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('statgrid-muted', m ? '1' : '0'); } catch { /* ignorer */ }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, delay = 0, slide = 0) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol = 0.3, delay = 0, freq = 800) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  click: () => tone(880, 0.06, 'triangle', 0.25),
  hover: () => tone(1200, 0.03, 'sine', 0.06),
  place: () => { noise(0.18, 0.5, 0, 300); tone(140, 0.2, 'square', 0.18, 0, -60); tone(520, 0.12, 'triangle', 0.25, 0.08, 200); },
  line: () => { tone(330, 0.1, 'triangle', 0.25); tone(495, 0.1, 'triangle', 0.25, 0.07); tone(660, 0.16, 'triangle', 0.25, 0.14); },
  error: () => { tone(160, 0.18, 'sawtooth', 0.18); tone(120, 0.22, 'sawtooth', 0.18, 0.1); },
  powered: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.22, i * 0.07)); },
  coin: () => { tone(988, 0.08, 'square', 0.15); tone(1319, 0.3, 'square', 0.15, 0.08); },
  built: () => { tone(392, 0.12, 'triangle', 0.2); tone(587, 0.2, 'triangle', 0.2, 0.09); },
  alert: () => { tone(740, 0.16, 'square', 0.14); tone(554, 0.22, 'square', 0.14, 0.18); },
  storm: () => { noise(0.9, 0.6, 0, 180); tone(70, 0.6, 'sawtooth', 0.12, 0, -30); },
  objective: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, i * 0.09)); },
  fanfare: () => {
    const seq = [523, 523, 523, 659, 784, 659, 784, 1047];
    seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.8 : 0.18, 'square', 0.14, i * 0.14));
    seq.forEach((f, i) => tone(f / 2, i === seq.length - 1 ? 0.8 : 0.18, 'triangle', 0.18, i * 0.14));
  },
  star: (i: number) => tone(660 + i * 220, 0.35, 'triangle', 0.25),
};
