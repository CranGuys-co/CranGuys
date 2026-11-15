// Round type: RACE — "Rope Rumble". An endurance race along one extra-long inflatable bridge while two giant
// mascots at either end crank a huge glowing foam jump rope round and round over it. The rope sweeps the whole
// bridge at once, so everyone has to jump it together; its shadow slides across the floor to help with timing.
// Now and then the mascots stall the rope at the top of its arc (a fake-out) and then whip it down fast.
// Halfway along, the walkway narrows; slippery patches and side fans (that only push beans in mid-air) shove
// jumpers toward the unguarded edges. Get clipped and the rope flings you off — and a fall means starting over.
import { Kit, C, T_PLAY } from './kit.js';
import { SURF } from '../sim/config.js';
import { qt, mulberry32 } from '../sim/math.js';
// R: rope radius around the axis; H: axis height (rope bottom skims the bridge at y≈0.5)
const ROPE = { R: 9, H: 9.5, r: 0.36, z0: -15, z1: 177, start: T_PLAY + 1.2, wide: 4.5, narrow: 2.5, mid: 84, end: 160 };
const TAU = Math.PI * 2;

// The rope's whole performance, decided by the seed (identical on every machine): a list of segments
// {t, d, a0, a1, kind}. Angle 0 = rope at the bottom, π = straight up. Revolutions speed up over the round;
// fake-outs stall at the top for a moment and then come down much faster than normal.
function ropePlan(seed, dur = 240) {
  const r = mulberry32((seed ^ 0x51ed) >>> 0), out = [];
  let t = ROPE.start, a = Math.PI, k = 0;
  while (t < T_PLAY + dur) {
    const prog = Math.min(1, (t - ROPE.start) / 150);
    const T = 4.1 - 1.0 * prog + (r() - 0.5) * 0.3;              // one turn: ~4 s, down to ~3 s (a nice steady rhythm)
    const fake = k >= 3 && r() < 0.16 + 0.24 * prog;
    if (fake) { const d = 0.7 + r() * 1.0; out.push({ t, d, a0: a, a1: a, kind: 'stall' }); t += d; }
    const down = (fake ? 0.33 : 0.5) * T, up = 0.5 * T;
    out.push({ t, d: down, a0: a, a1: a + Math.PI, kind: fake ? 'whip' : 'down' }); t += down; a += Math.PI;
    out.push({ t, d: up, a0: a, a1: a + Math.PI, kind: 'up' }); t += up; a += Math.PI;
    k++;
  }
  return out;
}
function ropeSeg(plan, t) {
  if (t < plan[0].t) return -1;
  let lo = 0, hi = plan.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (plan[m].t <= t) lo = m; else hi = m - 1; }
  return lo;
}
// rope angle at time t: swinging down it speeds up toward the bottom, swinging up it slows toward the top
function ropeAngle(plan, t) {
  const i = ropeSeg(plan, t); if (i < 0) return Math.PI;
  const s = plan[i], u = Math.min(1, (t - s.t) / s.d);
  if (s.kind === 'stall') return s.a0 + Math.sin(u * TAU * 1.5) * 0.09 * (1 - u); // a little tease at the top
  if (s.kind === 'up') return s.a0 + Math.PI * Math.sin(u * Math.PI / 2);
  return s.a0 + Math.PI * (1 - Math.cos(u * Math.PI / 2));
}
// When will the rope next sweep through x (in the lower half)? Used by bots and the UI hint.
function ropeNextHit(plan, t, x = 0) {
  const off = Math.asin(Math.max(-1, Math.min(1, x / ROPE.R)));
  for (let i = Math.max(0, ropeSeg(plan, t)); i < plan.length; i++) {
    const s = plan[i]; if (s.kind === 'up' || s.kind === 'stall') continue;
    // down segment ends at the bottom (a1 ≡ 0 mod 2π); the rope reaches x a hair before/after that
    const tb = s.t + s.d, w = Math.PI * Math.PI / (2 * s.d);   // angular speed at the bottom
    const th = tb + off / w;
    if (th > t) return { t: th, fast: s.kind === 'whip', seg: i };
  }
  return null;
}

