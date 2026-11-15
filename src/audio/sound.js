// CranGuys — WebAudio sound: every effect is synthesised (boings, squishes, sad trombones…) and the music is a
// little procedural step-sequencer with per-round moods. No audio files needed.
import { mulberry32 } from '../sim/math.js';
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Sound {
  constructor() { this.ctx = null; this.track = null; this.vol = { master: 0.8, music: 0.55, sfx: 0.9 }; this.last = {}; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfxG = c.createGain(); this.sfxG.connect(this.master);
    this.musG = c.createGain(); this.musG.connect(this.master);
    const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVol();
    if (this.pending) { const t = this.pending; this.pending = null; this.music(t); }
  }
  setVol(v) { Object.assign(this.vol, v); this.applyVol(); }
  applyVol() { if (!this.ctx) return; this.master.gain.value = this.vol.master; this.sfxG.gain.value = this.vol.sfx; this.musG.gain.value = this.vol.music * 0.42; }

  // ---------- primitives ----------
  osc(type, f0, f1, dur, vol, { at = 0, out = null, curve = 'exp', vib = 0, filter = null } = {}) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) curve === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur) : o.frequency.linearRampToValueAtTime(f1, t + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 7; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.f; f.Q.value = filter.q || 1; o.connect(f); node = f; }
    node.connect(g); g.connect(out || this.sfxG); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseHit(dur, vol, type, f0, f1 = f0, { at = 0, out = null, q = 1 } = {}) {
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfxG); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  play(name, vol = 1, pitch = 1) {
    if (!this.ctx || this.vol.sfx <= 0) return;
    const now = performance.now(); if (this.last[name] && now - this.last[name] < 40) return; this.last[name] = now;
    const p = pitch * (0.94 + Math.random() * 0.12), v = vol;
    switch (name) {
      case 'jump': this.osc('sine', 290 * p, 640 * p, 0.16, 0.22 * v, { vib: 18 }); break;
      case 'hop': this.osc('sine', 360 * p, 720 * p, 0.12, 0.18 * v); break;
      case 'land': this.osc('sine', 150 * p, 55, 0.12, 0.3 * v); this.noiseHit(0.06, 0.08 * v, 'lowpass', 900); break;
      case 'dive': this.noiseHit(0.28, 0.16 * v, 'bandpass', 500, 2600, { q: 2 }); this.osc('sine', 520 * p, 300 * p, 0.2, 0.08 * v); break;
      case 'belly': this.osc('sine', 230 * p, 95, 0.18, 0.26 * v); this.noiseHit(0.1, 0.1 * v, 'lowpass', 1200, 300); break;
      case 'bounce': this.osc('sine', 200 * p, 900 * p, 0.42, 0.24 * v, { vib: 40 }); this.osc('triangle', 400 * p, 1800 * p, 0.25, 0.06 * v); break;
      case 'bump': this.osc('triangle', 560 * p, 250 * p, 0.14, 0.25 * v); break;
      case 'rag': this.osc('sawtooth', 560 * p, 170 * p, 0.55, 0.12 * v, { vib: 30, filter: { type: 'lowpass', f: 1800 } }); this.osc('sine', 120, 60, 0.15, 0.25 * v); break;
      case 'zap': this.osc('square', 1500 * p, 180, 0.2, 0.09 * v); this.noiseHit(0.12, 0.08 * v, 'highpass', 3000); break;
      case 'getup': this.osc('sine', 420 * p, 760 * p, 0.08, 0.12 * v); break;
      case 'grab': this.osc('sine', 170 * p, 280 * p, 0.12, 0.2 * v); break;
      case 'ledge': this.osc('triangle', 700 * p, 900 * p, 0.06, 0.12 * v); break;
      case 'climb': [0, 4, 7].forEach((n, i) => this.osc('sine', NOTE(72 + n) * p, NOTE(72 + n) * p, 0.1, 0.1 * v, { at: i * 0.05 })); break;
      case 'tile': this.noiseHit(0.08, 0.06 * v, 'highpass', 2500); this.osc('sine', 980 * p, 760 * p, 0.08, 0.04 * v); break;
      case 'tiledrop': this.noiseHit(0.25, 0.08 * v, 'lowpass', 1400, 200); break;
      case 'door': this.noiseHit(0.5, 0.35 * v, 'lowpass', 2400, 160); this.osc('sine', 90, 40, 0.3, 0.4 * v); break;
      case 'warn': this.osc('square', 1180 * p, 1180 * p, 0.09, 0.07 * v, { filter: { type: 'lowpass', f: 2600 } }); this.osc('sine', 590 * p, 590 * p, 0.12, 0.08 * v); break;
      case 'rope': this.noiseHit(0.32, 0.22 * v, 'bandpass', 260, 2400, { q: 1.2 }); this.osc('sine', 120 * p, 55, 0.18, 0.3 * v); break;
      case 'tease': [0, 0.09, 0.18, 0.27, 0.36, 0.45].forEach((at, i) => this.noiseHit(0.05, (0.05 + i * 0.012) * v, 'bandpass', 900, 900, { at, q: 3 })); break;
      case 'scratch': this.noiseHit(0.22, 0.2 * v, 'bandpass', 2600, 300, { q: 2 }); this.osc('sawtooth', 600, 90, 0.2, 0.06 * v, { filter: { type: 'lowpass', f: 1500 } }); break;
      case 'scan': this.osc('sine', 300, 1300, 0.45, 0.12 * v, { vib: 25 }); this.osc('triangle', 150, 650, 0.45, 0.08 * v); break;
      case 'buzzer': this.osc('square', 140 * p, 120 * p, 0.45, 0.12 * v, { filter: { type: 'lowpass', f: 1200 } }); this.osc('sawtooth', 70, 60, 0.45, 0.08 * v); break;
      case 'doorthud': this.osc('sine', 120 * p, 70, 0.1, 0.22 * v); break;
      case 'cp': this.osc('sine', 880, 880, 0.35, 0.12 * v); this.osc('sine', 1320, 1320, 0.35, 0.08 * v, { at: 0.06 }); break;
      case 'respawn': this.osc('sine', 300, 900, 0.2, 0.15 * v); break;
      case 'fall': this.osc('sine', 1300 * p, 260, 0.9, 0.12 * v, { curve: 'lin' }); break;
      case 'qualify': [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => { this.osc('triangle', NOTE(n), NOTE(n), 0.32, 0.12 * v, { at: i * 0.07 }); this.osc('sine', NOTE(n + 12), NOTE(n + 12), 0.3, 0.05 * v, { at: i * 0.07 }); }); break;
      case 'eliminated': [[62, 0], [61, 0.32], [60, 0.64], [59, 0.96]].forEach(([n, at], i) => this.osc('sawtooth', NOTE(n - 12), NOTE(n - 12 - (i === 3 ? 2 : 0)), i === 3 ? 0.9 : 0.3, 0.12 * v, { at, vib: i === 3 ? 6 : 0, filter: { type: 'lowpass', f: 1100 } })); break;
      case 'count': this.osc('square', 660, 660, 0.14, 0.08 * v, { filter: { type: 'lowpass', f: 2500 } }); break;
      case 'go': [72, 76, 79, 84].forEach((n) => this.osc('square', NOTE(n), NOTE(n), 0.5, 0.05 * v, { filter: { type: 'lowpass', f: 3500 } })); this.noiseHit(0.3, 0.08 * v, 'highpass', 5000); break;
      case 'crown': [72, 76, 79, 83, 86, 88, 91].forEach((n, i) => this.osc('sine', NOTE(n), NOTE(n), 0.6, 0.1 * v, { at: i * 0.06 })); break;
      case 'whistle': this.osc('sine', 1800, 2400, 0.25, 0.1 * v, { vib: 60 }); this.osc('sine', 2400, 1800, 0.25, 0.1 * v, { at: 0.28, vib: 60 }); break;
      case 'click': this.osc('sine', 900 * p, 1300 * p, 0.05, 0.08 * v); break;
      case 'tick': this.osc('square', 1250 * p, 1050 * p, 0.035, 0.05 * v, { filter: { type: 'lowpass', f: 3200 } }); break;
      case 'pop': this.osc('sine', 500 * p, 1100 * p, 0.07, 0.12 * v); break;
      case 'buy': this.osc('sine', 1568, 1568, 0.2, 0.1 * v); this.osc('sine', 2093, 2093, 0.35, 0.1 * v, { at: 0.08 }); this.noiseHit(0.15, 0.05 * v, 'highpass', 6000); break;
      case 'error': this.osc('square', 180, 150, 0.2, 0.06 * v, { filter: { type: 'lowpass', f: 900 } }); break;
      case 'whoosh': this.noiseHit(0.35, 0.08 * v, 'bandpass', 300, 3000, { q: 1.5 }); break;
      case 'join': this.osc('sine', 700 * p, 1000 * p, 0.06, 0.04 * v); break;
      case 'confetti': for (let i = 0; i < 5; i++) this.osc('sine', 600 + Math.random() * 900, 1200 + Math.random() * 800, 0.08, 0.05 * v, { at: i * 0.05 }); break;
    }
  }

  // ---------- music ----------
  music(track) {
    if (!this.ctx) { this.pending = track; return; }
    if (track === this.track) return;
    this.track = track;
    if (this.seq) { clearInterval(this.seq.iv); const g = this.seq.g; g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25); setTimeout(() => g.disconnect(), 1500); this.seq = null; }
    if (!track) return;
    const T = TRACKS[track] || TRACKS.menu, c = this.ctx, g = c.createGain();
    g.gain.value = 0; g.gain.setTargetAtTime(1, c.currentTime, 0.4); g.connect(this.musG);
    const rng = mulberry32(T.seed), scale = T.scale;
    // a catchy 4-bar melody, fixed per track
    const mel = []; let deg = 4;
    for (let i = 0; i < 64; i++) { if (rng() < T.density[i % 16]) { deg = Math.max(0, Math.min(scale.length * 2 - 1, deg + Math.floor(rng() * 5) - 2)); mel.push(deg); } else mel.push(-1); }
    const seq = (this.seq = { g, step: 0, next: c.currentTime + 0.1, iv: 0 });
    const spb = 60 / T.bpm / 4;
    seq.iv = setInterval(() => {
      while (seq.next < c.currentTime + 0.15) { this.musicStep(T, seq.step, seq.next, g, mel, spb); seq.next += spb; seq.step = (seq.step + 1) % 64; }
    }, 30);
  }
  musicStep(T, step, t, out, mel, spb) {
    const bar = Math.floor(step / 16), s = step % 16, root = T.key + T.prog[bar];
    const at = t - this.ctx.currentTime;
    if (at < -0.05) return;
    const o = { at: Math.max(0, at), out };
    if (T.kick[s] === 'x') this.osc('sine', 160, 42, 0.16, 0.5, o);
    if (T.snare[s] === 'x') { this.noiseHit(0.13, 0.16, 'bandpass', 1900, 1500, o); this.osc('triangle', 220, 160, 0.08, 0.08, o); }
    if (T.hat[s] === 'x') this.noiseHit(0.035, 0.05, 'highpass', 8000, 8000, o);
    if (T.bass[s] === 'x') this.osc('triangle', NOTE(root - 24 + (s === 14 ? 7 : 0)), NOTE(root - 24 + (s === 14 ? 7 : 0)), spb * 2.2, 0.2, { ...o, filter: { type: 'lowpass', f: 700 } });
    if (T.chord[s] === 'x') for (const iv of T.minor[bar] ? [0, 3, 7] : [0, 4, 7]) this.pluck(NOTE(root + iv), 0.05, o);
    const m = mel[step];
    if (m >= 0) { const sc = T.scale, n = T.key + 12 + sc[m % sc.length] + 12 * Math.floor(m / sc.length); this.pluck(NOTE(n), 0.08, o, true); }
  }
  pluck(f, vol, o, bright) {
    this.osc('sine', f, f, 0.32, vol, o);
    this.osc(bright ? 'triangle' : 'sine', f * 2, f * 2, 0.12, vol * 0.35, o);
  }
}

