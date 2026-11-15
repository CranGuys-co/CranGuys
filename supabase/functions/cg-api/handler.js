// CranGuys cg-api: everything a signed-in player's account does goes through here, so the browser can never
// set its own Cranberries, items or rank. It runs the game's own rules (src/online/progress.js, copied into
// ./game by `npm run build:functions`) against the save stored in cg_profiles.
//
// Plain JavaScript with the database passed in (`db`), so tests/cloudApi.test.js can run it in Node with an
// in-memory database; index.ts connects it to Supabase.
import * as rules from './game/online/progress.js';
import { cleanName } from './game/online/chatFilter.js';
import { beanName } from './game/online/names.js';
import { itemById, tagOf, levelForXp } from './game/economy/cosmetics.js';
import { cleanRanked, MIN_SHOW_HUMANS } from './game/online/ranks.js';
import { REC_MAPS } from './game/online/records.js';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Limits on what one account can report. A show is hosted in a player's browser, so the server can't watch it
// being played; these keep reports believable and stop anyone farming the boards.
export const LIMITS = {
  gapBase: 10,          // seconds between two show results, plus…
  gapPerRound: 15,      // …this many for every round the newer one says you played
  perDay: 250,          // show results per account per day (UTC)
  bookMin: 15,          // a ranked match must have been booked this many seconds before its result
  importRpCap: 600,     // ranked points a guest save brings into a new account (Gold I); the rest is earned online
  serverOnlyItems: ['t_owner'], // never copied from a device save: only a promo code on the server gives it
};

class Refusal extends Error {
  constructor(message, code = 'refused', status = 400) { super(message); this.code = code; this.status = status; }
}
const refuse = (message, code, status) => new Refusal(message, code, status);
// the game's rules throw plain Errors with a message for the player
const play = (fn) => { try { return fn(); } catch (e) { throw refuse(e.message); } };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const str = (x, max) => String(x == null ? '' : x).slice(0, max);
const int = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? Math.round(+x) : lo));

// one bean per name, ignoring case, accents, spaces and symbols
export const nameKey = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const colorOf = (p) => { const c = itemById(p.loadout && p.loadout.color); return c && /^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : '#ff7af6'; };
const day = (now) => new Date(now).toISOString().slice(0, 10);

// the columns kept next to the save, for the leaderboard
function columns(p, extra = {}) {
  return {
    name: p.name, name_key: nameKey(p.name), data: p, rp: p.rp | 0, wins: p.wins | 0, level: levelForXp(p.xp | 0),
    ranked_played: p.rkPlayed | 0, color: colorOf(p), tag: tagOf(p.owned) || null, ...extra,
  };
}
const view = (p) => ({ ...rules.publicProfile(p), id: 'account', guest: false });

// Load, change and save a profile. If another request saved in between, start again from the fresh copy.
async function change(uid, db, now, fn, extra = () => ({})) {
  for (let tries = 0; tries < 4; tries++) {
    const row = await db.load(uid);
    if (!row) throw refuse('Your account isn’t set up yet — sign in again.', 'no_profile', 409);
    const p = structuredClone(row.data);
    const out = await fn(p, row);
    const saved = await db.update(uid, row.rev, { ...columns(p, extra(p, row)), rev: row.rev + 1, updated_at: new Date(now).toISOString() });
    if (saved === 'ok') return { p, out };
    if (saved === 'name_taken') throw refuse('Someone already has that name — try another.', 'name_taken', 409);
  }
  throw refuse('The server is busy — try again in a moment.', 'busy', 503);
}

