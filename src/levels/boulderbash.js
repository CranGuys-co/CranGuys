// Round type: SURVIVAL (or FINAL) — "Boulder Bash". Cannons around a round arena fire rolling boulders across
// it, faster and more often as time goes on; two spinning bumper posts send them (and you) flying.
// Get bowled off the edge into the slime and you're out.
import { Kit, C, T_PLAY } from './kit.js';
import { SURF } from '../sim/config.js';
function buildBoulderBash(seed, variant) {
  const K = new Kit();
  const fin = variant === 'final', R = fin ? 11.5 : 16, nc = fin ? 6 : 8;
  K.cyl([0, -0.6, 0], R, 0.6, { vis: { c: C.peach, c2: C.cream, m: 'rings' } });
  K.deco({ shape: 'ring', p: [0, -0.3, 0], r: R + 0.4, vis: { c: C.hotpink, m: 'plain' } });
  K.deco({ shape: 'pillar', p: [0, -18, 0], r: 3, h: 17, vis: { c: C.orange, c2: C.white, m: 'stripes' } });
  // cannons on little piers around the rim, each aimed at the middle
  const cannons = [];
  for (let i = 0; i < nc; i++) {
    const a = (i / nc) * Math.PI * 2 + 0.2, x = Math.sin(a) * (R + 2.2), z = Math.cos(a) * (R + 2.2), yaw = a + Math.PI;
    K.box([x, -0.5, z], [1.6, 0.5, 2.4], { q: [0, Math.sin(a / 2), 0, Math.cos(a / 2)], vis: { c: C.navy, c2: C.violet, m: 'stripes' } });
    K.deco({ shape: 'cannon', p: [Math.sin(a) * (R + 3.4), 0, Math.cos(a) * (R + 3.4)], yaw, vis: { c: C.navy, c2: C.yellow, m: 'plain' } });
    cannons.push({ p: [Math.sin(a) * (R + 1.6), 1.35, Math.cos(a) * (R + 1.6)], yaw });
  }
  // two spinning bumper posts circling the middle (no pillar in the centre itself: the middle is open ground)
  const posts = fin ? [] : [[3.6, 0], [-3.6, 0]];
  for (const [ox, oz] of posts) K.cyl([ox, 0.9, oz], 0.9, 0.9, { surf: SURF.BUMPER, bump: 11, kin: { type: 'spin', c: [0, 0.9, 0], axis: [0, 1, 0], w: 0.55 }, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } });

  return {
    id: 'boulderbash', type: 'survival', name: 'Boulder Bash', desc: 'Dodge the boulders — don’t get bowled off!', descFinal: 'Last bean in the arena wins the crown!',
    tip: 'Boulders roll in from the cannons on the rim. Watch for the puff of smoke and sidestep — and stay away from the edge!',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards,
    timeLimit: 150, timeLimitFinal: 300, slimeY: -4.5, theme: 'sunset', noClock: true, arena: { R },
    // boulder spawner (see Match.boulderStep): picks a cannon, fires roughly at the middle; speeds up over time
    boulders: { cannons, every: fin ? 1.3 : 1.15, min: fin ? 0.42 : 0.38, ramp: 70, speed: [6.5, 11], spread: 0.55, r: 1.15, start: T_PLAY + 2.5 },
    rules: { killY: -3, respawn: false, checkpoints: [{ spawn: [0, 0, 0], spread: [6, 6], yaw: 0, box: [0, 0, 0, 0, 0, 0] }] },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const r = 2.6 + (R - 4.2) * Math.sqrt((i + 0.5) / Math.max(1, n)), a = i * 2.39996; const x = Math.cos(a) * r, z = Math.sin(a) * r; out.push([x, 0, z, Math.atan2(-x, -z)]); }
      return out;
    },
    bot: { dodge: true },
    cam: fin ? [{ e: [0, 22, -26], l: [0, 0, 0] }, { e: [18, 9, 4], l: [0, 1, 0] }, { e: [0, 8, -16], l: [0, 1, 0] }]
      : [{ e: [0, 30, -36], l: [0, 0, 0] }, { e: [24, 12, 6], l: [0, 1, 0] }, { e: [-10, 8, -20], l: [0, 1, 0] }, { e: [0, 9, -21], l: [0, 1, 0] }],
  };
}


export { buildBoulderBash };
