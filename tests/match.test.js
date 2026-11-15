import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/sim/game.js';
import { PHASE, BTN, TICK_HZ } from '../src/sim/config.js';
import { LOW, DUCK, GAP } from '../src/levels/wallrush.js';
import { packChar, NFIELDS } from '../src/sim/character.js';

// A whole show runs headless: bots only, seeded, no browser. The fingerprint covers every bean's packed state
// (position, velocity, mode...) on every tick.
function runShow({ seed, show, bots = 20, secs = 60, onTick = null }) {
  const m = new Match({ id: 'test', seed, secret: 7, show, lobbySecs: 1, botFill: false, testMode: true });
  for (let i = 0; i < bots; i++) m.addBot();
  const buf = new Float32Array(NFIELDS), bytes = new Uint8Array(buf.buffer);
  let h = 2166136261 >>> 0, ticks = 0;
  for (let k = 0; k < TICK_HZ * secs && !m.ended; k++) {
    m.step(); ticks++;
    for (const p of m.players) if (p.st) { packChar(p.st, buf, 0); for (const b of bytes) { h ^= b; h = Math.imul(h, 16777619); } }
    if (onTick) onTick(m);
  }
  return { m, digest: [ticks, h >>> 0] };
}

test('the same seed plays out exactly the same show', () => {
  const a = runShow({ seed: 1234, show: ['whirlway'], secs: 40 });
  const b = runShow({ seed: 1234, show: ['whirlway'], secs: 40 });
  assert.equal(a.digest[0], TICK_HZ * 40);
  assert.deepEqual(a.digest, b.digest);
  const c = runShow({ seed: 999, show: ['whirlway'], secs: 40 });
  assert.notDeepEqual(a.digest, c.digest);
});

test('a show moves from the lobby into play', () => {
  const phases = new Set();
  runShow({ seed: 5, show: ['tiletumble:final'], secs: 25, onTick: (m) => phases.add(m.phase) });
  for (const p of [PHASE.LOBBY, PHASE.INTRO, PHASE.COUNTDOWN, PHASE.PLAY]) assert.ok(phases.has(p), `reached phase ${p}`);
});

test('Wall Rush bots jump the low blocks and dive under the raised bars', () => {
  assert.equal(typeof LOW, 'number');
  assert.equal(typeof DUCK, 'number');
  assert.equal(new Set([GAP, LOW, DUCK]).size, 3);
  let jumps = 0, dives = 0;
  runShow({
    seed: 11, show: ['wallrush:final'], bots: 40, secs: 200,
    onTick: (mm) => { if (mm.phase === PHASE.PLAY) for (const p of mm.players) if (p.inp && p.inp.b != null) { if (p.inp.b & BTN.JUMP) jumps++; if (p.inp.b & BTN.DIVE) dives++; } },
  });
  assert.ok(jumps > 0, 'bots jumped');
  assert.ok(dives > 0, 'bots dived (they never did while LOW and DUCK were undefined)');
});
