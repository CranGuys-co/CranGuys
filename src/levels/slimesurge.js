// Round type: RACE — "Slime Surge". A climb out of rising slime: punching ramp, a bounce-pad wall, a spinning-bar
// deck, a staircase of turning discs, a downhill conveyor full of bumpers, sliding platforms and a sweeper deck
// before the summit. Fall in and you respawn at your last checkpoint. The slime floods the start area early on;
// after that, anyone who falls back down there is carried up to the first dry checkpoint.
import { Kit, C, T_PLAY } from './kit.js';
import { SURF } from '../sim/config.js';
const slopeY = (z, z0, y0, z1, y1) => y0 + ((z - z0) / (z1 - z0)) * (y1 - y0);
// the slime: starts a little after GO and climbs steadily; by the end it swallows the whole course
const SURGE = { t0: T_PLAY + 3, y0: -3, rate: 0.15, max: 3 };

function buildSlimeSurge(seed) {
  const K = new Kit();
  const S = (c, c2 = C.white) => ({ c, c2, m: 'stripes' });
  const rails = (z0, z1, y, x = 8.3) => { for (const s of [-1, 1]) K.box([s * x, y + 0.35, (z0 + z1) / 2], [0.3, 0.35, (z1 - z0) / 2], { vis: S(C.white, C.hotpink) }); };

  // 1) start pad (z -6..10, top 0)
  K.box([0, -1, 2], [9, 1, 8], { vis: S(C.lime, C.white) });
  K.deco({ shape: 'gate', p: [0, 0, 10.2], w: 18, h: 7, vis: { c: C.mint, c2: C.yellow, m: 'plain', text: 'CLIMB!' } });

  // 2) punching ramp (z 10..42, y 0..7): blocks shoot out from both sides, the middle line is safest
  K.ramp(-7, 7, 10, 0, 42, 7, 1.4, { vis: { c: C.mint, c2: C.white, m: 'grass' } });
  const punchers = [];
  [[16, 1, 0], [23, -1, 1.6], [30, 1, 3.1], [37, -1, 0.8]].forEach(([z, side, ph]) => {
    const y = slopeY(z, 10, 0, 42, 7) + 0.95, x = side * 9.7, w = (Math.PI * 2) / 2.8;
    K.box([x, y, z], [2.3, 0.95, 1.3], { knock: 7, knockSV: 0.42, noLedge: true, kin: { type: 'osc', d: [-side * 5.4, 0, 0], w, ph }, vis: { c: side > 0 ? C.hotpink : C.orange, c2: C.white, m: 'bumper' } });
    K.box([side * 13.2, y, z], [1.2, 1.6, 1.8], { vis: S(C.navy, C.violet) }); // the housing they punch out of
    punchers.push({ z, side, x, d: 5.4, w, ph, hx: 2.3 });
  });

  // 3) landing (z 42..50, top 7), bounce pads against a tall wall up to the bar deck (top 12)
  K.box([0, 6, 46], [8, 1, 4], { vis: S(C.yellow, C.cream) });
  K.box([0, 6.75, 52.5], [8, 0.25, 2.5], { surf: SURF.BOUNCY, launch: [0, 18, 7], vis: { c: C.lime, c2: C.yellow, m: 'bouncy' } });
  K.box([0, 9, 65.5], [8, 3, 10.5], { vis: { c: C.lilac, c2: C.white, m: 'bricks' } });          // deck B (z 55..76, top 12)
  K.sweeper([0, 12, 65.5], { w: 1.05, hl: 7.7, arms: [{ y: 0.55, ph: 0 }], col: C.purple, poleH: 2.4 });
  rails(55.5, 75.5, 12);
  for (const s of [-1, 1]) K.cyl([s * 6.6, 12.9, 59], 0.8, 0.9, { surf: SURF.BUMPER, bump: 9, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } });

  // 4) staircase of turning discs (each a metre higher than the last)
  const discs = [[-2.4, 80.5, 12.9, 0.55, C.blue], [2.4, 86.5, 13.9, -0.65, C.orange], [-2.4, 92.5, 14.9, 0.75, C.violet], [2.4, 98.5, 15.9, -0.6, C.pink]];
  for (const [x, z, top, w, col] of discs) K.cyl([x, top - 0.4, z], 3.3, 0.4, { kin: { type: 'spin', c: [x, top - 0.4, z], axis: [0, 1, 0], w }, vis: { c: col, c2: C.white, m: 'disc' } });
  for (const [x, z, top] of discs) K.deco({ shape: 'pillar', p: [x, -8, z], r: 0.7, h: top - 8.4, vis: { c: C.white, c2: C.violet, m: 'stripes' } });

  // 5) landing C (z 102..109, top 16.5) and the downhill conveyor (z 109..139, 16.5 -> 24) with bumpers
  K.box([0, 15.5, 105.5], [8, 1, 3.5], { vis: S(C.sky, C.white) });
  const a = Math.atan2(7.5, 30), dir = [0, Math.sin(a), Math.cos(a)], sp = -2.6;
  K.ramp(-7, 7, 109, 16.5, 139, 24, 1.4, { surf: SURF.CONVEYOR, conv: dir.map((v) => v * sp), vis: { c: C.purple, c2: C.yellow, m: 'conveyor', spd: sp } });
  K.rails(7.45, 109, 16.5, 139, 24);
  [[-4, 115], [3, 119], [-1, 124], [5, 128.5], [-5, 131], [1.5, 134.5]].forEach(([x, z]) => K.cyl([x, slopeY(z, 109, 16.5, 139, 24) + 0.75, z], 0.85, 1.0, { surf: SURF.BUMPER, bump: 10, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } }));

  // 6) landing D (z 139..146, top 24) and four rows of three sliding platforms
  K.box([0, 23, 142.5], [8, 1, 3.5], { vis: S(C.orange, C.cream) });
  rails(139.2, 145.8, 24);
  const plats = [];
  [[148.3, 4.4, 0.3], [152.5, 5.0, 2.0], [156.7, 4.0, 3.4], [160.9, 4.8, 1.1]].forEach(([z, period, ph], row) => {
    const w = (Math.PI * 2) / period;
    for (const x0 of [-5.2, 0, 5.2]) {
      K.box([x0, 23.6, z], [1.9, 0.4, 1.9], { noLedge: true, kin: { type: 'osc', d: [2.2, 0, 0], w, ph: ph + x0 * 0.2 }, vis: S(row % 2 ? C.mint : C.violet, C.cream) });
      plats.push({ row, x0, z, hx: 1.9, hz: 1.9, d: 2.2, w, ph: ph + x0 * 0.2 });
    }
  });

  // 7) sweeper deck E (z 163.2..196, top 24), the final ramp (196..214, 24 -> 30) and the summit (214..228, top 30)
  K.box([0, 23, 179.6], [8, 1, 16.4], { vis: S(C.hotpink, C.bubble) });
  rails(163.4, 195.8, 24);
  K.sweeper([0, 24, 173], { w: -1.15, hl: 7.7, arms: [{ y: 0.55, ph: 0 }], col: C.orange });
  K.sweeper([0, 24, 187.5], { w: 1.0, hl: 7.7, arms: [{ y: 0.55, ph: 0.8 }, { y: 1.85, ph: 0.8 + Math.PI / 2, r: 0.36 }], col: C.hotpink });
  K.ramp(-7, 7, 196, 24, 214, 30, 1.4, { vis: { c: C.mint, c2: C.white, m: 'grass' } });
  K.box([0, 29, 221], [8, 1, 7], { vis: S(C.yellow, C.cream) });
  K.deco({ shape: 'arch', p: [0, 30, 220], w: 16, h: 7, vis: { c: C.yellow, c2: C.mint, m: 'plain', text: 'FINISH' } });


  return {
    id: 'slimesurge', type: 'race', name: 'Slime Surge', desc: 'Climb out of the rising slime and race to the top!', tip: 'Keep to the middle of the punching ramp. Fall in and you go back to your last checkpoint.',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, plats, punchers,
    timeLimit: 150, slimeY: SURGE.y0, theme: 'mint', surge: SURGE,
    finish: [-8, 29.5, 220, 8, 40, 228],
    rules: {
      killY: -99, respawn: true, rise: SURGE,
      checkpoints: [
        { spawn: [0, 0, 2], spread: [14, 8], yaw: 0, box: [0, 0, 0, 0, 0, 0] },
        { spawn: [0, 7, 46], spread: [12, 4], yaw: 0, box: [-8, 6.5, 42, 8, 12, 50] },
        { spawn: [0, 12, 58], spread: [12, 3], yaw: 0, box: [-8, 11.5, 55, 8, 16, 76] },
        { spawn: [0, 16.5, 105.5], spread: [12, 4], yaw: 0, box: [-8, 16, 102, 8, 20, 109] },
        { spawn: [0, 24, 142.5], spread: [12, 4], yaw: 0, box: [-8, 23.5, 139, 8, 28, 146] },
        { spawn: [0, 24, 166.5], spread: [12, 4], yaw: 0, box: [-8, 23.5, 163.2, 8, 28, 170] },
      ],
    },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const col = i % 9, row = Math.floor(i / 9); out.push([-8 + col * 2, 0, 8.5 - row * 2.2, 0]); }
      return out;
    },
    bot: {
      route: [
        { p: [0, 0, 10], w: 4 }, { p: [0, 2, 18], w: 0.9 }, { p: [0, 4.5, 30], w: 0.9 }, { p: [0, 7, 42], w: 1.5 }, { p: [0, 7, 49.5], w: 5, act: 'pad' },
        { p: [0, 12, 58], w: 5 }, { p: [0, 12, 66], w: 5 }, { p: [-2.4, 12, 76.5], w: 1 },
        { p: [-2.4, 12.9, 80.5], w: 1, act: 'disc' }, { p: [2.4, 13.9, 86.5], w: 1, act: 'disc' }, { p: [-2.4, 14.9, 92.5], w: 1, act: 'disc' }, { p: [2.4, 15.9, 98.5], w: 1, act: 'disc' },
        { p: [0, 16.5, 104], w: 4 }, { p: [0, 20, 122], w: 4 }, { p: [0, 24, 140], w: 4 }, { p: [0, 24, 145.5], w: 3, spd: 0.7 },
        { p: [0, 24, 148.3], w: 0, act: 'plat', row: 0 }, { p: [0, 24, 152.5], w: 0, act: 'plat', row: 1 }, { p: [0, 24, 156.7], w: 0, act: 'plat', row: 2 }, { p: [0, 24, 160.9], w: 0, act: 'plat', row: 3 },
        { p: [0, 24, 166], w: 5 }, { p: [0, 24, 180], w: 6 }, { p: [0, 24, 195], w: 5 }, { p: [0, 30, 216], w: 5 }, { p: [0, 30, 226], w: 6 },
      ],
    },
    cam: [
      { e: [16, 40, 236], l: [0, 31, 218] }, { e: [-15, 32, 190], l: [0, 25, 178] }, { e: [15, 31, 160], l: [0, 24, 154] }, { e: [-14, 27, 126], l: [0, 19, 120] },
      { e: [14, 23, 96], l: [0, 14, 88] }, { e: [-13, 19, 62], l: [0, 11, 58] }, { e: [13, 12, 28], l: [0, 4, 26] }, { e: [0, 6.5, -12], l: [0, 1.6, 6] },
    ],
  };
}


export { SURGE, buildSlimeSurge };
