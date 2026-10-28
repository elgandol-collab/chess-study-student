// Move sounds synthesised from scratch with the Web Audio API.
// No audio files, no network, no permissions, nothing copyrighted.

const noiseCache = new WeakMap();
function noiseBuffer(c) {
  let b = noiseCache.get(c);
  if (!b) {
    b = c.createBuffer(1, Math.ceil(c.sampleRate * 0.12), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}

// one wooden "knock": a pitch-dropping thump + a short filtered click
function knock(c, out, t, o = {}) {
  const freq = o.freq ?? 170, noiseHz = o.noiseHz ?? 1300, vol = o.vol ?? 0.75, dur = o.dur ?? 0.1;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.8, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.02);

  const n = c.createBufferSource(); n.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = noiseHz; f.Q.value = 0.9;
  const ng = c.createGain();
  ng.gain.setValueAtTime(vol, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  n.connect(f); f.connect(ng); ng.connect(out); n.start(t); n.stop(t + 0.06);
}

// soft musical note (used for check / mate / promotion)
function tone(c, out, t, freq, dur, vol, type = 'sine') {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.02);
}

export function classify(san) {
  const s = String(san || '');
  const capture = s.includes('x');
  if (s.includes('#')) return 'mate';
  if (s.includes('+')) return capture ? 'checkcap' : 'check';
  if (s.startsWith('O-O')) return 'castle';
  if (s.includes('=')) return 'promotion';
  return capture ? 'capture' : 'move';
}

export const KINDS = ['move', 'capture', 'castle', 'check', 'checkcap', 'promotion', 'mate'];

export function render(c, out, t, kind) {
  const hit = () => knock(c, out, t, { freq: 170, noiseHz: 1300, vol: 0.75 });
  const heavy = () => { knock(c, out, t, { freq: 130, noiseHz: 850, vol: 1.0, dur: 0.12 }); knock(c, out, t + 0.05, { freq: 210, noiseHz: 1800, vol: 0.45 }); };
  switch (kind) {
    case 'capture':   heavy(); break;
    case 'castle':    hit(); knock(c, out, t + 0.13, { freq: 150, noiseHz: 1100, vol: 0.8 }); break;
    case 'check':     hit(); tone(c, out, t + 0.05, 1175, 0.22, 0.16); tone(c, out, t + 0.05, 1760, 0.16, 0.06); break;
    case 'checkcap':  heavy(); tone(c, out, t + 0.07, 1175, 0.22, 0.16); tone(c, out, t + 0.07, 1760, 0.16, 0.06); break;
    case 'promotion': hit(); tone(c, out, t + 0.07, 523, 0.14, 0.18, 'triangle'); tone(c, out, t + 0.16, 784, 0.22, 0.2, 'triangle'); break;
    case 'mate':      heavy(); tone(c, out, t + 0.09, 659, 0.25, 0.2, 'triangle'); tone(c, out, t + 0.23, 523, 0.25, 0.2, 'triangle'); tone(c, out, t + 0.39, 392, 0.5, 0.22, 'triangle'); break;
    default:          hit();
  }
}
