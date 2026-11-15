// Round type: RACE — "Red Light Rush". A wide open courtyard, a finish line at the far end and a giant mascot
// standing behind it. While the mascot faces away and the music plays: RUN. When the music cuts it whips
// around and a spotlight sweeps the field — anyone still moving flashes red and is sent back to the start line;
// everyone frozen glows green and is safe. Bouncy beans don't stop on a dime here (braking is slow), and
// there's nothing to hide behind — so bumping a rival just before the scan is very much allowed.
import { Kit, C, T_PLAY } from './kit.js';
import { mulberry32 } from '../sim/math.js';
// z0: start line, line: finish line, turn: how long the whip-around takes (your time to stop), sweep: spotlight
const RL = { z0: 7, line: 116, turn: 0.8, sweep: 0.45, half: 17.5, still: 0.03 };

// Green/red timings for the whole round, decided by the seed (identical on every machine).
// Greens vary a lot (including some sneaky short ones); reds hold for a few seconds.
function rlPlan(seed, dur = 240) {
  const r = mulberry32((seed ^ 0x7ed1) >>> 0), out = [];
  let t = T_PLAY, k = 0;
  while (t < T_PLAY + dur) {
    const prog = Math.min(1, k / 10);
    const g = k === 0 ? 3.4 + r() * 1.4 : r() < 0.2 + prog * 0.1 ? 1.1 + r() * 0.8 : 2.0 + r() * 3.2 - prog * 0.6;
    const red = 2.5 + r() * 1.7;
    out.push({ k, t, g, r: red }); t += g + red; k++;
  }
  return out;
}
// Where the light is at time t: 'wait' (before GO), 'green', 'turn' (music cut, mascot turning: stop now!),
// 'scan' (anyone moving gets caught). `left` = seconds left in this phase, `seg` = the green+red segment.
function rlState(plan, t) {
  if (t < plan[0].t) return { phase: 'wait', left: plan[0].t - t, seg: plan[0], k: -1 };
  let lo = 0, hi = plan.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (plan[m].t <= t) lo = m; else hi = m - 1; }
  const s = plan[lo], u = t - s.t;
  if (u < s.g) return { phase: 'green', left: s.g - u, seg: s, k: lo, u };
  if (u < s.g + RL.turn) return { phase: 'turn', left: s.g + RL.turn - u, seg: s, k: lo, u: u - s.g };
  return { phase: 'scan', left: s.g + s.r - u, seg: s, k: lo, u: u - s.g - RL.turn };
}

function buildRedLight(seed) {
  const K = new Kit(), plan = rlPlan(seed), H = RL.half;
  const S = (c, c2 = C.white) => ({ c, c2, m: 'stripes' });
  // the courtyard: one big open floor, start strip, distance bands and the finish zone
  K.box([0, -1, -1], [H, 1, 8], { vis: S(C.purple, C.violet) });                       // start area (z -9..7)
  const bands = [C.cream, C.peach];
  for (let z = RL.z0, i = 0; z < RL.line; z += 10, i++) { const z1 = Math.min(RL.line, z + 10); K.box([0, -1, (z + z1) / 2], [H, 1, (z1 - z) / 2], { vis: { c: bands[i % 2], c2: C.white, m: 'plain' } }); }
  K.box([0, -1, RL.line + 10], [H, 1, 10], { vis: S(C.mint, C.white) });                  // safe zone (20 m past the line)
  // painted lines (thin raised strips, flush enough to run over)
  K.deco({ shape: 'box', p: [0, 0.01, RL.z0], h: [H, 0.02, 0.3], vis: { c: C.white, m: 'plain' } });
  for (let x = -H + 1; x < H; x += 2) K.deco({ shape: 'box', p: [x, 0.012, RL.line], h: [0.5, 0.02, 0.5], vis: { c: (Math.round(x) & 2) ? C.white : '#2a1d55', m: 'plain' } });
  // walls all round (no cover inside — just a fence to keep everyone in)
  for (const sd of [-1, 1]) K.box([sd * (H + 0.6), 0.7, (RL.line + 10) / 2], [0.6, 1.7, (RL.line + 30) / 2], { vis: S(C.hotpink, C.bubble) });
  K.box([0, 0.7, -9.6], [H + 1.2, 1.7, 0.6], { vis: S(C.hotpink, C.bubble) });
  K.box([0, 3, RL.line + 20.6], [H + 1.2, 4, 0.6], { vis: S(C.purple, C.violet) });
  // the mascot's pedestal (the mascot itself is drawn by the client and turns with the lights)
  K.cyl([0, 1, RL.line + 11], 2.6, 1, { vis: { c: C.yellow, c2: C.hotpink, m: 'stripes' } });
  K.deco({ shape: 'arch', p: [0, 0, RL.line + 0.4], w: 2 * H, h: 9, vis: { c: C.yellow, c2: C.hotpink, m: 'plain', text: 'SAFE ZONE' } });
  // trees along the walls (outside)
  for (const sd of [-1, 1]) for (let z = 4; z < RL.line + 18; z += 12) {
    K.deco({ shape: 'pillar', p: [sd * (H + 3.4), -1, z], r: 0.45, h: 4.2, vis: { c: C.peach, c2: C.cream } });
    K.deco({ shape: 'sph', p: [sd * (H + 3.4), 4.2, z], r: 2.1, vis: { c: (z / 12) & 1 ? C.mint : C.lime } });
  }
  // the spotlight: a bright bar of light that sweeps across the field as each scan starts
  K.box([0, 0.04, (RL.z0 + RL.line) / 2], [1.4, 0.03, (RL.line - RL.z0) / 2], {
    ghost: true,
    kin: { type: 'fn', fn: (t) => { const s = rlState(plan, t); if (s.phase !== 'scan' || s.u > RL.sweep) return null; return [-H + 1.4 + (2 * H - 2.8) * (s.u / RL.sweep), 0, 0]; } },
    vis: { c: '#fff6a0', m: 'plain', tk: 'spot' },
  });

  return {
    id: 'redlight', type: 'race', name: 'Red Light Rush', desc: 'Run on green, FREEZE on red — reach the safe zone!', tip: 'When the music stops, stop! Anyone still moving when the mascot looks is sent back to the start. Braking takes a moment…',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards,
    timeLimit: 180, slimeY: -9, theme: 'day', rl: { ...RL, plan, mascot: [0, 2, RL.line + 11] },
    finish: [-H, -1, RL.line, H, 10, RL.line + 20],
    rules: {
      killY: -5, respawn: true, brake: 17,
      checkpoints: [{ spawn: [0, 0, 0.5], spread: [30, 9], yaw: 0, box: [0, 0, 0, 0, 0, 0] }],
    },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const col = i % 12, row = Math.floor(i / 12); out.push([-15.4 + col * 2.8, 0, 5 - row * 2.3, 0]); }
      return out;
    },
    bot: { rlgl: true },
    cam: [
      { e: [0, 15, RL.line + 26], l: [0, 4, RL.line + 6] }, { e: [20, 10, 92], l: [0, 1, 78] }, { e: [-20, 11, 44], l: [0, 1, 50] }, { e: [0, 8, -16], l: [0, 1, 10] },
    ],
  };
}


export { RL, rlPlan, rlState, buildRedLight };
