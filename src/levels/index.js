// Level registry. buildLevel(id, seed) is deterministic and cached per (id, seed).
// A show entry may carry a variant after a colon, e.g. 'tiletumble:final' (smaller arena for few players).
import { buildWhirlWay } from './whirlway.js';
import { buildTileTumble } from './tiletumble.js';
import { buildCrownPeak, crownAt } from './crownpeak.js';
import { buildHammerHills } from './hammerhills.js';
import { buildTrustTiles } from './trusttiles.js';
import { buildJumpRing } from './jumpring.js';
import { buildLobby } from './lobby.js';
import { buildSlimeSurge } from './slimesurge.js';
import { buildWallRush } from './wallrush.js';
import { buildJumpRope } from './jumprope.js';
import { buildRedLight } from './redlight.js';
import { buildColorMatch } from './colormatch.js';
import { buildBoulderBash } from './boulderbash.js';
const LEVELS = {
  lobby: { build: buildLobby, type: 'lobby', name: 'Waiting Island', icon: 'fa-umbrella-beach' },
  whirlway: { build: buildWhirlWay, type: 'race', name: 'Whirl Way', icon: 'fa-flag-checkered' },
  hammerhills: { build: buildHammerHills, type: 'race', name: 'Hammer Hills', icon: 'fa-hammer' },
  trusttiles: { build: buildTrustTiles, type: 'race', name: 'Trust Tiles', icon: 'fa-shoe-prints' },
  tiletumble: { build: buildTileTumble, type: 'survival', name: 'Tile Tumble', icon: 'fa-shapes' },
  jumpring: { build: buildJumpRing, type: 'survival', name: 'Jump Ring', icon: 'fa-rotate' },
  crownpeak: { build: buildCrownPeak, type: 'final', name: 'Crown Peak', icon: 'fa-crown' },
  slimesurge: { build: buildSlimeSurge, type: 'race', name: 'Slime Surge', icon: 'fa-droplet' },
  jumprope: { build: buildJumpRope, type: 'race', name: 'Rope Rumble', icon: 'fa-rotate' },
  redlight: { build: buildRedLight, type: 'race', name: 'Red Light Rush', icon: 'fa-hand' },
  wallrush: { build: buildWallRush, type: 'survival', name: 'Wall Rush', icon: 'fa-wall' },
  colormatch: { build: buildColorMatch, type: 'survival', name: 'Colour Clash', icon: 'fa-palette' },
  boulderbash: { build: buildBoulderBash, type: 'survival', name: 'Boulder Bash', icon: 'fa-bowling-ball' },
};
// Round pools for the random show: two different races, a survival round, then a final.
const POOLS = {
  race: ['whirlway', 'hammerhills', 'trusttiles', 'slimesurge', 'jumprope', 'redlight'],
  survival: ['tiletumble', 'jumpring', 'wallrush', 'colormatch', 'boulderbash'],
  final: ['crownpeak', 'tiletumble:final', 'jumpring:final', 'wallrush:final', 'colormatch:final', 'boulderbash:final'],
};
const SHOW = ['whirlway', 'tiletumble', 'crownpeak'];

const baseId = (id) => String(id).split(':')[0];
const levelMeta = (id) => LEVELS[baseId(id)];

// Random show: a race, then a different race, a survival round, then a final that isn't the survival map
// again. The newest races (Rope Rumble, Red Light Rush) come up a bit more often in round 2; Crown Peak, the
// classic final, comes up a bit more often than the other finals.
const NEW_RACES = ['jumprope', 'redlight'];
function pickShow(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length) % a.length];
  const r1 = pick(POOLS.race), r2 = pick([...POOLS.race, ...NEW_RACES].filter((x) => x !== r1));
  const sv = pick(POOLS.survival);
  const fins = POOLS.final.filter((x) => baseId(x) !== sv);
  const fin = rng() < 0.3 ? 'crownpeak' : pick(fins);
  return [r1, r2, sv, fin];
}

// A ranked 1v1 duel: up to five different maps, mixing races, survival and finals (first to two round wins).
const DUEL_POOLS = {
  race: ['whirlway', 'hammerhills', 'trusttiles', 'slimesurge', 'jumprope', 'redlight'],
  survival: ['tiletumble:final', 'jumpring:final', 'wallrush:final', 'colormatch:final', 'boulderbash:final'],
  final: ['crownpeak'],
};
// first to 3 round wins: up to 7 rounds (draws can stretch it), alternating race / survival with a final mixed in
function pickDuel(rng = Math.random, n = 7) {
  const pick = (a) => a[Math.floor(rng() * a.length) % a.length];
  const order = ['race', 'survival', rng() < 0.5 ? 'final' : 'race', 'survival', 'race', rng() < 0.5 ? 'final' : 'survival', 'race'];
  const used = new Set(), out = [];
  for (const k of order.slice(0, n)) {
    let opts = DUEL_POOLS[k].filter((x) => !used.has(x));
    if (!opts.length) opts = [...DUEL_POOLS.race, ...DUEL_POOLS.survival].filter((x) => !used.has(x));
    const id = pick(opts); used.add(id); out.push(id);
  }
  return out;
}

const cache = new Map();
function buildLevel(id, seed = 1) {
  const k = id + ':' + seed;
  if (!cache.has(k)) { if (cache.size > 12) cache.clear(); cache.set(k, freshLevel(id, seed)); }
  return cache.get(k);
}
// Fresh (uncached) copy — World mutates collider objects (cached poses), so each World needs its own.
function freshLevel(id, seed = 1) {
  const [base, variant] = String(id).split(':');
  const L = LEVELS[base].build(seed, variant);
  L.showId = id; L.variant = variant || '';
  return L;
}


export { LEVELS, POOLS, SHOW, baseId, levelMeta, NEW_RACES, pickShow, DUEL_POOLS, pickDuel, buildLevel, freshLevel, crownAt };
