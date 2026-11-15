// CranGuys — level building kit. Levels are pure functions of a seed so server & client build identical worlds.
import { qt } from '../sim/math.js';
import { TIMING } from '../sim/config.js';
// Round tick 0 is the start of the intro fly-over; play begins at T_PLAY seconds.
const T_PLAY = TIMING.intro + TIMING.countdown;

// The CranGuys candy palette
const C = {
  pink: '#ff5fa2', hotpink: '#ff2e88', bubble: '#ff9cc9', purple: '#8b4dff', violet: '#b07bff', lilac: '#d7b8ff',
  yellow: '#ffd23f', orange: '#ff8a3d', blue: '#36b9ff', sky: '#8fdcff', mint: '#40e0a8', lime: '#9be15d',
  white: '#fff4fb', cream: '#fff1d6', red: '#ff4757', cran: '#d6195a', ice: '#c8f0ff', gold: '#ffc83d',
  navy: '#3b2a86', teal: '#25cfc4', peach: '#ffb38a',
};

class Kit {
  constructor() { this.cols = []; this.trigs = []; this.decor = []; this.ndyn = 0; this.hazards = []; }
  add(c) { this.cols.push(c); return c; }
  box(p, h, o = {}) { return this.add({ shape: 'box', p, h, ...o }); }
  cyl(p, r, hh, o = {}) { return this.add({ shape: 'cyl', p, r, hh, ...o }); }
  sph(p, r, o = {}) { return this.add({ shape: 'sph', p, r, ...o }); }
  cap(p, r, hl, o = {}) { return this.add({ shape: 'cap', p, r, hl, ...o }); }
  // A sloped slab whose TOP surface runs from (z0,y0) to (z1,y1) across x0..x1.
  ramp(x0, x1, z0, y0, z1, y1, t, o = {}) {
    const dz = z1 - z0, dy = y1 - y0, L = Math.hypot(dz, dy), ang = Math.atan2(dy, dz);
    const up = [0, Math.cos(ang), -Math.sin(ang)];
    const mid = [(x0 + x1) / 2, (y0 + y1) / 2 - (up[1] * t) / 2, (z0 + z1) / 2 - (up[2] * t) / 2];
    const c = this.box(mid, [(x1 - x0) / 2, t / 2, L / 2], { q: qt.axis([1, 0, 0], -ang), ...o });
    c.slopeDir = [0, Math.sin(ang), Math.cos(ang)];
    return c;
  }
  dyn() { return this.ndyn++; }
  trig(c) { this.trigs.push(c); return c; }
  deco(d) { this.decor.push(d); return d; }
  // ramp side rails
  rails(x, z0, y0, z1, y1, o = {}) {
    for (const s of [-1, 1]) this.ramp(s * x - 0.45, s * x + 0.45, z0, y0 + 0.7, z1, y1 + 0.7, 1.4, { vis: { c: C.white, c2: C.pink, m: 'stripes' }, ...o });
  }
  // sweeper: static pole + spinning capsule arms (hazards that ragdoll beans)
  sweeper(c, { w, arms, hl, poleH = 2.8, col = C.purple }) {
    this.cyl([c[0], c[1] + poleH / 2, c[2]], 0.85, poleH / 2, { vis: { c: col, c2: C.white, m: 'stripes', pole: true } });
    this.deco({ shape: 'sph', p: [c[0], c[1] + poleH + 0.2, c[2]], r: 1.0, vis: { c: C.yellow, m: 'plain' } });
    for (const a of arms) {
      const y = c[1] + a.y;
      this.cap([c[0], y, c[2]], a.r || 0.38, hl, {
        knock: a.knock || 10, kin: { type: 'spin', c: [c[0], y, c[2]], axis: [0, 1, 0], w, ph: a.ph || 0 },
        vis: { c: a.y > 1 ? C.orange : C.yellow, c2: C.white, m: 'arm' },
      });
      this.hazards.push({ type: 'arm', c: [c[0], y, c[2]], hl, w, ph: a.ph || 0, high: a.y > 1, r: a.r || 0.38 });
    }
  }
}

// Catmull-Rom helper used by intro cameras & crown paths
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}
function pathAt(keys, u) {
  const n = keys.length - 1, f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), t = f - i;
  const k = (j) => keys[Math.max(0, Math.min(n, j))];
  return catmull(k(i - 1), k(i), k(i + 1), k(i + 2), t);
}


export { T_PLAY, C, Kit, catmull, pathAt };