function buildJumpRope(seed) {
  const K = new Kit(), R = ROPE;
  const plan = ropePlan(seed), fa = (t) => ropeAngle(plan, t);
  const S = (c, c2 = C.white) => ({ c, c2, m: 'stripes' });
  const panelCols = [[C.hotpink, C.bubble], [C.sky, C.white], [C.yellow, C.cream], [C.mint, C.white]];

  // start pad sits low, so the rope swings harmlessly over the waiting beans; a ramp leads up onto the bridge
  K.box([0, -3.5, -2], [12, 1, 8], { vis: S(C.purple, C.violet) });
  K.ramp(-6, 6, 6, -2.5, 12, 0, 1.2, { vis: S(C.lilac, C.white) });
  K.deco({ shape: 'gate', p: [0, -2.5, 4.6], w: 24, h: 6, vis: { c: C.purple, c2: C.yellow, m: 'plain', text: 'JUMP!' } });

  // the bridge: inflatable panels, wide then narrow from the halfway mark; some panels are slippery
  const ice = [[34, 41], [56, 63], [96, 102], [124, 131], [146, 152]];
  const isIce = (z0, z1) => ice.some(([a, b]) => z0 >= a && z1 <= b);
  let i = 0;
  const cuts = [12, 20, 27, 34, 41, 48, 56, 63, 70, 77, R.mid, 90, 96, 102, 109, 117, 124, 131, 139, 146, 152, R.end];
  for (let j = 0; j < cuts.length - 1; j++, i++) {
    const z0 = cuts[j], z1 = cuts[j + 1], hw = z0 >= R.mid ? R.narrow : R.wide, slick = isIce(z0, z1);
    const [c, c2] = panelCols[i % panelCols.length];
    K.box([0, -0.6, (z0 + z1) / 2], [hw, 0.6, (z1 - z0) / 2], slick ? { surf: SURF.ICE, vis: { c: C.ice, c2: C.white, m: 'ice' } } : { vis: { c, c2, m: 'bouncy' } });
    // puffy inflatable side tubes under the edge (decor only: the edges are unguarded)
    for (const sd of [-1, 1]) K.deco({ shape: 'sph', p: [sd * (hw + 0.1), -0.75, (z0 + z1) / 2], r: 0.7, vis: { c: c2 === C.white ? c : c2 } });
  }
  // finish pad beyond the end of the bridge
  K.box([0, -0.6, R.end + 9], [8, 0.6, 9], { vis: S(C.yellow, C.cream) });
  K.deco({ shape: 'arch', p: [0, 0, R.end + 1.5], w: 14, h: 8, vis: { c: C.yellow, c2: C.hotpink, m: 'plain', text: 'FINISH' } });

  // side fans: crosswinds that only push beans who are in the air, blowing toward the open edge
  const fans = [];
  [[30, 1], [50, -1], [68, 1], [92, -1], [108, 1], [120, -1], [136, 1], [150, -1]].forEach(([fz, dir], k) => {
    const hw = fz >= R.mid ? R.narrow : R.wide, cyc = { period: 4.6, on: 2.6, ph: k * 1.37 };
    K.trig({ shape: 'box', p: [0, 2.2, fz], h: [hw + 3, 2.6, 4.2], kind: 'wind', wind: [dir * 3.6, 0, 0], air: true, cyc });
    const fx = -dir * 9.8, hub = [fx, 2.6, fz]; // outside the rope's circle, so it never swings through them
    K.box([fx, -2.2, fz], [0.4, 4.6, 0.4], { vis: S(C.navy, C.violet) });
    K.deco({ shape: 'fan', p: hub, dir, r: 2.2, vis: { c: C.white, c2: C.blue } });
    for (const ph of [0, Math.PI / 2]) K.cap(hub, 0.24, 1.7, { ghost: true, q: qt.axis([0, 1, 0], Math.PI / 2), kin: { type: 'spin', c: hub, axis: [1, 0, 0], w: 9 * dir, ph }, vis: { c: C.sky, c2: C.white, m: 'arm' } });
    fans.push({ z: fz, dir, hub, cyc, force: 3.6 });
  });

  // THE ROPE: one long glowing foam bar circling the bridge's centre line. Hits fling you sideways.
  const zc = (R.z0 + R.z1) / 2, axisC = [0, R.H, zc];
  K.cap([0, R.H - R.R, zc], R.r, (R.z1 - R.z0) / 2, {
    q: qt.axis([0, 1, 0], Math.PI / 2), knock: 13, knockSV: 0.75, knockAny: true,
    kin: { type: 'fnA', fa, c: axisC, axis: [0, 0, 1] }, vis: { c: C.yellow, c2: C.hotpink, m: 'arm', tk: 'rope' },
  });
  // its shadow: a dark stripe straight below the rope, on the wide and the narrow part
  for (const [z0, z1, hw] of [[12, R.mid, R.wide], [R.mid, R.end, R.narrow]]) {
    K.box([0, 0.02, (z0 + z1) / 2], [0.55, 0.02, (z1 - z0) / 2 - 0.05], {
      ghost: true, kin: { type: 'fn', fn: (t) => { const x = R.R * Math.sin(fa(t)); return Math.abs(x) < hw - 0.3 ? [x, 0, 0] : null; } },
      vis: { c: '#2a1d55', m: 'plain', tk: 'shadow' },
    });
  }
  // the mascots' towers and the crank arms they turn (the mascots themselves are drawn by the client)
  for (const [tz, face] of [[R.z0, 1], [R.z1, -1]]) {
    K.box([0, -3.5, tz - face * 5.5], [3.6, 6.2, 3.6], { vis: S(C.navy, C.purple) });
    K.cyl([0, R.H, tz], 1.1, 0.5, { ghost: true, q: qt.axis([1, 0, 0], Math.PI / 2), kin: { type: 'fnA', fa, c: [0, R.H, tz], axis: [0, 0, 1] }, vis: { c: C.white, c2: C.hotpink, m: 'stripes' } });
    K.cap([0, R.H - R.R / 2, tz], 0.42, R.R / 2, { ghost: true, q: qt.axis([0, 0, 1], Math.PI / 2), kin: { type: 'fnA', fa, c: [0, R.H, tz], axis: [0, 0, 1] }, vis: { c: C.white, c2: C.purple, m: 'stripes' } });
  }

  return {
    id: 'jumprope', type: 'race', name: 'Rope Rumble', desc: 'Jump the giant rope all the way across the bridge!', tip: 'Watch the rope’s shadow and jump as it sweeps in. It sometimes stops at the top — wait for it! Fall off and you start again.',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, fans,
    timeLimit: 210, slimeY: -8, theme: 'sunset', rope: { ...ROPE, plan, fa, mascots: [[0, 2.7, ROPE.z0 - 5.5, 0], [0, 2.7, ROPE.z1 + 5.5, Math.PI]] },
    finish: [-9, -1, R.end + 0.5, 9, 9, R.end + 16],
    rules: {
      killY: -5.5, respawn: true,
      // only one checkpoint: a fall sends you all the way back to the start
      checkpoints: [{ spawn: [0, -2.5, -1], spread: [16, 7], yaw: 0, box: [0, 0, 0, 0, 0, 0] }],
    },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const col = i % 10, row = Math.floor(i / 10); out.push([-10.35 + col * 2.3, -2.5, 4.5 - row * 2.1, 0]); }
      return out;
    },
    bot: {
      rope: true,
      route: [
        { p: [0, -2.5, 7], w: 4 }, { p: [0, 0, 14], w: 3.2, act: 'rope' }, { p: [0, 0, 45], w: 2.8, act: 'rope' }, { p: [0, 0, R.mid - 2], w: 2.2, act: 'rope' },
        { p: [0, 0, R.mid + 6], w: 0.9, act: 'rope' }, { p: [0, 0, 125], w: 0.8, act: 'rope' }, { p: [0, 0, R.end + 4], w: 1, act: 'rope' },
      ],
    },
    cam: [
      { e: [0, 16, R.end + 26], l: [0, 4, R.end - 4] }, { e: [17, 11, 128], l: [0, 2, 114] }, { e: [-18, 13, 92], l: [0, 2, 80] }, { e: [17, 12, 54], l: [0, 2, 44] },
      { e: [16, 9, 22], l: [0, 2, 26] }, { e: [0, 6, -22], l: [0, 1, 4] },
    ],
  };
}


export { ROPE, ropePlan, ropeSeg, ropeAngle, ropeNextHit, buildJumpRope };