const TRACKS = {
  menu: { bpm: 112, key: 65, prog: [0, 7, 9, 5], minor: [0, 0, 1, 0], scale: [0, 2, 4, 7, 9], seed: 11,
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.....x.x.....x.', chord: '....x.......x...',
    density: [0.7, 0, 0.4, 0, 0.6, 0, 0.3, 0.2, 0.7, 0, 0.4, 0, 0.5, 0, 0.3, 0.1] },
  lobby: { bpm: 118, key: 67, prog: [0, 5, 7, 5], minor: [0, 0, 0, 0], scale: [0, 2, 4, 7, 9], seed: 5,
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x..x.x..x..x.', chord: '..x...x...x...x.',
    density: [0.6, 0, 0.3, 0.2, 0.5, 0, 0.3, 0, 0.6, 0, 0.3, 0.2, 0.4, 0, 0.2, 0] },
  round: { bpm: 132, key: 62, prog: [0, 5, 7, 3], minor: [0, 0, 0, 0], scale: [0, 2, 4, 7, 9], seed: 23,
    kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxx.xxx.xxx.xxx.', bass: 'x.xx..x.x.xx..x.', chord: '..x...x...x...x.',
    density: [0.8, 0.2, 0.5, 0.3, 0.7, 0.1, 0.5, 0.2, 0.8, 0.2, 0.5, 0.3, 0.6, 0.1, 0.5, 0.3] },
  final: { bpm: 142, key: 60, prog: [0, 8, 3, 10], minor: [1, 0, 0, 0], scale: [0, 3, 5, 7, 10], seed: 31,
    kick: 'x..x..x.x..x..x.', snare: '....x.......x.x.', hat: 'x.xxx.xxx.xxx.xx', bass: 'xx.xx.xx.xx.xx.x', chord: 'x.....x.....x...',
    density: [0.9, 0.3, 0.6, 0.3, 0.8, 0.2, 0.6, 0.3, 0.9, 0.3, 0.6, 0.3, 0.8, 0.2, 0.6, 0.4] },
  rlgl: { bpm: 150, key: 67, prog: [0, 0, 5, 7], minor: [0, 0, 0, 0], scale: [0, 2, 4, 7, 9], seed: 404,
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x..x.x..x..x.', chord: '..x...x...x...x.',
    density: [1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.8, 0.4, 1, 0, 0.6, 0] },
  podium: { bpm: 120, key: 67, prog: [0, 5, 0, 7], minor: [0, 0, 0, 0], scale: [0, 2, 4, 7, 9, 11], seed: 77,
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x...x...x...x...', chord: 'x...x...x...x...',
    density: [0.9, 0, 0.5, 0, 0.9, 0, 0.5, 0, 0.9, 0, 0.5, 0, 0.9, 0, 0.7, 0.3] },
};


export { Sound };
