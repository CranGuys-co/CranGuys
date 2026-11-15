import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInput, decodeInput } from '../src/sim/protocol.js';
import { BTN } from '../src/sim/config.js';
import { moderate, cleanName, safeName } from '../src/online/chatFilter.js';
import { RANKS, TIERS, rankOf, applyDelta, duelDelta } from '../src/online/ranks.js';

test('inputs survive the wire', () => {
  const buf = encodeInput(3, 123456, 1, -1, BTN.JUMP | BTN.GRAB);
  const i = decodeInput(buf);
  assert.equal(i.epoch, 3);
  assert.equal(i.tick, 123456);
  assert.ok(i.mx > 0.95 && i.mz < -0.95);
  assert.equal(i.b, BTN.JUMP | BTN.GRAB);
  assert.equal(decodeInput(new Uint8Array([0, 1, 2])), null);
});

test('chat lets friendly messages through and stops personal info', () => {
  assert.equal(moderate('gg nice run!').ok, true);
  assert.equal(moderate('').ok, false);
  assert.equal(moderate('hi', { last: 'hi' }).reason, 'repeat');
  assert.equal(moderate('my number is 07700 900123').ok, false);
});

test('names are cleaned, and a bad one falls back', () => {
  assert.equal(cleanName('Speedy_Kiwi').ok, true);
  assert.equal(cleanName('x').ok, false);
  assert.equal(safeName('<b>', 'Bean'), 'Bean');
});

test('ranks climb with RP and you never drop out of a tier you reached', () => {
  let prev = -1;
  for (let rp = 0; rp < 2500; rp += 25) { const r = rankOf(rp); const i = RANKS.indexOf(RANKS.find((k) => k.min === r.min)); assert.ok(i >= prev, `rank at ${rp}`); prev = i; }
  for (const t of TIERS) if (t.min > 0) assert.ok(applyDelta(t.min, -500) >= t.min, `floor at ${t.name}`);
  assert.ok(duelDelta(500, 500, 1) > 0 && duelDelta(500, 500, 0) < 0);
});
