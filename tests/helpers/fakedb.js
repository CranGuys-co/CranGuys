// An in-memory stand-in for the database cg-api uses (supabase/functions/cg-api/index.ts has the real one).
export function fakeDb() {
  const profiles = new Map(), booked = new Map(), records = new Map(), tokens = new Map();
  const nameTaken = (key, uid) => [...profiles.values()].some((r) => r.name_key === key && r.user_id !== uid);
  const clone = (x) => structuredClone(x);
  const db = {
    profiles, booked, records, tokens, deleted: [],
    signIn(uid) { const t = 'token-' + uid; tokens.set(t, uid); return t; },
    async userFromToken(t) { return tokens.get(t) || null; },
    async load(uid) { const r = profiles.get(uid); return r ? clone({ data: r.data, rev: r.rev, last_result_at: r.last_result_at || null, banned: !!r.banned }) : null; },
    async insert(row) {
      if (profiles.has(row.user_id)) return 'exists';
      if (nameTaken(row.name_key, row.user_id)) return 'name_taken';
      profiles.set(row.user_id, clone(row)); return 'ok';
    },
    async update(uid, rev, cols) {
      const r = profiles.get(uid);
      if (!r || r.rev !== rev) return 'conflict';
      if (cols.name_key && nameTaken(cols.name_key, uid)) return 'name_taken';
      Object.assign(r, clone(cols)); return 'ok';
    },
    async bookings(mid) { return clone([...(booked.get(mid) || new Map()).values()]); },
    async book(row) { const m = booked.get(row.mid) || new Map(); if (!m.has(row.user_id)) m.set(row.user_id, { res: null, place: null, won: false, settled_at: null, ...clone(row) }); booked.set(row.mid, m); },
    async settle(mid, uid, cols) { const r = booked.get(mid) && booked.get(mid).get(uid); if (r && !r.settled_at) Object.assign(r, clone(cols)); },
    async setRecord(map, uid, name, ms, color, tag) { const r = records.get(map); if (r && r.ms <= ms) return false; records.set(map, { map, user_id: uid, name, ms, color, tag }); return true; },
    async deleteUser(uid) {
      db.deleted.push(uid); profiles.delete(uid);
      for (const m of booked.values()) m.delete(uid);
      for (const [k, r] of records) if (r.user_id === uid) records.delete(k);
    },
  };
  return db;
}
