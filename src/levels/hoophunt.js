// Round type: HUNT — "Hoop Hunt". Hoops keep popping up all over a round arena: jump through them for points
// (gold hoops, high above the bounce pads, are worth 5). Hoops vanish when someone takes them and reappear
// somewhere else. When the clock runs out, the highest scorers qualify. A sweeper keeps everyone hopping.
import { Kit, C, T_PLAY } from './kit.js';
import { SURF, TICK_HZ } from '../sim/config.js';
import { mulberry32 } from '../sim/math.js';
const HUNT = { slots: 8, life: 10, gap: 1.3, reach: 1.25, R: 17 };

// every place a hoop can appear: {p: centre, yaw: facing, v: points, pad: the bounce pad under it}
function makeSpots() {
  const spots = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; spots.push({ p: [Math.cos(a) * 9.6, 2.1, Math.sin(a) * 9.6], yaw: a, v: 1 }); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; spots.push({ p: [Math.cos(a) * 14, 2.1, Math.sin(a) * 14], yaw: a + Math.PI / 2, v: 1 }); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; spots.push({ p: [Math.cos(a) * 11.5, 3.25, Math.sin(a) * 11.5], yaw: a, v: 2, terrace: true }); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; spots.push({ p: [Math.cos(a) * 5.6, 4.35, Math.sin(a) * 5.6], yaw: a + Math.PI / 2, v: 5, pad: true }); }
  return spots;
}
const SPOTS = makeSpots();
// the hoop a slot shows in its gen-th appearance (pure function of the level seed)
function hoopAt(seed, slot, gen) {
  const r = mulberry32(((seed * 31 + slot * 7919 + gen * 104729) ^ 0x51f15e) >>> 0);
  r(); let i = Math.floor(r() * SPOTS.length);
  if (SPOTS[i].pad && r() < 0.45) i = Math.floor(r() * 20);   // gold hoops are rarer than their share of spots
  return SPOTS[i];
}
// is the slot's hoop out right now? (state = {hg: gens, ht: ticks each appears at})
function hoopLive(st, slot, tick) { const t0 = st.ht[slot]; return tick >= t0 && tick < t0 + HUNT.life * TICK_HZ; }
function huntStart(n = HUNT.slots) { return { hg: new Array(n).fill(0), ht: Array.from({ length: n }, (_, k) => Math.round((T_PLAY + 0.4 + k * 0.35) * TICK_HZ)) }; }

function buildHoopHunt(seed) {
  const K = new Kit();
  const R = HUNT.R;
  K.cyl([0, -0.6, 0], R, 0.6, { vis: { c: C.mint, c2: C.lime, m: 'rings' } });
  K.deco({ shape: 'ring', p: [0, -0.3, 0], r: R + 0.4, vis: { c: C.yellow, m: 'plain' } });
  K.deco({ shape: 'pillar', p: [0, -18, 0], r: 3, h: 17, vis: { c: C.teal, c2: C.white, m: 'stripes' } });
  // centre: a sweeper that keeps the middle lively
  K.sweeper([0, 0, 0], { w: 0.75, hl: R - 0.4, arms: [{ y: 0.55, ph: 0 }], col: C.purple, poleH: 3.4 });
  // four bounce pads (gold hoops float above them) and four terraces (2-point hoops)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2, x = Math.cos(a) * 5.6, z = Math.sin(a) * 5.6;
    K.cyl([x, 0.08, z], 1.35, 0.1, { surf: SURF.BOUNCY, bounce: 14.2, vis: { c: C.yellow, c2: C.orange, m: 'bouncy' } });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 11.5, z = Math.sin(a) * 11.5;
    K.box([x, 0.6, z], [1.9, 0.6, 1.9], { q: [0, Math.sin(-a / 2), 0, Math.cos(-a / 2)], vis: { c: [C.pink, C.blue, C.orange, C.violet][i], c2: C.white, m: 'stripes' } });
  }
  // a ring of bumpers around the rim
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.31; K.cyl([Math.cos(a) * (R - 0.9), 0.75, Math.sin(a) * (R - 0.9)], 0.6, 0.75, { surf: SURF.BUMPER, bump: 9, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } }); }

  return {
    id: 'hoophunt', type: 'hunt', name: 'Hoop Hunt', desc: 'Jump through hoops for points — top scorers qualify!', tip: 'Gold hoops float above the bounce pads and are worth 5. Hoops on the terraces are worth 2.',
    goal: 'Jump through the hoops!',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, hunt: HUNT,
    timeLimit: 80, slimeY: -4, theme: 'mint',
    rules: { killY: -3, respawn: true, checkpoints: [{ spawn: [0, 0, -8], spread: [12, 6], yaw: 0, box: [0, 0, 0, 0, 0, 0] }] },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const r = 7.5 + 6.5 * ((i * 0.618) % 1), a = i * 2.39996; const x = Math.cos(a) * r, z = Math.sin(a) * r; out.push([x, 0, z, Math.atan2(-x, -z)]); }
      return out;
    },
    bot: { hunt: true },
    cam: [{ e: [0, 34, -38], l: [0, 0, 0] }, { e: [26, 12, 6], l: [0, 2, 0] }, { e: [-8, 8, -18], l: [0, 2, 0] }, { e: [0, 9, -22], l: [0, 2, 0] }],
  };
}


export { HUNT, SPOTS, hoopAt, hoopLive, huntStart, buildHoopHunt };
