// Round type: SURVIVAL (or FINAL) — "Wall Rush". Candy walls sweep across a floating deck. It starts gentle and
// gets a LOT harder in three stages: walls speed up from 8 to ~19 m/s, the gaps shrink to a single block, walls
// arrive closer and closer together (stacked "double walls" by the end), and the escape blocks get nastier —
// low blocks you have to jump and high bars you have to DIVE under. Anything else shoves you off into the slime.
// Walls are rows of 2 m blocks. Six reusable wall "slots" take turns, and every block's pose is a pure function
// of time (kin type 'fn'), so the host, every guest's prediction and the bots all see exactly the same walls.
import { Kit, C, T_PLAY } from './kit.js';
import { mulberry32, clamp } from '../sim/math.js';
const WALL = { block: 2, halfH: 1.6, thick: 0.32, low: 0.85, duck: 1.15, from: 36, travel: 72, slots: 6, start: T_PLAY + 2.5 };
const GAP = 0, SOLID = 1, LOW = 2, DUCK = 3;
// difficulty stages by wave number (each wave is one wall)
const STAGE2 = 14, STAGE3 = 34;

// The whole wave schedule for a level seed: when each wall leaves, how long it takes to cross, and its pattern.
function wallPlan(seed, n) {
  const r = mulberry32((seed ^ 0x3a11) >>> 0), waves = [];
  let t = WALL.start, prevGap = Math.floor(n / 2);
  for (let w = 0; w < 220; w++) {
    const k1 = Math.min(1, w / STAGE2), k2 = clamp((w - STAGE2) / (STAGE3 - STAGE2), 0, 1), k3 = clamp((w - STAGE3) / 30, 0, 1);
    const stage = w < STAGE2 ? 1 : w < STAGE3 ? 2 : 3;
    // seconds for the 72 m pass: 9 -> 6 -> 4.6 -> 3.7 (8 m/s -> ~19 m/s)
    const move = 9 - 3.0 * k1 - 1.4 * k2 - 0.9 * k3 + (r() - 0.5) * 0.4;
    const pat = new Uint8Array(n).fill(SOLID);
    let gaps, lows, ducks;
    if (stage === 1) { gaps = k1 < 0.3 ? 3 : k1 < 0.7 ? 2 : r() < 0.5 ? 1 : 2; lows = k1 < 0.25 ? 0 : Math.round(r() * 2); ducks = 0; }
    else if (stage === 2) { gaps = r() < 0.75 ? 1 : 2; lows = 1 + Math.round(r() * (1 - k2)); ducks = r() < 0.3 + k2 * 0.5 ? 1 : 0; }
    else { gaps = 1; lows = r() < 0.6 - k3 * 0.4 ? 1 : 0; ducks = r() < 0.55 ? 1 : 0; }
    if (stage === 1) { const g0 = Math.floor(r() * n); for (let g = 0; g < gaps; g++) pat[(g0 + Math.floor((g * n) / gaps) + Math.floor(r() * 2)) % n] = GAP; }
    else {
      // the single gap moves each wall: further and further from the last one (you have to sprint for it)
      const reach = stage === 2 ? 2 + Math.round(k2 * 2) : 3 + Math.round(k3 * 3);
      let j = prevGap + Math.round((r() * 2 - 1) * reach);
      if (j < 0) j = -j; if (j >= n) j = 2 * (n - 1) - j; j = clamp(j, 0, n - 1);
      pat[j] = GAP; prevGap = j;
      if (gaps > 1) pat[(j + Math.floor(n / 2) + Math.floor(r() * 3) - 1 + n) % n] = GAP;
    }
    for (let l = 0; l < lows; l++) { const j = Math.floor(r() * n); if (pat[j] === SOLID) pat[j] = LOW; }
    for (let d = 0; d < ducks; d++) { const j = Math.floor(r() * n); if (pat[j] === SOLID) pat[j] = DUCK; }
    if (!pat.includes(GAP)) pat[Math.floor(r() * n)] = GAP;
    if (stage === 1) prevGap = pat.indexOf(GAP);
    waves.push({ t, move, pat, slot: w % WALL.slots, stage });
    // time to the next wall: 5.6 -> 2.8 -> 1.8 -> 1.15 s (two walls on top of each other by the end)
    t += Math.max(1.1, 5.6 - 2.8 * k1 - 1.0 * k2 - 0.65 * k3 + (r() - 0.5) * 0.5);
  }
  return waves;
}
// which wave a slot is carrying at time t (or null)
function slotWave(plan, slot, t) {
  let lo = 0, hi = plan.length - 1, idx = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (plan[m].t <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
  for (let w = idx; w >= 0 && w > idx - 14; w--) { const W = plan[w]; if (W.slot === slot && t < W.t + W.move) return W; }
  return null;
}
// when each difficulty stage starts (for the "faster!" warnings)
const stageTimes = (plan) => [plan[STAGE2].t, plan[STAGE3].t];
const wallZ = (W, t) => WALL.from - WALL.travel * ((t - W.t) / W.move);

function buildWallRush(seed, variant) {
  const K = new Kit();
  const fin = variant === 'final', n = fin ? 8 : 12, half = (n * WALL.block) / 2, depth = fin ? 10 : 14;
  const plan = wallPlan(seed, n);
  // the deck
  K.box([0, -1, 0], [half, 1, depth], { vis: { c: C.sky, c2: C.white, m: 'checker' } });
  for (const s of [-1, 1]) K.deco({ shape: 'pillar', p: [s * (half - 3), -16, s * (depth - 3)], r: 1.6, h: 15, vis: { c: C.violet, c2: C.white, m: 'stripes' } });
  // wall launch gantry (decor) where the walls come from, and the drop-off edge they leave by
  for (const s of [-1, 1]) K.deco({ shape: 'pillar', p: [s * (half + 1.6), -6, WALL.from - 6], r: 0.9, h: 14, vis: { c: C.yellow, c2: C.hotpink, m: 'stripes' } });
  K.deco({ shape: 'gate', p: [0, 2, depth + 3.2], w: half * 2 + 2, h: 4.6, vis: { c: C.hotpink, c2: C.yellow, m: 'plain', text: 'WALLS!' } });
  // the walls: slots x blocks, each moved by a time function
  const walls = [];
  for (let s = 0; s < WALL.slots; s++) for (let j = 0; j < n; j++) {
    const x = -half + WALL.block * (j + 0.5);
    const fn = (t) => {
      const W = slotWave(plan, s, t); if (!W || W.pat[j] === GAP) return null;
      const k = W.pat[j];
      return [0, k === LOW ? WALL.low - 2 * WALL.halfH : k === DUCK ? WALL.duck : 0, wallZ(W, t)];
    };
    K.box([x, WALL.halfH, 0], [WALL.block / 2 - 0.04, WALL.halfH, WALL.thick], { noLedge: true, kin: { type: 'fn', fn }, vis: { c: C.white, c2: '#e4d8f5', m: j % 2 ? 'stripes' : 'bricks', wb: { s, j } } }); // coloured by type at draw time
  }
  walls.push({ n, half });

  return {
    id: 'wallrush', type: 'survival', name: 'Wall Rush', desc: 'Dodge the walls — find a gap or hop the low blocks!', descFinal: 'Last bean on the deck wins the crown!',
    tip: 'Run to the gap, jump the short blocks and DIVE under the raised bars. It gets much faster — don’t get pushed off the back!',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, wall: { plan, n, half, depth, stages: stageTimes(plan) },
    timeLimit: 150, timeLimitFinal: 300, slimeY: -4.5, theme: 'day', noClock: true,
    rules: { killY: -3, respawn: false, checkpoints: [{ spawn: [0, 0, 0], spread: [8, 8], yaw: 0, box: [0, 0, 0, 0, 0, 0] }] },
    spawns(cnt) {
      const out = [], cw = Math.ceil(Math.sqrt(cnt * 1.4)), rows = Math.ceil(cnt / cw);
      for (let i = 0; i < cnt; i++) { const c = i % cw, r = Math.floor(i / cw); out.push([(-half + 1.2) + ((c + 0.5) / cw) * (half * 2 - 2.4), 0, -depth * 0.6 + ((r + 0.5) / rows) * depth * 1.0, Math.PI * 0]); }
      return out;
    },
    bot: { walls: true },
    cam: fin ? [
      { e: [0, 26, -30], l: [0, 0, 0] }, { e: [22, 14, 10], l: [0, 1, 4] }, { e: [0, 9, -20], l: [0, 1, 4] },
    ] : [
      { e: [0, 34, -40], l: [0, 0, 0] }, { e: [28, 16, 12], l: [0, 1, 6] }, { e: [-20, 10, 26], l: [0, 2, 8] }, { e: [0, 10, -24], l: [0, 1, 4] },
    ],
  };
}


export { WALL, GAP, LOW, DUCK, STAGE2, wallPlan, slotWave, stageTimes, wallZ, buildWallRush };
