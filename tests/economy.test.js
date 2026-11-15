import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, itemById, SLOTS, DEFAULT_LOADOUT, DEFAULT_OWNED, sanitizeLoadout, randomLoadout } from '../src/economy/cosmetics.js';
import { PASS_ITEMS, passReward } from '../src/economy/pass.js';
import { PROMOS, promoKey, cleanPromo, promoFor } from '../src/economy/promo.js';
import { mulberry32 } from '../src/sim/math.js';

test('catalog ids are unique and every item has a slot and price', () => {
  const ids = CATALOG.map((it) => it.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const it of CATALOG) { assert.ok(it.slot && it.name && it.rarity, it.id); assert.ok(it.price, it.id); }
});

test('the default loadout is made of real items', () => {
  for (const slot of SLOTS) assert.ok(itemById(DEFAULT_LOADOUT[slot]), `${slot}: ${DEFAULT_LOADOUT[slot]}`);
  for (const id of DEFAULT_OWNED) assert.ok(itemById(id), id);
});

test('a junk loadout is cleaned up to items you own', () => {
  const lo = sanitizeLoadout({ color: 'nope', hat: 'h_ufo', pattern: 42, face: null }, new Set(DEFAULT_OWNED));
  for (const slot of SLOTS) assert.ok(itemById(lo[slot]), `${slot} -> ${lo[slot]}`);
  assert.notEqual(lo.hat, 'h_ufo', "can't wear a hat you don't own");
});

test('random bot loadouts only use real items', () => {
  const rng = mulberry32(9);
  for (let i = 0; i < 200; i++) { const lo = randomLoadout(rng); for (const slot of SLOTS) assert.ok(itemById(lo[slot]), `${slot}: ${lo[slot]}`); }
});

test('every CranPass and promo-code reward is a real item', () => {
  for (const [lv, id] of Object.entries(PASS_ITEMS)) { assert.ok(itemById(id), `pass level ${lv}: ${id}`); assert.equal(passReward(+lv).item, id); }
  for (const [key, p] of Object.entries(PROMOS)) for (const id of p.items) assert.ok(itemById(id), `promo ${key}: ${id}`);
});

test('promo codes are matched by fingerprint, ignoring case and spaces', () => {
  assert.equal(cleanPromo(' ab-c 12 '), 'ABC12');
  assert.equal(promoKey('abc12'), promoKey('ABC 12'));
  assert.equal(promoFor('definitely not a code'), null);
});
