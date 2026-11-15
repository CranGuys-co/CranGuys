import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, POOLS, DUEL_POOLS, buildLevel, levelMeta, pickShow, pickDuel, baseId } from '../src/levels/index.js';
import { mulberry32 } from '../src/sim/math.js';

const everyId = [...new Set([...Object.keys(LEVELS), ...Object.values(POOLS).flat(), ...Object.values(DUEL_POOLS).flat()])];

test('every level and variant builds', () => {
  for (const id of everyId) {
    const L = buildLevel(id, 42);
    assert.ok(L, `${id} built`);
    assert.ok(levelMeta(id), `${id} has a name and type`);
  }
});

test('levels are a pure function of their seed', () => {
  for (const id of everyId) {
    const a = JSON.stringify(LEVELS[baseId(id)].build(7, id.split(':')[1]));
    const b = JSON.stringify(LEVELS[baseId(id)].build(7, id.split(':')[1]));
    assert.equal(a, b, `${id} builds the same twice`);
  }
});

test('a random show is two different races, a survival round and a final', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 500; i++) {
    const [r1, r2, sv, fin] = pickShow(rng);
    assert.equal(levelMeta(r1).type, 'race');
    assert.equal(levelMeta(r2).type, 'race');
    assert.notEqual(r1, r2);
    assert.equal(levelMeta(sv).type, 'survival');
    assert.ok(POOLS.final.includes(fin), `${fin} is a final`);
    assert.notEqual(baseId(fin), sv, 'the final is not the survival map again');
  }
  for (let i = 0; i < 100; i++) for (const id of pickDuel(rng)) assert.ok(levelMeta(id), `duel map ${id}`);
});