// ---------------------------------------------------------------- actions
const ACTIONS = {
  // Sign-in: the account's profile, made the first time (optionally starting from this device's guest save).
  async me(uid, b, db, now) {
    const row = await db.load(uid);
    if (row) {
      // a ranked match booked but never reported back (closed mid-match) stays a loss, as on a device
      if (row.data && row.data.rkPending) {
        const mid = str(row.data.rkPending.mid, 40);
        const { p, out } = await change(uid, db, now, (q) => rules.rankSettle(q));
        if (mid) await db.settle(mid, uid, { settled_at: new Date(now).toISOString(), won: false });
        return { profile: view(p), created: false, settled: out };
      }
      return { profile: view(row.data), created: false };
    }
    const p = rules.newProfile(Math.random);
    const device = b.device && typeof b.device === 'object' ? b.device : null;
    if (device) rules.loadSaveData(p, device, { rpCap: LIMITS.importRpCap, skipItems: LIMITS.serverOnlyItems });
    const wanted = cleanName(b.name || p.name);
    let name = wanted.ok ? wanted.name : p.name;
    for (let tries = 0; tries < 8; tries++) {
      p.name = name;
      const res = await db.insert({ user_id: uid, ...columns(p), rev: 0, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() });
      if (res === 'ok') return { profile: view(p), created: true, imported: !!device };
      if (res === 'exists') return ACTIONS.me(uid, {}, db, now); // made by a request a moment ago
      const base = tries < 5 ? (wanted.ok ? wanted.name : p.name) : beanName(Math.random);
      name = base.slice(0, 12) + String(Math.floor(100 + Math.random() * 900)); // name taken: add a number
    }
    throw refuse('Couldn’t find a free name — try again.', 'busy', 503);
  },

  async rename(uid, b, db, now) {
    const { p } = await change(uid, db, now, (q) => play(() => rules.rename(q, b.name)));
    return { profile: view(p) };
  },
  async equip(uid, b, db, now) {
    const lo = b.loadout && typeof b.loadout === 'object' ? b.loadout : {};
    const { p } = await change(uid, db, now, (q) => play(() => rules.equip(q, lo)));
    return { profile: view(p) };
  },
  async buy(uid, b, db, now) {
    const { p } = await change(uid, db, now, (q) => play(() => rules.buy(q, str(b.id, 40))));
    return { profile: view(p) };
  },
  async pass(uid, b, db, now) {
    const { p, out } = await change(uid, db, now, (q) => play(() => rules.passClaim(q)));
    return { profile: view(p), claim: out };
  },
  async redeem(uid, b, db, now) {
    const { p, out } = await change(uid, db, now, (q) => play(() => rules.redeem(q, str(b.code, 40))));
    return { profile: view(p), promo: out };
  },

  // A ranked match has really started: book it as a loss until the result comes back.
  async book(uid, b, db, now) {
    const mid = str(b.mid, 40), kind = b.kind === 'duel' ? 'duel' : 'show';
    if (!mid) throw refuse('No match id.');
    let older = null;
    const { p, out } = await change(uid, db, now, async (q) => {
      older = q.rkPending && q.rkPending.mid !== mid ? str(q.rkPending.mid, 40) : null; // never came back: a loss
      const booked = rules.rankBook(q, mid, kind, int(b.opp, 0, 99999));
      if (booked) await db.book({ mid, user_id: uid, kind, rp_from: q.rkPending.from | 0, booked_at: new Date(now).toISOString() });
      return booked;
    });
    if (out && older) await db.settle(older, uid, { settled_at: new Date(now).toISOString(), won: false });
    return { profile: view(p), booked: out };
  },

  // A show or duel finished: rewards, stats and (for ranked) points, checked against the bookings.
  async result(uid, b, db, now) {
    const r = b.res && typeof b.res === 'object' ? b.res : {};
    const res = {
      matchId: str(r.matchId, 40), rounds: int(r.rounds, 0, 8), totalRounds: int(r.totalRounds, 1, 8),
      won: !!r.won, duel: !!r.duel, duelWon: !!r.duelWon, ranked: cleanRanked(r.ranked) || undefined,
    };
    if (!res.matchId) throw refuse('No match id.');
    res.rounds = Math.min(res.rounds, res.totalRounds);
    let check = null;
    const { p, out } = await change(uid, db, now, async (q, row) => {
      if ((q.refs || []).includes('match:' + res.matchId)) return null; // already paid out
      const last = row.last_result_at ? Date.parse(row.last_result_at) : 0;
      const gap = (LIMITS.gapBase + LIMITS.gapPerRound * Math.max(1, res.rounds)) * 1000;
      if (now - last < gap) throw refuse('That was quicker than a show can be played, so it didn’t count.', 'too_fast', 429);
      const today = day(now);
      if (!q.day || q.day.d !== today) q.day = { d: today, n: 0 };
      if (q.day.n >= LIMITS.perDay) throw refuse('That’s the most shows that count in one day — come back tomorrow!', 'daily_limit', 429);
      q.day.n++;
      if (res.ranked) check = await checkRanked(uid, res, db, now);
      const ranked = check && check.ok ? check.ranked : undefined;
      const reward = rules.reward(q, { ...res, ranked });
      if (res.ranked && !(check && check.ok)) rules.rankVoid(q, res.matchId);
      return reward;
    }, () => ({ last_result_at: new Date(now).toISOString() }));
    if (check && check.mine) await db.settle(res.matchId, uid, { settled_at: new Date(now).toISOString(), res: check.ok && check.ranked.kind === 'duel' ? check.ranked.res : null, place: check.ok && check.ranked.kind === 'show' ? check.ranked.place : null, won: !!(check.ok && check.ranked.w) });
    return { profile: view(p), reward: out, rankedCounted: res.ranked ? !!(check && check.ok) : undefined, why: check && !check.ok ? check.why : undefined };
  },

  // A finish time on a race: personal best, and the world record if it's the fastest ever.
  async record(uid, b, db, now) {
    const map = str(b.map, 24), ms = int(b.ms, 0, 3600000);
    if (!REC_MAPS[map] || ms < REC_MAPS[map] * 1000 || ms >= 3600000) throw refuse('That time can’t be right.');
    const { p, out } = await change(uid, db, now, (q) => rules.personalBest(q, map, ms));
    const record = await db.setRecord(map, uid, p.name, ms, colorOf(p), tagOf(p.owned) || null);
    return { profile: view(p), pb: out, record };
  },

  // Delete the account and everything stored with it (profile, bookings, records).
  async delete(uid, b, db) {
    if (b.confirm !== 'DELETE') throw refuse('Confirm with DELETE.');
    await db.deleteUser(uid);
    return { deleted: true };
  },
};

