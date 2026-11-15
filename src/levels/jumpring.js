// Round type: SURVIVAL (or FINAL) — "Jump Ring". A round stage over the slime with a spinning bar to jump and,
// after a while, a second higher bar spinning the other way that clips anyone who jumps at the wrong moment.
// Both bars keep speeding up. No other events: the round runs until enough beans have been knocked off.
import { Kit, C, T_PLAY } from './kit.js';
const RING = { R: 12.5, low: { y: 0.55, r: 0.42 }, high: { y: 2.3, r: 0.42, at: 20 } };

function buildJumpRing(seed) {
  const K = new Kit();
  K.cyl([0, -0.6, 0], RING.R, 0.6, { vis: { c: C.hotpink, c2: C.bubble, m: 'disc' } });
  K.cyl([0, 1.7, 0], 1.15, 1.7, { vis: { c: C.purple, c2: C.white, m: 'stripes', pole: true } });
  K.deco({ shape: 'sph', p: [0, 3.65, 0], r: 1.15, vis: { c: C.yellow } });
  K.deco({ shape: 'ring', p: [0, -0.35, 0], r: RING.R + 0.35, vis: { c: C.yellow, m: 'plain' } });
  K.deco({ shape: 'ring', p: [0, -3.2, 0], r: RING.R - 2, vis: { c: C.violet, m: 'plain' } });
  K.deco({ shape: 'pillar', p: [0, -14, 0], r: 2.4, h: 13, vis: { c: C.violet, c2: C.white, m: 'stripes' } });

  const hl = RING.R + 0.4;
  const low = { type: 'spinAcc', c: [0, RING.low.y, 0], axis: [0, 1, 0], w: 0.8, acc: 0.016, wmax: 2.3, t0: T_PLAY };
  K.cap([0, RING.low.y, 0], RING.low.r, hl, { knock: 7, knockSV: 0.45, kin: low, vis: { c: C.yellow, c2: C.white, m: 'arm' } });
  K.hazards.push({ type: 'arm', c: low.c, hl, k: low, high: false, r: RING.low.r });
  const tHigh = T_PLAY + RING.high.at;
  const high = { type: 'spinAcc', c: [0, RING.high.y, 0], axis: [0, 1, 0], w: -0.75, acc: 0.014, wmax: 2.1, t0: tHigh, start: tHigh, ph: Math.PI / 2 };
  K.cap([0, RING.high.y, 0], RING.high.r, hl, { knock: 7, knockSV: 0.45, kin: high, vis: { c: C.orange, c2: C.white, m: 'arm' } });
  K.hazards.push({ type: 'arm', c: high.c, hl, k: high, high: true, over: true, r: RING.high.r });


  return {
    id: 'jumpring', type: 'survival', name: 'Jump Ring', desc: 'Survive until enough beans are knocked off!', descFinal: 'Last bean on the ring wins the crown!',
    tip: 'Jump the low bar. When the high bar arrives, only jump when it isn’t about to pass over you!',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards,
    timeLimit: 150, timeLimitFinal: 300, slimeY: -4.5, theme: 'dusk', noClock: true, ring: RING,
    rules: { killY: -3, respawn: false, checkpoints: [{ spawn: [0, 0, 6], spread: [4, 4], yaw: 0, box: [0, 0, 0, 0, 0, 0] }] },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const r = 3.2 + 7 * Math.sqrt((i + 0.5) / Math.max(1, n)), a = i * 2.39996;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        out.push([x, 0, z, Math.atan2(-x, -z)]);
      }
      return out;
    },
    bot: { ring: true },
    cam: [
      { e: [0, 30, -34], l: [0, 0, 0] }, { e: [26, 16, 0], l: [0, 1, 0] }, { e: [0, 12, 22], l: [0, 1, 0] }, { e: [-14, 7, -10], l: [0, 1, 0] }, { e: [0, 9, -18], l: [0, 1, 0] },
    ],
  };
}


export { RING, buildJumpRing };
