// Round type: RACE — "Whirl Way". Conveyor climb, sweeper arena, door dash, ice chute + bouncy pads,
// spinning discs, bumper field, finish arch.
import { Kit, C, T_PLAY } from './kit.js';
import { SURF } from '../sim/config.js';
import { qt } from '../sim/math.js';
function buildWhirlWay(seed) {
  const K = new Kit();
  const stripes = (c, c2 = C.white) => ({ c, c2, m: 'stripes' });

  // 1) start pad (z -6..12, top y=0)
  K.box([0, -1, 3], [13, 1, 9], { vis: stripes(C.pink, C.bubble) });
  K.deco({ shape: 'gate', p: [0, 0, 12.2], w: 26, h: 7, vis: { c: C.purple, c2: C.yellow, m: 'plain', text: 'GO!' } });

  // 2) conveyor climb (z 12..40, y 0 -> 4), four lanes alternating against/with you
  const ang = Math.atan2(4, 28), dir = [0, Math.sin(ang), Math.cos(ang)];
  [[-12, -6, -3.4], [-6, 0, 1.8], [0, 6, -3.4], [6, 12, 1.8]].forEach(([x0, x1, sp]) => {
    K.ramp(x0, x1, 12, 0, 40, 4, 1.2, { surf: SURF.CONVEYOR, conv: [dir[0] * sp, dir[1] * sp, dir[2] * sp], vis: { c: sp < 0 ? C.purple : C.blue, c2: C.yellow, m: 'conveyor', spd: sp } });
  });
  K.rails(12.45, 12, 0, 40, 4);

  // 3) sweeper arena (z 40..86, top y=4)
  K.box([0, 3, 63], [14, 1, 23], { vis: stripes(C.sky, C.white) });
  K.sweeper([0, 4, 53], { w: 1.15, hl: 12.6, arms: [{ y: 0.55, ph: 0 }] });
  K.sweeper([0, 4, 74], { w: -1.0, hl: 12.6, arms: [{ y: 0.55, ph: 0 }, { y: 1.85, ph: Math.PI / 2, r: 0.36 }], col: C.hotpink });
  for (const s of [-1, 1]) K.cyl([s * 13, 4.9, 63], 0.9, 0.9, { surf: SURF.BUMPER, bump: 9, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } });

  // 4) door dash (z 86..124, top y=4): three rows of six doors; which ones break is a server secret
  K.box([0, 3, 105], [13, 1, 19], { vis: stripes(C.yellow, C.cream) });
  const doorX = [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5], doors = [];
  const doorCols = [C.pink, C.blue, C.mint, C.orange, C.violet, C.lime];
  [95, 105, 115].forEach((z, row) => {
    for (let i = 0; i < 7; i++) K.box([-12.6 + i * 4.2, 6.25, z], [0.22, 2.25, 0.38], { vis: { c: C.white, m: 'plain' } });
    K.box([0, 7.75, z], [12.8, 0.75, 0.38], { vis: stripes(C.purple, C.violet) });
    doorX.forEach((x, i) => {
      const c = K.box([x, 5.5, z], [1.88, 1.5, 0.24], { dyn: K.dyn(), tag: 'door', vis: { c: doorCols[(i + row * 2) % 6], c2: C.white, m: 'door' } });
      doors.push({ id: doors.length, row, i, x, z, col: c, dyn: c.dyn });
    });
  });

  // 5) ice chute (z 124..138, 4 -> 0) into bouncy pads, over a slime gap
  K.ramp(-12, 12, 124, 4, 138, 0, 1.2, { surf: SURF.ICE, vis: { c: C.ice, c2: C.white, m: 'ice' } });
  K.rails(12.45, 124, 4, 138, 0);
  K.box([0, -0.5, 140], [12, 0.5, 2], { surf: SURF.BOUNCY, launch: [0, 15, 9], vis: { c: C.lime, c2: C.yellow, m: 'bouncy' } });
  // landing platform (z 147.5..160, top y=3)
  K.box([0, 2, 153.75], [12, 1, 6.25], { vis: stripes(C.pink, C.white) });

  // 6) spinning discs over slime
  const discs = [[-5, 167, 0.7, C.blue], [3, 175, -0.8, C.orange], [-3, 183.5, 0.9, C.violet]];
  discs.forEach(([x, z, w, col]) => K.cyl([x, 2.6, z], 4.2, 0.4, { kin: { type: 'spin', c: [x, 2.6, z], axis: [0, 1, 0], w }, vis: { c: col, c2: C.white, m: 'disc' } }));
  K.cap([3, 3.55, 175], 0.34, 3.9, { knock: 8, kin: { type: 'spin', c: [3, 3.55, 175], axis: [0, 1, 0], w: 1.7 }, vis: { c: C.yellow, c2: C.white, m: 'arm' } });
  K.hazards.push({ type: 'arm', c: [3, 3.55, 175], hl: 3.9, w: 1.7, ph: 0, high: false, r: 0.34 });

  // 7) bumper field + finish (z 190..214, top y=3)
  K.box([0, 2, 202], [13, 1, 12], { vis: stripes(C.purple, C.violet) });
  [[-6, 197], [0, 199.5], [6, 197], [-9, 202], [3, 203], [9, 202]].forEach(([x, z]) => K.cyl([x, 3.9, z], 0.85, 0.9, { surf: SURF.BUMPER, bump: 10, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } }));
  K.deco({ shape: 'arch', p: [0, 3, 208], w: 26, h: 8, vis: { c: C.yellow, c2: C.hotpink, m: 'plain', text: 'FINISH' } });

  // decorative flags & backdrop

  const level = {
    id: 'whirlway', type: 'race', name: 'Whirl Way', desc: 'Race to the finish line!', tip: 'Dive under the high sweepers, jump the low ones. Not every door breaks…',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, doors,
    timeLimit: 150, slimeY: -7, theme: 'day',
    finish: [-13, 2.5, 208, 13, 14, 214.5],
    rules: {
      killY: -5, respawn: true,
      checkpoints: [
        { spawn: [0, 0, 2], spread: [18, 8], yaw: 0, box: [0, 0, 0, 0, 0, 0] },
        { spawn: [0, 4, 43.5], spread: [16, 3], yaw: 0, box: [-14, 3, 40, 14, 10, 47] },
        { spawn: [0, 4, 89], spread: [16, 3], yaw: 0, box: [-13, 3, 86, 13, 10, 92] },
        { spawn: [0, 4, 121.5], spread: [16, 2], yaw: 0, box: [-13, 3, 117, 13, 10, 124] },
        { spawn: [0, 3, 151], spread: [16, 4], yaw: 0, box: [-12, 2, 147.5, 12, 10, 158] },
        { spawn: [0, 3, 193], spread: [16, 3], yaw: 0, box: [-13, 2, 190, 13, 10, 198] },
      ],
    },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const col = i % 10, row = Math.floor(i / 10); out.push([-11.25 + col * 2.5, 0, 9 - row * 2.2, 0]); }
      return out;
    },
    // bot navigation: ordered nodes with lateral freedom
    bot: {
      route: [
        { p: [0, 0, 12], w: 10 }, { p: [0, 4, 40], w: 10 }, { p: [0, 4, 64], w: 11 }, { p: [0, 4, 86], w: 11 },
        { p: [0, 4, 95], w: 0, act: 'doors', row: 0 }, { p: [0, 4, 105], w: 0, act: 'doors', row: 1 }, { p: [0, 4, 115], w: 0, act: 'doors', row: 2 },
        { p: [0, 4, 123], w: 9 }, { p: [0, 0, 139], w: 9, act: 'pad' }, { p: [0, 3, 156], w: 6 },
        { p: [-5, 3, 167], w: 1.5, act: 'disc' }, { p: [3, 3, 175], w: 1.5, act: 'disc' }, { p: [-3, 3, 183.5], w: 1.5, act: 'disc' },
        { p: [0, 3, 195], w: 6 }, { p: [0, 3, 211], w: 9 },
      ],
    },
    cam: [
      { e: [20, 17, 222], l: [0, 4, 205] }, { e: [-16, 13, 186], l: [0, 3, 175] }, { e: [17, 14, 150], l: [0, 2, 138] },
      { e: [-15, 13, 112], l: [0, 5, 104] }, { e: [15, 13, 78], l: [0, 4, 64] }, { e: [-11, 10, 34], l: [0, 2, 26] }, { e: [0, 6.5, -12], l: [0, 1.6, 6] },
    ],
  };
  return level;
}


export { buildWhirlWay };
