// Round type: SURVIVAL (or FINAL) — "Colour Clash". A grid of coloured tiles; the big screen shows a colour and
// a countdown, then every tile of any other colour sinks into the slime. The tiles come back with new colours and
// it all happens again, a little quicker, with fewer safe tiles each time.
// Everything is a pure function of the level seed and time, so it needs no network traffic at all.
import { Kit, C, T_PLAY } from './kit.js';
import { mulberry32 } from '../sim/math.js';
const CM_COLORS = [
  { name: 'PINK', hex: '#ff5fa2' }, { name: 'BLUE', hex: '#36b9ff' }, { name: 'YELLOW', hex: '#ffd23f' },
  { name: 'GREEN', hex: '#40e0a8' }, { name: 'PURPLE', hex: '#9b5cff' }, { name: 'ORANGE', hex: '#ff8a3d' },
];
const CM = { size: 4.1, gap: 0.35, sink: 6.5, drop: 2.4, back: 0.8, start: T_PLAY + 1.5 };

// The schedule: cycle c starts at plan[c].t; `show` seconds of looking (the colour appears after `ready`),
// then CM.drop seconds with the wrong tiles sunk, then CM.back seconds rising again. The countdown gets
// quicker every single cycle: 6 s at first, under 2 s by the end.
function cmPlan(seed, ntiles) {
  const out = []; let t = CM.start;
  for (let c = 0; c < 120; c++) {
    const k = Math.min(1, c / 9), r = mulberry32(((seed ^ 0xc01042) + c * 7919) >>> 0);
    const show = Math.max(1.8, 6.4 * Math.pow(0.87, c)), ready = Math.min(1.2, show * 0.25);
    const ncol = c < 2 ? 4 : c < 5 ? 5 : 6;
    const target = Math.floor(r() * ncol);
    const safe = Math.max(1, Math.round((ntiles / ncol) * (1.15 - k * 0.65)));
    const col = new Uint8Array(ntiles);
    for (let i = 0; i < ntiles; i++) { let v = Math.floor(r() * (ncol - 1)); if (v >= target) v++; col[i] = v; } // nothing safe yet
    const idx = Array.from({ length: ntiles }, (_, i) => i); // Fisher-Yates (sort() with a random comparator differs between browsers)
    for (let i = ntiles - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; }
    for (let i = 0; i < safe; i++) col[idx[i]] = target;
    out.push({ t, show, ready, target, col, end: t + show + CM.drop + CM.back });
    t += show + CM.drop + CM.back;
  }
  return out;
}
function cmCycle(plan, t) {
  if (t < plan[0].t) return null;
  let lo = 0, hi = plan.length - 1, i = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (plan[m].t <= t) { i = m; lo = m + 1; } else hi = m - 1; }
  return plan[i];
}
// 'wait' (before the first cycle) | 'ready' | 'show' (colour known, countdown running) | 'drop' | 'back'
function cmPhase(P, t) {
  if (!P) return 'wait';
  const u = t - P.t;
  return u < P.ready ? 'ready' : u < P.show ? 'show' : u < P.show + CM.drop ? 'drop' : 'back';
}
// how far tile i is sunk (0 = level, 1 = fully under) at time t
function cmSink(plan, i, t) {
  const P = cmCycle(plan, t); if (!P || P.col[i] === P.target) return 0;
  const u = t - P.t - P.show;
  if (u < 0) return 0;
  if (u < 0.4) return u / 0.4;
  if (u < CM.drop) return 1;
  return Math.max(0, 1 - (u - CM.drop) / CM.back);
}

function buildColorMatch(seed, variant) {
  const K = new Kit();
  const fin = variant === 'final', N = fin ? 5 : 7, step = CM.size + CM.gap, half = ((N - 1) * step) / 2; // a big 7x7 grid (5x5 in a final)
  const plan = cmPlan(seed, N * N), cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = cells.length, x = -half + c * step, z = -half + r * step;
    const fn = (t) => [0, -cmSink(plan, i, t) * CM.sink, 0];
    K.box([x, -0.45, z], [CM.size / 2, 0.45, CM.size / 2], { noLedge: true, kin: { type: 'fn', fn }, vis: { c: C.white, c2: '#e8e2f2', m: 'checker', cm: i } });
    cells.push({ i, x, z });
  }
  // frame around the grid (decor) and the big colour screen behind it
  K.deco({ shape: 'ring', p: [0, -0.9, 0], r: half + step * 0.75, vis: { c: C.yellow, m: 'plain' } });
  K.deco({ shape: 'pillar', p: [0, -20, 0], r: 2.5, h: 18, vis: { c: C.violet, c2: C.white, m: 'stripes' } });
  const sz = half + step + 4;
  for (const s of [-1, 1]) K.deco({ shape: 'pillar', p: [s * 7.5 * (fin ? 1 : 1.35), -8, sz + 0.4], r: 0.7, h: 16 * (fin ? 1 : 1.2), vis: { c: C.navy, c2: C.violet, m: 'stripes' } });
  const sw = fin ? 1 : 1.35; // the screen grows with the grid
  K.box([0, 10.5 * sw, sz + 0.9], [8.6 * sw, 3.4 * sw, 0.25], { ghost: true, vis: { c: C.navy, m: 'plain' } });                         // screen frame
  K.box([0, 10.5 * sw, sz + 0.6], [7.8 * sw, 2.8 * sw, 0.1], { ghost: true, kin: { type: 'fn', fn: () => [0, 0, 0] }, vis: { c: C.white, m: 'plain', cmScreen: 1 } }); // the colour itself
  for (const s of [-1, 1]) K.deco({ shape: 'sph', p: [s * 8.6 * (fin ? 1 : 1.35), 14.2 * (fin ? 1 : 1.35), sz + 0.9], r: 0.8, vis: { c: C.yellow } });

  return {
    id: 'colormatch', type: 'survival', name: 'Colour Clash', desc: 'Stand on the colour on the big screen!', descFinal: 'Last bean standing wins the crown!',
    tip: 'When the screen shows a colour, get onto a tile of that colour before the countdown ends — every other tile sinks!',
    goal: 'Find the right colour!',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, cm: { plan, cells, N, half },
    timeLimit: 150, timeLimitFinal: 300, slimeY: -3.6, theme: 'dusk', noClock: true,
    rules: { killY: -2.6, respawn: false, checkpoints: [{ spawn: [0, 0, 0], spread: [6, 6], yaw: 0, box: [0, 0, 0, 0, 0, 0] }] },
    spawns(n) {
      const out = [], w = half * 2 + CM.size - 1.6;
      for (let i = 0; i < n; i++) { const a = (i * 0.618034) % 1, b = (i * 0.754877) % 1; out.push([-w / 2 + a * w, 0, -w / 2 + b * w, 0]); }
      return out;
    },
    bot: { colors: true },
    cam: fin ? [{ e: [0, 30, -30], l: [0, 0, 2] }, { e: [20, 12, -8], l: [0, 1, 2] }, { e: [0, 12, -24], l: [0, 2, 6] }]
      : [{ e: [0, 40, -40], l: [0, 0, 3] }, { e: [28, 15, -10], l: [0, 1, 2] }, { e: [0, 14, -30], l: [0, 2, 8] }],
  };
}


export { CM_COLORS, CM, cmPlan, cmCycle, cmPhase, cmSink, buildColorMatch };
