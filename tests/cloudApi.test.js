import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { handle, LIMITS, nameKey } from '../supabase/functions/cg-api/handler.js';
import { closure, copied, outPath } from '../tools/build-functions.mjs';
import { fakeDb } from './helpers/fakedb.js';
import { dailyShop, itemById } from '../src/economy/cosmetics.js';

// Call cg-api as a signed-in player at a given time (ms).
const T0 = Date.parse('2026-11-15T12:00:00Z');
function api(db) {
  let clock = T0;
  const call = async (uid, body, token = uid && db.signIn(uid)) => {
    const req = new Request('https://x/functions/v1/cg-api', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) });
    const r = await handle(req, db, clock);
    return { status: r.status, ...(await r.json()) };
  };
  call.wait = (s) => { clock += s * 1000; };
  return call;
}
const show = (mid, extra = {}) => ({ action: 'result', res: { matchId: mid, rounds: 2, totalRounds: 4, won: false, ...extra } });

test('the copies of the game rules in the Edge Function are up to date (npm run build:functions)', () => {
  for (const rel of closure()) {
    assert.ok(existsSync(outPath(rel)), `missing ${rel}`);
    assert.equal(readFileSync(outPath(rel), 'utf8'), copied(rel), `${rel} is out of date`);
  }
  const all = readdirSync('supabase/functions/cg-api/game', { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => f.split('\\').join('/'));
  assert.deepEqual(all.sort(), closure().sort(), 'no stale files');
});

test('no sign-in, no service', async () => {
  const call = api(fakeDb());
  assert.equal((await call(null, { action: 'me' })).status, 401);
  assert.equal((await call('u1', { action: 'nope' })).status, 400);
});

test('first sign-in makes the account from the guest bean: everything it had (but never the OWNER tag)', async () => {
  const db = fakeDb(), call = api(db);
  const device = { name: 'Jelly Pal', berries: 5000, crowns: 3, xp: 4200, rp: 2000, rpPeak: 2100, wins: 4, owned: ['h_party', 't_owner', 'not_real'], loadout: { hat: 'h_party' }, pbs: { whirlway: 31000, bogus: -5 }, promos: ['o3pqbg'] };
  const a = await call('u1', { action: 'me', device });
  assert.equal(a.status, 200);
  assert.equal(a.created, true);
  assert.equal(a.profile.name, 'Jelly Pal');
  assert.equal(a.profile.berries, 5000);
  assert.equal(a.profile.rp, 2000, 'rank comes along in full');
  assert.equal(a.profile.rpPeak, 2100);
  assert.equal(a.profile.wins, 4);
  assert.equal(a.profile.loadout.hat, 'h_party');
  assert.deepEqual(a.profile.pbs, { whirlway: 31000 }, 'personal bests come along (junk ones don’t)');
  assert.deepEqual(a.profile.promos, ['o3pqbg'], 'used promo codes come along, so they can’t pay twice');
  assert.ok(a.profile.owned.includes('h_party'));
  assert.ok(!a.profile.owned.includes('t_owner') && !a.profile.owned.includes('not_real'));
  assert.equal(a.profile.guest, false);
  const again = await call('u1', { action: 'me', device: { berries: 999999 } });
  assert.equal(again.created, false);
  assert.equal(again.profile.berries, 5000, 'only the first sign-in copies a save');
  // the same name for someone else gets a number on the end
  const b = await call('u2', { action: 'me', name: 'jelly-pal' });
  assert.notEqual(nameKey(b.profile.name), nameKey('Jelly Pal'));
  assert.match(b.profile.name, /^Jelly Pal\d{3}$|^jelly-pal\d{3}$/);
  assert.equal((await call('u2', { action: 'rename', name: 'JELLY PAL' })).error, 'name_taken');
  assert.equal((await call('u2', { action: 'rename', name: 'x' })).status, 400);
  assert.equal((await call('u2', { action: 'rename', name: 'Wobble' })).profile.name, 'Wobble');
});

test('the shop, Locker, CranPass and promo codes follow the game rules', async () => {
  const db = fakeDb(), call = api(db);
  await call('u1', { action: 'me', name: 'Shopper' });
  const s = dailyShop(), dear = [s.featured, ...s.items].map(itemById).sort((a, b) => (b.price.b || 0) - (a.price.b || 0))[0];
  const cheap = [s.featured, ...s.items].map(itemById).filter((it) => it.price.b && !it.price.c).sort((a, b) => a.price.b - b.price.b)[0];
  const before = (await call('u1', { action: 'me' })).profile.berries;
  const bought = await call('u1', { action: 'buy', id: cheap.id });
  assert.equal(bought.status, 200);
  assert.equal(bought.profile.berries, before - cheap.price.b);
  assert.equal((await call('u1', { action: 'buy', id: cheap.id })).message, 'You already own this');
  assert.equal((await call('u1', { action: 'buy', id: 'h_ufo' })).message, 'That item is not in today’s shop');
  if ((dear.price.b || 0) > before) assert.match((await call('u1', { action: 'buy', id: dear.id })).message, /Not enough/);
  assert.equal((await call('u1', { action: 'equip', loadout: { hat: 'h_ufo' } })).message, 'You don’t own that yet');
  assert.equal((await call('u1', { action: 'equip', loadout: { [cheap.slot]: cheap.id } })).profile.loadout[cheap.slot], cheap.id);
  assert.match((await call('u1', { action: 'pass' })).message, /Nothing to claim/);
  assert.match((await call('u1', { action: 'redeem', code: 'not a code' })).message, /doesn’t work/);
});

test('show results pay out once, and not faster than shows can be played', async () => {
  const db = fakeDb(), call = api(db);
  const start = (await call('u1', { action: 'me' })).profile;
  const r1 = await call('u1', show('m1', { rounds: 4, won: true }));
  assert.equal(r1.status, 200);
  assert.ok(r1.reward.crowns === 1 && r1.profile.wins === 1 && r1.profile.berries > start.berries);
  assert.ok(r1.profile.owned.includes('h_crown'), 'first win gives the crown hat');
  call.wait(600);
  assert.equal((await call('u1', show('m1'))).reward, null, 'same match twice pays nothing');
  call.wait(600);
  assert.equal((await call('u1', show('m2'))).status, 200);
  call.wait(5);
  const fast = await call('u1', show('m3', { rounds: 4 }));
  assert.equal(fast.status, 429);
  assert.equal(fast.error, 'too_fast');
  call.wait(LIMITS.gapBase + LIMITS.gapPerRound * 4);
  assert.equal((await call('u1', show('m3', { rounds: 4 }))).status, 200);
});

test('a day has a limit on shows that count', async () => {
  const db = fakeDb(), call = api(db);
  await call('u1', { action: 'me' });
  const p = db.profiles.get('u1'); p.data.day = { d: '2026-11-15', n: LIMITS.perDay };
  call.wait(3600);
  assert.equal((await call('u1', show('late'))).error, 'daily_limit');
  call.wait(24 * 3600);
  assert.equal((await call('u1', show('tomorrow'))).status, 200);
});

const duelRes = (mid, res) => ({ action: 'result', res: { matchId: mid, rounds: res === 1 ? 3 : 1, totalRounds: 4, duel: true, duelWon: res === 1, ranked: { kind: 'duel', opp: 99999, res, score: res === 1 ? [3, 1] : [1, 3], oppName: 'x' } } });

test('ranked duels count only when both players booked them, using their real ranks', async () => {
  const db = fakeDb(), call = api(db);
  await call('a', { action: 'me', name: 'Alpha' }); await call('b', { action: 'me', name: 'Bravo' });
  db.profiles.get('b').data.rp = 450;
  const ba = await call('a', { action: 'book', mid: 'd1', kind: 'duel', opp: 450 });
  assert.ok(ba.booked && ba.profile.rp === 0, 'booked as a loss (Bronze can’t drop below 0)');
  await call('b', { action: 'book', mid: 'd1', kind: 'duel', opp: 0 });
  assert.ok(db.profiles.get('b').data.rp < 450, 'booked as a loss');
  call.wait(200);
  const wa = await call('a', duelRes('d1', 1));
  assert.equal(wa.rankedCounted, true);
  assert.ok(wa.reward.rank.delta >= 28 && wa.reward.rank.delta <= 60, 'a win is a big step, worked out from B’s real 450 RP');
  const lb = await call('b', duelRes('d1', 0));
  assert.equal(lb.rankedCounted, true);
  assert.ok(lb.profile.rp < 450 && lb.profile.rp >= 435);
  // both claiming the win: the second claim doesn't count
  await call('a', { action: 'book', mid: 'd2', kind: 'duel' }); await call('b', { action: 'book', mid: 'd2', kind: 'duel' });
  call.wait(300);
  const rpB = db.profiles.get('b').data.rkPending.from;
  assert.equal((await call('a', duelRes('d2', 1))).rankedCounted, true);
  const cheat = await call('b', duelRes('d2', 1));
  assert.equal(cheat.rankedCounted, false);
  assert.equal(cheat.why, 'disagree');
  assert.equal(cheat.profile.rp, rpB, 'no gain, booked loss undone');
});

test('a ranked duel nobody else booked, or reported straight away, does not move ranked points', async () => {
  const db = fakeDb(), call = api(db);
  await call('a', { action: 'me' });
  await call('a', { action: 'book', mid: 'solo', kind: 'duel' });
  call.wait(200);
  const r = await call('a', duelRes('solo', 1));
  assert.equal(r.rankedCounted, false);
  assert.equal(r.why, 'no_opponent');
  assert.equal(r.profile.rp, 0);
  assert.ok(r.reward.berries > 0, 'berries and XP still paid');
  await call('b', { action: 'me' });
  await call('a', { action: 'book', mid: 'q', kind: 'duel' }); await call('b', { action: 'book', mid: 'q', kind: 'duel' });
  call.wait(1);
  db.profiles.get('a').last_result_at = null;
  assert.equal((await call('a', duelRes('q', 1))).why, 'too_fast');
  call.wait(200);
  assert.equal((await call('a', duelRes('never-booked', 1))).why, 'not_booked');
});

test('ranked shows need enough booked players, and only one can take the crown', async () => {
  const db = fakeDb(), call = api(db), ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
  for (const id of ids) await call(id, { action: 'me', name: 'Bean ' + id });
  const showRes = (mid, place, w) => ({ action: 'result', res: { matchId: mid, rounds: w ? 4 : 2, totalRounds: 4, won: !!w, ranked: { kind: 'show', place, of: 30, avg: 0, w } } });
  for (const id of ids.slice(0, 3)) await call(id, { action: 'book', mid: 's1', kind: 'show' });
  call.wait(300);
  assert.equal((await call('p1', showRes('s1', 1, 1))).why, 'too_few');
  for (const id of ids) await call(id, { action: 'book', mid: 's2', kind: 'show' });
  call.wait(300);
  const win = await call('p1', showRes('s2', 1, 1));
  assert.equal(win.rankedCounted, true);
  assert.equal(win.reward.rank.of, 5, '"of" is capped at the players who booked');
  const fake = await call('p2', showRes('s2', 1, 1));
  assert.equal(fake.rankedCounted, true);
  assert.equal(fake.reward.rank.place, 2, 'the crown was already taken');
});

test('closing the game mid-match leaves the booked loss in place', async () => {
  const db = fakeDb(), call = api(db);
  await call('a', { action: 'me' }); db.profiles.get('a').data.rp = 450;
  await call('a', { action: 'book', mid: 'gone', kind: 'duel' });
  const back = await call('a', { action: 'me' });
  assert.ok(back.settled && back.settled.to < 450);
  assert.equal(back.profile.rkPending, null);
  assert.ok(db.booked.get('gone').get('a').settled_at, 'booking marked as settled');
  call.wait(500);
  const late = await call('a', duelRes('gone', 1));
  assert.equal(late.rankedCounted, false, 'a late result for a settled match doesn’t count');
});

test('world records and personal bests', async () => {
  const db = fakeDb(), call = api(db);
  await call('a', { action: 'me', name: 'Speedy' }); await call('b', { action: 'me', name: 'Zippy' });
  assert.equal((await call('a', { action: 'record', map: 'whirlway', ms: 5000 })).status, 400, 'faster than possible');
  assert.equal((await call('a', { action: 'record', map: 'lobby', ms: 30000 })).status, 400, 'no records there');
  const a = await call('a', { action: 'record', map: 'whirlway', ms: 30000 });
  assert.deepEqual([a.pb, a.record], [true, true]);
  const b = await call('b', { action: 'record', map: 'whirlway', ms: 31000 });
  assert.deepEqual([b.pb, b.record], [true, false]);
  assert.equal(db.records.get('whirlway').name, 'Speedy');
  assert.equal((await call('b', { action: 'record', map: 'whirlway', ms: 29000 })).record, true);
});

test('deleting an account needs a confirmation and removes everything', async () => {
  const db = fakeDb(), call = api(db);
  await call('a', { action: 'me' });
  assert.equal((await call('a', { action: 'delete' })).status, 400);
  assert.equal((await call('a', { action: 'delete', confirm: 'DELETE' })).deleted, true);
  assert.equal(db.profiles.has('a'), false);
});

test('supabase/setup.sql is up to date (npm run build:sql)', async () => {
  const { setupSql } = await import('../tools/build-sql.mjs');
  assert.equal(readFileSync('supabase/setup.sql', 'utf8'), setupSql());
});
