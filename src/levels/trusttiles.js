// Round type: RACE — "Trust Tiles". A field of identical tiles where only a hidden path is solid (the fakes
// crumble the moment you step on them), then a run of shuffling platforms over the slime and a final sweeper.
// Which tiles are real is a server secret (Match.loadLevel) — clients only learn when a fake one breaks.
import { Kit, C } from './kit.js';
const TRUST = { rows: 12, cols: 6, size: 2.5, gap: 0.25, z0: 15.5, drop: 9 };
const trustX = (c) => (c - (TRUST.cols - 1) / 2) * (TRUST.size + TRUST.gap);
const trustZ = (r) => TRUST.z0 + r * (TRUST.size + TRUST.gap);

// Hidden path generator: a 4-connected walk from the first row to the last plus a few dead-end decoys.
function trustSecret(rng) {
  const { rows, cols } = TRUST, real = new Uint8Array(rows * cols);
  let c = Math.floor(rng() * cols);
  for (let r = 0; r < rows; r++) {
    real[r * cols + c] = 1;
    if (r < rows - 1 && rng() < 0.5) { // shuffle sideways within this row before stepping forward
      const n = 1 + (rng() < 0.3 ? 1 : 0), d = c <= 0 ? 1 : c >= cols - 1 ? -1 : rng() < 0.5 ? -1 : 1;
      for (let k = 0; k < n; k++) { const c2 = c + d; if (c2 < 0 || c2 >= cols) break; c = c2; real[r * cols + c] = 1; }
    }
  }
  for (let i = 0; i < real.length; i++) if (!real[i] && rng() < 0.08) real[i] = 1; // decoys
  return real;
}

function buildTrustTiles(seed) {
  const K = new Kit();
  const S = (c, c2 = C.white) => ({ c, c2, m: 'stripes' });
  const pal = [C.pink, C.sky, C.yellow, C.mint, C.lilac, C.peach];
  const tiles = [];
  const hs = TRUST.size / 2;
  // tiles first, so dyn index === tile id
  for (let r = 0; r < TRUST.rows; r++) for (let c = 0; c < TRUST.cols; c++) {
    const x = trustX(c), z = trustZ(r), col = pal[(r + c * 2) % pal.length];
    const b = K.box([x, -0.25, z], [hs, 0.25, hs], { dyn: K.dyn(), tag: 'trust', noLedge: true, vis: { c: col, c2: C.white, m: 'checker', ti: tiles.length } });
    tiles.push({ id: tiles.length, row: r, col: c, x, z, y: 0, col3: col, dyn: b.dyn, c: b });
  }

  // 1) start pad + walkway (z -6..14.25, top 0)
  K.box([0, -1, 2], [10, 1, 8], { vis: S(C.hotpink, C.bubble) });
  K.box([0, -0.5, 12.1], [8.6, 0.5, 2.1], { vis: S(C.yellow, C.cream) });
  K.deco({ shape: 'gate', p: [0, 0, 10.2], w: 20, h: 7, vis: { c: C.purple, c2: C.yellow, m: 'plain', text: 'GO!' } });
  // tile frame posts (decor)
  const zEnd = trustZ(TRUST.rows - 1) + hs;

  // 2) landing (z 47.25..53, top 0)
  K.box([0, -1, (zEnd + 0.25 + 53) / 2], [10, 1, (53 - zEnd - 0.25) / 2], { vis: S(C.sky, C.white) });

  // 3) shuffle platforms: four rows of two platforms sliding side to side over the slime
  const plats = [];
  [[56, 4.6, 0], [61.5, 5.4, 1.7], [67, 4.2, 3.1], [72.5, 5.0, 0.9]].forEach(([z, period, ph], row) => {
    const w = (Math.PI * 2) / period;
    for (const x0 of [-4, 4]) {
      K.box([x0, -0.4, z], [1.8, 0.4, 1.8], { noLedge: true, kin: { type: 'osc', d: [3.6, 0, 0], w, ph }, vis: S(row % 2 ? C.orange : C.violet, C.cream) });
      plats.push({ row, x0, z, hx: 1.8, hz: 1.8, d: 3.6, w, ph });
    }
  });

  // 4) final stretch (z 75.5..96, top 0) with a low sweeper; finish arch at z 92
  K.box([0, -1, 85.75], [10, 1, 10.25], { vis: S(C.purple, C.violet) });
  K.sweeper([0, 0, 83.5], { w: 1.25, hl: 8.6, arms: [{ y: 0.55, ph: 0 }], col: C.hotpink });
  K.deco({ shape: 'arch', p: [0, 0, 92], w: 20, h: 8, vis: { c: C.yellow, c2: C.hotpink, m: 'plain', text: 'FINISH' } });

  return {
    id: 'trusttiles', type: 'race', name: 'Trust Tiles', desc: 'Race to the finish line!', tip: 'Only one hidden path holds. Watch where others fall — and follow the beans who make it!',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, tiles, plats, trust: TRUST,
    tileDrop: TRUST.drop, timeLimit: 150, slimeY: -5, theme: 'sunset',
    finish: [-10, -0.5, 92, 10, 10, 96],
    rules: {
      killY: -4, respawn: true,
      checkpoints: [
        { spawn: [0, 0, 1], spread: [16, 8], yaw: 0, box: [0, 0, 0, 0, 0, 0] },
        { spawn: [0, 0, 50.2], spread: [16, 3], yaw: 0, box: [-10, -1, zEnd + 0.3, 10, 6, 53] },
        { spawn: [0, 0, 78], spread: [16, 2.4], yaw: 0, box: [-10, -1, 75.5, 10, 6, 80] },
      ],
    },
    spawns(n) {
      const out = [];
      for (let i = 0; i < n; i++) { const col = i % 10, row = Math.floor(i / 10); out.push([-9 + col * 2, 0, 8.5 - row * 2.2, 0]); }
      return out;
    },
    bot: {
      route: [
        { p: [0, 0, 13.6], w: 6 }, { p: [0, 0, zEnd], w: 0, act: 'trust' }, { p: [0, 0, 52], w: 6, spd: 0.7 },
        { p: [0, 0, 56], w: 0, act: 'plat', row: 0 }, { p: [0, 0, 61.5], w: 0, act: 'plat', row: 1 },
        { p: [0, 0, 67], w: 0, act: 'plat', row: 2 }, { p: [0, 0, 72.5], w: 0, act: 'plat', row: 3 },
        { p: [0, 0, 77], w: 6 }, { p: [0, 0, 94], w: 8 },
      ],
    },
    cam: [
      { e: [15, 14, 104], l: [0, 2, 88] }, { e: [-14, 12, 76], l: [0, 0, 64] }, { e: [16, 15, 50], l: [0, 0, 36] },
      { e: [-12, 13, 22], l: [0, 0, 30] }, { e: [0, 6.5, -12], l: [0, 1.6, 6] },
    ],
  };
}


export { TRUST, trustX, trustZ, trustSecret, buildTrustTiles };
