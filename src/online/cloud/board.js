// The public boards when a Supabase project is set up: the ranked leaderboard, world records, the list of
// public rooms (quick play) and live player counts. All read through the database functions in
// supabase/migrations, so the browser only ever sees public columns.
import { rpc } from './client.js';
import { cleanTag } from '../../economy/cosmetics.js';
import { safeName } from '../chatFilter.js';

const colour = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#ff7af6');

// Highest rank first, in the shape the leaderboard screen draws (id 'me' marks the signed-in player).
export async function top(limit = 100) {
  const rows = (await rpc('cg_top', { lim: limit })) || [];
  return rows.map((r) => ({ id: r.me ? 'me' : 'p' + r.place, n: safeName(r.name), rp: r.rp | 0, w: r.wins | 0, lv: r.level | 0, c: colour(r.color), tg: cleanTag(r.tag), at: 0 }));
}
export async function myPlace() { try { return (await rpc('cg_my_place')) || null; } catch { return null; } }

// map id -> { id, n, t (ms), c, tg, at }, like the old broker records
export async function records() {
  const rows = (await rpc('cg_records_list')) || [];
  return new Map(rows.map((r) => [r.map, { id: r.map, n: safeName(r.name), t: r.ms | 0, c: colour(r.color), tg: cleanTag(r.tag), at: Date.parse(r.at) || 0 }]));
}

export function roomAnnounce(m) {
  return rpc('cg_room_announce', { p_code: m.code, p_v: m.v, p_kind: m.k || '', p_n: m.n | 0, p_left: m.left | 0, p_rp: m.rp | 0, p_since: m.since || 0 });
}
// fresh public rooms on this build, as the 'room' messages hosts used to send each other
export async function roomList(v) {
  const rows = (await rpc('cg_room_list', { p_v: v })) || [];
  const now = Date.now();
  return rows.map((r) => ({ t: 'room', code: r.code, v, n: r.n | 0, left: Math.max(0, (r.left_s | 0) - Math.floor((r.age_ms | 0) / 1000)), at: now - (r.age_ms | 0), since: Number(r.since) || 0, k: r.kind || '', rp: r.rp | 0 }));
}

// Live player counts: the same interface as Presence in p2p.js, but each copy of the game just checks in with
// the database every 20 s instead of messaging every other copy.
export class CloudPresence {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
    this.mode = 'menu'; this.last = { total: 0, menu: 0, online: 0, duel: 0, ranked: 0 }; this.timer = null; this.ok = false;
  }
  async start() {
    if (this.timer) return;
    await this.beat();
    if (!this.ok) throw new Error('live counts unavailable');
    this.timer = setInterval(() => this.beat(), 20000);
  }
  set(mode) { mode = ['online', 'duel', 'ranked'].includes(mode) ? mode : 'menu'; if (mode === this.mode) return; this.mode = mode; this.beat(); }
  async beat(bye = false) {
    try {
      const c = await rpc('cg_live', { p_id: this.id, p_mode: bye ? 'bye' : this.mode });
      this.ok = true;
      if (c && !bye) { this.last = { total: c.total | 0, menu: c.menu | 0, online: c.online | 0, duel: c.duel | 0, ranked: c.ranked | 0 }; this.onChange(this.counts()); }
    } catch { /* offline: try again next time */ }
  }
  counts() { return { ...this.last }; }
  pause(on) {
    if (on) { this.beat(true); clearInterval(this.timer); this.timer = null; }
    else if (!this.timer) { this.beat(); this.timer = setInterval(() => this.beat(), 20000); }
  }
}
