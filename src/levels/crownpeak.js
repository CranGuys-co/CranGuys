// Round type: FINAL — "Crown Peak". Climb an ascending mountain while boulders roll down at you,
// scale the terrace wall (grab the ledge!) and snatch the floating crown as it drifts around the summit.
import { Kit, C, T_PLAY } from './kit.js';
import { SURF } from '../sim/config.js';
const slopeY = (z, z0, y0, z1, y1) => y0 + ((z - z0) / (z1 - z0)) * (y1 - y0);

// one cannon per boulder lane: each flashes twice (≈0.9 s and 0.45 s) before it fires
const CANNON_XS = [-8.5, -4.2, 0, 4.2, 8.5];
const CROWN = { c: [0, 29.0, 135], rx: 6.5, rz: 4.2, period: 14, bob: 0.3 };
function crownAt(t) {
  const a = ((t - T_PLAY) / CROWN.period) * Math.PI * 2;
  return [CROWN.c[0] + Math.sin(a) * CROWN.rx, CROWN.c[1] + Math.sin(t * 2.1) * CROWN.bob, CROWN.c[2] + Math.sin(a * 2) * CROWN.rz];
}

function buildCrownPeak(seed) {
  const K = new Kit();
  const S = (c, c2 = C.white) => ({ c, c2, m: 'stripes' });
  // start
  K.box([0, -1, 1], [12, 1, 7], { vis: S(C.purple, C.violet) });
  // hill 1 (z 8..40, y 0..9) with bumpers
  K.ramp(-11, 11, 8, 0, 40, 9, 1.4, { vis: { c: C.mint, c2: C.white, m: 'grass' } });
  [[-6, 16], [4, 19], [-2, 25], [7, 28], [-8, 33], [2, 35]].forEach(([x, z]) => K.cyl([x, slopeY(z, 8, 0, 40, 9) + 0.6, z], 0.9, 1.2, { surf: SURF.BUMPER, bump: 9, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } }));
  // landing 1 + sweeper
  K.box([0, 8, 46], [12, 1, 6], { vis: S(C.yellow, C.cream) });
  K.sweeper([0, 9, 46], { w: 1.0, hl: 11.6, arms: [{ y: 0.55, ph: 0 }], col: C.purple });
  // hill 2 (z 52..84, y 9..18): conveyor side lanes pull you back down, bouncy pads in the middle
  const a2 = Math.atan2(9, 32), d2 = [0, Math.sin(a2), Math.cos(a2)], sp = -3.2;
  K.ramp(-11, -5, 52, 9, 84, 18, 1.4, { surf: SURF.CONVEYOR, conv: d2.map((x) => x * sp), vis: { c: C.purple, c2: C.yellow, m: 'conveyor', spd: sp } });
  K.ramp(5, 11, 52, 9, 84, 18, 1.4, { surf: SURF.CONVEYOR, conv: d2.map((x) => x * sp), vis: { c: C.purple, c2: C.yellow, m: 'conveyor', spd: sp } });
  K.ramp(-5, 5, 52, 9, 84, 18, 1.4, { vis: { c: C.mint, c2: C.white, m: 'grass' } });
  K.ramp(-3.5, 3.5, 63, slopeY(63, 52, 9, 84, 18) + 0.25, 67, slopeY(67, 52, 9, 84, 18) + 0.25, 0.5, { surf: SURF.BOUNCY, launch: [0, 14.5, 6.5], vis: { c: C.lime, c2: C.yellow, m: 'bouncy' } });
  // landing 2 and the terrace wall (z=94): side steps are jumpable, the middle needs a ledge grab
  K.box([0, 17, 89], [12, 1, 5], { vis: S(C.sky, C.white) });
  for (const s of [-1, 1]) K.box([s * 9, 18.32, 92.75], [2.2, 0.33, 1.25], { vis: S(C.orange, C.cream) });
  K.box([0, 18.95, 99], [12, 0.95, 5], { vis: { c: C.lilac, c2: C.white, m: 'bricks' } });
  K.sweeper([0, 19.9, 99.5], { w: -0.9, hl: 11.6, arms: [{ y: 0.55, ph: 0 }, { y: 1.85, ph: Math.PI / 2, r: 0.36 }], col: C.hotpink, poleH: 2.6 });
  // hill 3 (z 104..124, y 19.9..26)
  K.ramp(-11, 11, 104, 19.9, 124, 26, 1.4, { vis: { c: C.mint, c2: C.white, m: 'grass' } });
  // summit (z 124..146, top 26)
  K.box([0, 25, 135], [12, 1, 11], { vis: S(C.hotpink, C.bubble) });
  for (const s of [-1, 1]) K.cyl([s * 8.5, 26.9, 129], 0.85, 0.9, { surf: SURF.BUMPER, bump: 10, vis: { c: C.yellow, c2: C.white, m: 'bumper' } });
  // boulder cannons + crown pedestal (decor)
  for (const x of CANNON_XS) K.deco({ shape: 'cannon', p: [x, 26, 125.8], vis: { c: C.navy, c2: C.yellow, m: 'plain' } });
  K.deco({ shape: 'ring', p: [0, 26.05, 135], r: 7.5, vis: { c: C.gold, m: 'plain' } });

  return {
    id: 'crownpeak', type: 'final', name: 'Crown Peak', desc: 'Grab the crown at the summit to win!', tip: 'Boulders roll down the mountain. Hold GRAB at the terrace wall to climb, then leap for the crown.',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards,
    timeLimit: 210, slimeY: -9, theme: 'sunset', crown: CROWN,
    boulders: { every: 1.05, r: 1.3, z: 122.5, y: 27.9, xs: CANNON_XS, start: T_PLAY + 1.7, lead: 1.3 },
    rules: {
      killY: -6, respawn: true,
      checkpoints: [
        { spawn: [0, 0, 1], spread: [16, 8], yaw: 0, box: [0, 0, 0, 0, 0, 0] },
        { spawn: [0, 9, 43], spread: [16, 4], yaw: 0, box: [-12, 8, 40, 12, 16, 52] },
        { spawn: [0, 18, 87], spread: [16, 4], yaw: 0, box: [-12, 17, 84, 12, 24, 94] },
        { spawn: [0, 19.9, 98], spread: [16, 4], yaw: 0, box: [-12, 19, 94, 12, 26, 104] },
      ],
    },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const col = i % 8, row = Math.floor(i / 8); out.push([-8.4 + col * 2.4, 0, 5 - row * 2.2, 0]); }
      return out;
    },
    bot: {
      route: [
        { p: [0, 0, 8], w: 8 }, { p: [0, 9, 40], w: 9 }, { p: [0, 9, 52], w: 4 }, { p: [0, 18, 84], w: 3 },
        { p: [9, 18.65, 92.5], w: 1.2, mirror: true }, { p: [9, 19.9, 96.5], w: 1.2, mirror: true }, { p: [0, 19.9, 104], w: 8 },
        { p: [0, 26, 125], w: 8 }, { p: [0, 26, 133], w: 4, act: 'crown' },
      ],
    },
    cam: [
      { e: [0, 34, 152], l: [0, 28, 135] }, { e: [18, 30, 118], l: [0, 22, 100] }, { e: [-16, 22, 80], l: [0, 15, 66] },
      { e: [16, 16, 44], l: [0, 8, 34] }, { e: [0, 7, -12], l: [0, 2, 8] },
    ],
  };
}


export { CANNON_XS, CROWN, crownAt, buildCrownPeak };
