// Round type: RACE — "Hammer Hills". A ramp guarded by giant swinging hammers, a run of spinning logs over
// the slime, a wind-swept fan bridge and one last pair of hammers before the finish.
import { Kit, C, T_PLAY } from './kit.js';
import { qt } from '../sim/math.js';
const slopeY = (z, z0, y0, z1, y1) => y0 + ((z - z0) / (z1 - z0)) * (y1 - y0);

// Pendulum hammers swing across the course (rotation about the z axis).
const HAMMER = { len: 5.6, amp: 0.95, head: 1.0, headHalf: 1.25 };

function buildHammerHills(seed) {
  const K = new Kit();
  const S = (c, c2 = C.white) => ({ c, c2, m: 'stripes' });
  const AX = qt.axis([0, 0, 1], Math.PI / 2); // turns y-aligned cylinders / x-aligned capsules onto x / y

  function hammer(x, z, ground, ph, period, col) {
    const L = HAMMER.len, piv = [x, ground + L + 1.25, z], w = (Math.PI * 2) / period;
    const kin = { type: 'pend', c: piv, axis: [0, 0, 1], amp: HAMMER.amp, w, ph };
    K.cap([x, piv[1] - L / 2, z], 0.2, L / 2 - 0.3, { ghost: true, q: AX, kin, vis: { c: C.white, c2: C.navy, m: 'arm' } });
    K.cyl([x, ground + 1.25, z], HAMMER.head, HAMMER.headHalf, { q: AX, knock: 9, kin, vis: { c: col, c2: C.white, m: 'stripes' } });
    K.hazards.push({ type: 'pend', x, z, ground, piv, len: L, amp: HAMMER.amp, w, ph });
    return piv[1];
  }
  function gantry(z, ground, top, hammers) {
    for (const s of [-1, 1]) K.box([s * 11.7, (ground - 3 + top + 0.4) / 2, z], [0.45, (top + 0.4 - ground + 3) / 2, 0.45], { vis: S(C.navy, C.violet) });
    K.box([0, top + 0.55, z], [12.1, 0.35, 0.4], { vis: S(C.yellow, C.navy) });
    for (const x of hammers) K.deco({ shape: 'sph', p: [x, top + 0.55, z], r: 0.55, vis: { c: C.gold } });
  }

  // 1) start pad (z -6..12, top 0)
  K.box([0, -1, 3], [11, 1, 9], { vis: S(C.orange, C.cream) });
  K.deco({ shape: 'gate', p: [0, 0, 12.2], w: 22, h: 7, vis: { c: C.orange, c2: C.yellow, m: 'plain', text: 'GO!' } });

  // 2) hammer ramp (z 12..44, y 0..6)
  K.ramp(-10, 10, 12, 0, 44, 6, 1.4, { vis: { c: C.mint, c2: C.white, m: 'grass' } });
  K.rails(10.45, 12, 0, 44, 6);
  const rows = [
    { z: 20, hs: [[-5, 0, 2.7, C.hotpink], [5, Math.PI, 2.7, C.blue]] },
    { z: 29.5, hs: [[0, Math.PI / 2, 3.0, C.orange]] },
    { z: 38.5, hs: [[-5.5, 1.1, 2.5, C.violet], [5.5, 1.1 + Math.PI, 2.5, C.pink]] },
  ];
  for (const r of rows) {
    const g = slopeY(r.z, 12, 0, 44, 6);
    let top = 0; for (const [x, ph, per, col] of r.hs) top = hammer(x, r.z, g, ph, per, col);
    gantry(r.z, g, top, r.hs.map((h) => h[0]));
  }

  // 3) landing (z 44..50, top 6) then spinning logs over the slime (z 50..68.5)
  K.box([0, 5, 47], [11, 1, 3], { vis: S(C.yellow, C.cream) });
  const logs = [];
  [52.6, 56.0, 59.4, 62.8, 66.2].forEach((z, i) => {
    const w = i % 2 ? -1.35 : 1.15, c = [0, 4.85, z];
    K.cyl(c, 1.15, 9.2, { q: AX, kin: { type: 'spin', c, axis: [1, 0, 0], w }, vis: { c: i % 2 ? C.orange : C.hotpink, c2: C.cream, m: 'log' } });
    logs.push({ z, r: 1.15, w });
  });
  for (const s of [-1, 1]) for (const z of [52.6, 59.4, 66.2]) K.deco({ shape: 'sph', p: [s * 9.6, 4.85, z], r: 0.75, vis: { c: C.white } });

  // 4) landing (z 68.5..74) and the fan bridge (z 74..98.5, 6 m wide, top 6)
  K.box([0, 5, 71.25], [11, 1, 2.75], { vis: S(C.sky, C.white) });
  K.box([0, 5.5, 86.25], [3, 0.5, 12.25], { vis: S(C.lilac, C.white) });
  const fans = [];
  [[77, 1], [83, -1], [89, 1], [95, -1]].forEach(([z, dir], i) => {
    const cyc = { period: 4.2, on: 2.4, ph: i * 1.05 };
    K.trig({ shape: 'box', p: [0, 8, z], h: [6.5, 2.6, 3], kind: 'wind', wind: [dir * 3.9, 0, 0], cyc });
    const fx = -dir * 5.4, hub = [fx, 7.3, z];
    K.box([fx, 4.6, z], [0.35, 2.3, 0.35], { vis: S(C.navy, C.violet) });                       // fan post
    K.deco({ shape: 'fan', p: hub, dir, r: 1.9, vis: { c: C.white, c2: C.blue } });            // housing
    for (const ph of [0, Math.PI / 2]) K.cap(hub, 0.22, 1.45, { ghost: true, q: qt.axis([0, 1, 0], Math.PI / 2), kin: { type: 'spin', c: hub, axis: [1, 0, 0], w: 9 * dir, ph }, vis: { c: C.sky, c2: C.white, m: 'arm' } });
    fans.push({ z, dir, hub, cyc, force: 3.9 });
  });

  // 5) hammer gauntlet (z 98.5..136, top 6): three more rows of hammers and side bumpers, finish arch at z 130
  K.box([0, 5, 117.25], [11, 1, 18.75], { vis: S(C.purple, C.violet) });
  [[106, [[-4.6, 0.4, 2.6, C.hotpink], [4.6, 0.4 + Math.PI, 2.6, C.yellow]]], [115, [[0, 2.0, 2.3, C.blue]]], [124, [[-5.2, 1.3, 2.4, C.orange], [5.2, 1.3 + Math.PI, 2.4, C.mint]]]].forEach(([z, hs]) => {
    let top = 0; for (const [x, ph, per, col] of hs) top = hammer(x, z, 6, ph, per, col);
    gantry(z, 6, top, hs.map((h) => h[0]));
  });
  for (const s of [-1, 1]) for (const z of [110.5, 119.5]) K.cyl([s * 8.6, 6.9, z], 0.85, 0.9, { surf: 4, bump: 10, vis: { c: C.hotpink, c2: C.white, m: 'bumper' } });
  K.deco({ shape: 'arch', p: [0, 6, 130], w: 22, h: 8, vis: { c: C.yellow, c2: C.hotpink, m: 'plain', text: 'FINISH' } });


  return {
    id: 'hammerhills', type: 'race', name: 'Hammer Hills', desc: 'Race to the finish line!', tip: 'Time your run past the hammers, hop log to log and lean into the wind on the fan bridge.',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, logs, fans,
    timeLimit: 150, slimeY: -4, theme: 'mint',
    finish: [-11, 5.5, 130, 11, 16, 136],
    rules: {
      killY: -3, respawn: true,
      checkpoints: [
        { spawn: [0, 0, 2], spread: [16, 8], yaw: 0, box: [0, 0, 0, 0, 0, 0] },
        { spawn: [0, 6, 47], spread: [16, 3], yaw: 0, box: [-11, 5, 44, 11, 12, 50] },
        { spawn: [0, 6, 71.5], spread: [14, 2.5], yaw: 0, box: [-11, 5, 68.5, 11, 12, 74] },
        { spawn: [0, 6, 101], spread: [14, 3], yaw: 0, box: [-11, 5, 98.5, 11, 12, 103] },
      ],
    },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const col = i % 10, row = Math.floor(i / 10); out.push([-9 + col * 2, 0, 9 - row * 2.2, 0]); }
      return out;
    },
    bot: {
      route: [
        { p: [0, 0, 12], w: 8 }, { p: [0, 3, 26], w: 7 }, { p: [0, 6, 44], w: 7 }, { p: [0, 6, 49.6], w: 4, spd: 0.55 },
        { p: [0, 6, 52.6], w: 3.5, act: 'logs', spd: 0.55 }, { p: [0, 6, 56.0], w: 3.5, act: 'logs', spd: 0.55 }, { p: [0, 6, 59.4], w: 3.5, act: 'logs', spd: 0.55 },
        { p: [0, 6, 62.8], w: 3.5, act: 'logs', spd: 0.55 }, { p: [0, 6, 66.2], w: 3.5, act: 'logs', spd: 0.55 }, { p: [0, 6, 72], w: 4 },
        { p: [0, 6, 86], w: 0.6, act: 'wind' }, { p: [0, 6, 99], w: 0.6, act: 'wind' }, { p: [0, 6, 110], w: 7 }, { p: [0, 6, 120], w: 7 }, { p: [0, 6, 133], w: 8 },
      ],
    },
    cam: [
      { e: [17, 17, 144], l: [0, 7, 128] }, { e: [-15, 15, 118], l: [0, 7, 108] }, { e: [-12, 14, 96], l: [0, 7, 86] }, { e: [13, 13, 70], l: [0, 6, 59] },
      { e: [-14, 14, 44], l: [0, 4, 30] }, { e: [0, 6.5, -12], l: [0, 1.6, 6] },
    ],
  };
}


export { HAMMER, buildHammerHills };
