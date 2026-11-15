// The waiting-room island: run around, bounce and bump other beans while the show fills up.
import { Kit, C } from './kit.js';
import { SURF } from '../sim/config.js';
function buildLobby(seed) {
  const K = new Kit();
  K.cyl([0, -1, 0], 17, 1, { vis: { c: C.lilac, c2: C.white, m: 'rings' } });
  K.cyl([0, -0.6, 0], 2.4, 0.7, { surf: SURF.BOUNCY, bounce: 15, vis: { c: C.lime, c2: C.yellow, m: 'bouncy' } });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5, r = 10;
    K.cyl([Math.cos(a) * r, 0.8, Math.sin(a) * r], 0.8, 0.8, { surf: SURF.BUMPER, bump: 9, vis: { c: [C.hotpink, C.yellow, C.blue][i % 3], c2: C.white, m: 'bumper' } });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2, r = 6;
    K.box([Math.cos(a) * r, 0.4, Math.sin(a) * r], [1.1, 0.4, 1.1], { vis: { c: [C.orange, C.mint, C.violet, C.sky][i], c2: C.white, m: 'stripes' } });
  }
  K.deco({ shape: 'ring', p: [0, -0.2, 0], r: 17.2, vis: { c: C.hotpink, m: 'plain' } });
  return {
    id: 'lobby', type: 'lobby', name: 'Waiting Island', desc: 'Warm up while the show fills!', tip: '',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards,
    timeLimit: 999, slimeY: -6, theme: 'day',
    rules: { killY: -8, respawn: true, checkpoints: [{ spawn: [0, 0, 8], spread: [10, 6], yaw: Math.PI, box: [0, 0, 0, 0, 0, 0] }] },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const a = i * 2.39996, r = 4 + (i % 7) * 1.5; out.push([Math.cos(a) * r, 0, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a))]); }
      return out;
    },
    bot: { wander: true },
    cam: [{ e: [0, 14, 26], l: [0, 0, 0] }, { e: [0, 9, 18], l: [0, 1, 0] }],
  };
}


export { buildLobby };
