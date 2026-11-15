// Round type: SURVIVAL — "Tile Tumble". Four stacked layers of hex tiles that dissolve a moment after you
// touch them. No other events: the round simply runs until enough beans have fallen through.
import { Kit, C, T_PLAY } from './kit.js';
const TILE = { RC: 1.36, RT: 1.3, HH: 0.35, N: 10, DROP_TICKS: 30 };
const EXT = 26.5; // layer radius ~25 m
const LAYERS = [28, 20, 12, 4];

function hexCenters(N, RC) {
  const out = [];
  for (let q = -N; q <= N; q++) for (let r = -N; r <= N; r++) {
    if (Math.abs(q + r) > N) continue;
    out.push({ q, r, x: RC * 1.5 * q, z: RC * Math.sqrt(3) * (r + q / 2), ring: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) });
  }
  return out;
}

function buildTileTumble(seed, variant) {
  const K = new Kit();
  const fin = variant === 'final', N = fin ? 6 : TILE.N, ext = fin ? 16 : EXT;
  const pal = [[C.pink, C.bubble, C.hotpink], [C.blue, C.sky, C.teal], [C.yellow, C.cream, C.orange], [C.mint, C.lime, C.teal]];
  const tiles = [];
  const cells = hexCenters(N, TILE.RC);
  LAYERS.forEach((y, L) => {
    for (const h of cells) {
      const shade = ((h.q - h.r) % 3 + 3) % 3;
      const c = K.cyl([h.x, y - TILE.HH, h.z], TILE.RT, TILE.HH, { dyn: K.dyn(), tag: 'tile', vis: { m: 'tile', c: pal[L][shade], layer: L, ti: tiles.length } });
      tiles.push({ id: tiles.length, x: h.x, z: h.z, y, layer: L, ring: h.ring, col: c, dyn: c.dyn });
    }
  });

  // neighbour lists (same layer, within 5.6 m) for bot planning
  for (const t of tiles) t.nb = [];
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
    const a = tiles[i], b = tiles[j];
    if (a.layer !== b.layer) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 5.6) { a.nb.push(j); b.nb.push(i); }
  }
  // no hazards: the floor itself is the enemy. Decorative rings around each layer.
  LAYERS.forEach((y, L) => K.deco({ shape: 'ring', p: [0, y - 0.9, 0], r: ext + 0.6, vis: { c: pal[L][2], m: 'plain' } }));
  // central pillar (decor) and neon posts
  K.deco({ shape: 'pillar', p: [0, -6, 0], r: 1.2, h: 30, vis: { c: C.violet, c2: C.white, m: 'stripes' } });

  const top = tiles.filter((t) => t.layer === 0);
  return {
    id: 'tiletumble', type: 'survival', name: 'Tile Tumble', desc: 'Don’t fall through all four floors!', tip: 'Tiles vanish moments after you touch them — keep hopping and save some floor for later!', descFinal: 'Last bean standing wins the crown!',
    colliders: K.cols, triggers: K.trigs, decor: K.decor, ndyn: K.ndyn, hazards: K.hazards, tiles,
    timeLimit: 900, slimeY: -3.5, theme: 'dusk', noClock: true,
    rules: { killY: -1.5, respawn: false, checkpoints: [{ spawn: [0, 28, 0], spread: [4, 4], yaw: 0, box: [0, 0, 0, 0, 0, 0] }] },
    spawns(n) {
      const ring = top.filter((t) => t.ring >= 2 && t.ring <= (fin ? 5 : 8) && (fin || t.ring % 2 === 0)).sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x) || a.ring - b.ring);
      const out = [];
      for (let i = 0; i < n; i++) { const t = ring[Math.floor((i * ring.length) / Math.max(n, 1)) % ring.length]; out.push([t.x, t.y, t.z, Math.atan2(-t.x, -t.z)]); }
      return out;
    },
    bot: { survival: true },
    cam: fin ? [
      { e: [0, 44, -30], l: [0, 14, 0] }, { e: [30, 30, 0], l: [0, 18, 0] }, { e: [0, 34, 22], l: [0, 26, 0] }, { e: [0, 35.5, -18], l: [0, 28.5, -4] },
    ] : [
      { e: [0, 66, -46], l: [0, 14, 0] }, { e: [46, 42, 0], l: [0, 16, 0] }, { e: [0, 38, 44], l: [0, 22, 0] }, { e: [-34, 36, -10], l: [0, 28, 0] }, { e: [0, 35.5, -22], l: [0, 28.5, -6] },
    ],
  };
}


export { TILE, LAYERS, hexCenters, buildTileTumble };