// Does this ranked result hold up? The others in the match must have booked it too, and only one can win.
async function checkRanked(uid, res, db, now) {
  const all = await db.bookings(res.matchId), mine = all.find((x) => x.user_id === uid);
  const r = { ...res.ranked };
  if (!mine) return { ok: false, why: 'not_booked' };
  if (mine.settled_at) return { ok: false, why: 'already_settled', mine };
  if (now - Date.parse(mine.booked_at) < LIMITS.bookMin * 1000) return { ok: false, why: 'too_fast', mine };
  if (mine.kind !== (r.kind === 'duel' ? 'duel' : 'show')) return { ok: false, why: 'wrong_kind', mine };
  const others = all.filter((x) => x.user_id !== uid && x.kind === mine.kind);
  if (r.kind === 'duel') {
    const o = others[0];
    if (!o) return { ok: false, why: 'no_opponent', mine };
    r.opp = o.rp_from | 0;                                          // their real rank, not what the game said
    if (o.res != null && Number(o.res) + r.res !== 1) return { ok: false, why: 'disagree', mine }; // both can't win
    return { ok: true, ranked: r, mine };
  }
  if (others.length < MIN_SHOW_HUMANS - 1) return { ok: false, why: 'too_few', mine };
  r.of = Math.min(r.of, others.length + 1); r.place = Math.max(1, Math.min(r.place, r.of));
  r.avg = Math.round(others.reduce((a, x) => a + (x.rp_from | 0), 0) / others.length);
  if (r.w && others.some((x) => x.won)) { r.w = 0; r.place = Math.max(2, r.place); } // somebody already took the crown
  if (r.w) r.place = 1;
  return { ok: true, ranked: r, mine };
}

export async function handle(req, db, now = Date.now()) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method', message: 'Use POST.' });
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const uid = token ? await db.userFromToken(token) : null;
  if (!uid) return json(401, { error: 'auth', message: 'Please sign in again.' });
  let b;
  try { b = await req.json(); } catch { return json(400, { error: 'bad_request', message: 'Bad request.' }); }
  const fn = b && Object.prototype.hasOwnProperty.call(ACTIONS, b.action) ? ACTIONS[b.action] : null;
  if (!fn) return json(400, { error: 'bad_request', message: 'Unknown action.' });
  try {
    return json(200, await fn(uid, b, db, now));
  } catch (e) {
    if (e instanceof Refusal) return json(e.status, { error: e.code, message: e.message });
    throw e;
  }
}
