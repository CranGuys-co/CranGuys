// CranGuys — backends. RemoteBackend talks to the CranGuys cloud API (auth, profile, locker, shop).
// LocalBackend is the offline economy (same rules, stored on this device) used for bot shows.
import { store } from '../util.js';
import { dailyShop, itemById, DEFAULT_OWNED, DEFAULT_LOADOUT, START_BALANCE, sanitizeLoadout, computeRewards, levelForXp, LEVEL_UP_BONUS } from '../economy/cosmetics.js';
import { beanName } from './names.js';
import { hashStr } from '../sim/math.js';
import { rankedUpdate, rankedBook, rankedSettle } from './ranks.js';
import { promoFor, promoKey } from '../economy/promo.js';
import { passClaimable } from '../economy/pass.js';
import { cleanName } from './chatFilter.js';
// Save codes let a bean move between devices without a server: CG1-<base64 json>-<checksum>.
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const SAVE_FIELDS = ['berries', 'crowns', 'xp', 'wins', 'shows', 'finals', 'rounds', 'rp', 'rpPeak', 'rkPlayed', 'rkWins', 'duelW', 'duelL', 'passClaimed'];

class RemoteBackend {
  constructor(base) { this.kind = 'online'; this.base = base.replace(/\/$/, ''); this.token = store.get('cg.token:' + this.base); this.profile = null; }
  async req(method, path, body) {
    const r = await fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.message || 'Request failed (' + r.status + ')'); e.code = j.error; e.status = r.status; throw e; }
    if (j.token) { this.token = j.token; store.set('cg.token:' + this.base, j.token); }
    if (j.profile) this.profile = j.profile;
    return j;
  }
  async init(name) {
    if (this.token) { try { await this.req('GET', '/api/me'); return this.profile; } catch (e) { if (e.status !== 401) throw e; this.token = null; } }
    await this.req('POST', '/api/auth/guest', { name }); return this.profile;
  }
  async status() { return this.req('GET', '/api/status'); }
  async equip(loadout) { return (await this.req('POST', '/api/locker/equip', { loadout })).profile; }
  async buy(itemId) { return (await this.req('POST', '/api/shop/buy', { itemId })).profile; }
  async redeem(code) { const j = await this.req('POST', '/api/promo', { code }); return { profile: j.profile, promo: promoFor(code) }; }
  async passClaim() { const j = await this.req('POST', '/api/pass/claim', {}); return { profile: j.profile, claim: j.claim }; }
  async shop() { return this.req('GET', '/api/shop'); }
  async rename(name) { return (await this.req('POST', '/api/me/name', { name })).profile; }
  async register(username, password) { return (await this.req('POST', '/api/auth/register', { username, password })).profile; }
  async login(username, password) { return (await this.req('POST', '/api/auth/login', { username, password })).profile; }
  async leaderboard() { return (await this.req('GET', '/api/leaderboard')).top; }
  async logout() { this.token = null; store.del('cg.token:' + this.base); return this.init(); }
  wsUrl() { return this.base.replace(/^http/, 'ws') + '/ws'; }
  setProfile(p) { this.profile = p; }
}

const KEY = 'cg.local.profile';
class LocalBackend {
  constructor() { this.kind = 'offline'; this.profile = null; }
  load() {
    let p = store.get(KEY);
    if (!p) {
      p = { id: 'local', name: beanName(Math.random), username: null, guest: true, ...START_BALANCE, xp: 0, wins: 0, shows: 0, finals: 0, rounds: 0, owned: DEFAULT_OWNED.slice(), loadout: { ...DEFAULT_LOADOUT }, refs: [] };
      store.set(KEY, p);
    }
    if (!cleanName(p.name).ok) { p.name = beanName(Math.random); store.set(KEY, p); } // names set before auto-mod existed
    return p;
  }
  pub(p) { const { refs, ...rest } = p; return { ...rest, rp: p.rp | 0, level: levelForXp(p.xp), passClaimed: Math.max(1, p.passClaimed | 0), loadout: sanitizeLoadout(p.loadout, new Set(p.owned)) }; }
  // a random id for this bean on the global leaderboard (never anything personal)
  lbId() { const p = this.load(); if (!p.lbId) { p.lbId = Math.random().toString(36).slice(2, 12); this.save(p); } return p.lbId; }
  save(p) { store.set(KEY, p); this.profile = this.pub(p); return this.profile; }
  async init() {
    const p = this.load();
    // a ranked match that was booked but never reported back (closed / refreshed mid-match) stays a loss
    this.settled = p.rkPending ? rankedSettle(p) : null;
    if (this.settled) store.set(KEY, p);
    this.profile = this.pub(p); return this.profile;
  }
  // a ranked match has started: book it as a loss now; the real result replaces it when the match ends
  rankBook(mid, kind, oppRp) { const p = this.load(); if (rankedBook(p, mid, kind, oppRp)) this.save(p); return this.profile; }
  async status() { return { online: 1, queue: 0, shows: 0, lobbies: 0 }; }
  async equip(lo) {
    const p = this.load(), owned = new Set(p.owned);
    for (const id of Object.values(lo)) if (id && !owned.has(id)) throw new Error('You don’t own that yet');
    p.loadout = sanitizeLoadout({ ...p.loadout, ...lo }, owned); return this.save(p);
  }
  async shop() { const s = dailyShop(); return { ...s, catalog: [s.featured, ...s.items].map(itemById) }; }
  async buy(id) {
    const p = this.load(), it = itemById(id), s = dailyShop();
    if (!it || (id !== s.featured && !s.items.includes(id))) throw new Error('That item is not in today’s shop');
    if (p.owned.includes(id)) throw new Error('You already own this');
    const b = it.price.b || 0, c = it.price.c || 0;
    if (p.berries < b || p.crowns < c) throw new Error('Not enough ' + (b ? 'Cranberries' : 'Crowns'));
    p.berries -= b; p.crowns -= c; p.owned.push(id); return this.save(p);
  }
  async rename(name) { const c = cleanName(name); if (!c.ok) throw new Error(c.msg); const p = this.load(); p.name = c.name; return this.save(p); } // auto-moderated
  // personal best time on a map (milliseconds); true if this one beat it
  personalBest(id, ms) {
    const p = this.load(), pbs = p.pbs && typeof p.pbs === 'object' ? p.pbs : (p.pbs = {});
    if (pbs[id] && pbs[id] <= ms) return false;
    pbs[id] = Math.round(ms); this.save(p); return true;
  }
  // CranPass: claim every level reached since the last claim (see src/economy/pass.js)
  async passClaim() {
    const p = this.load(), c = passClaimable(p.xp, p.passClaimed, p.owned);
    if (!c.levels.length) throw new Error('Nothing to claim yet — play shows to level up!');
    p.berries += c.berries; p.crowns += c.crowns;
    for (const id of c.items) if (!p.owned.includes(id)) p.owned.push(id);
    p.passClaimed = c.to;
    return { profile: this.save(p), claim: c };
  }
  // promo codes (see src/economy/promo.js): unlock items once, on this device
  async redeem(code) {
    const info = promoFor(code);
    if (!info) throw new Error('That code doesn’t work — check it and try again.');
    const p = this.load(), key = promoKey(code);
    p.promos = p.promos || [];
    const fresh = (info.items || []).filter((id) => itemById(id) && !p.owned.includes(id));
    if (p.promos.includes(key) && !fresh.length) throw new Error('You’ve already used that code!');
    for (const id of fresh) p.owned.push(id);
    if (!p.promos.includes(key)) { p.berries += info.berries | 0; p.crowns += info.crowns | 0; p.promos.push(key); }
    return { profile: this.save(p), promo: info };
  }
  exportCode() {
    const p = this.load(), d = { v: 1, name: p.name, owned: p.owned, loadout: p.loadout };
    for (const k of SAVE_FIELDS) d[k] = p[k] | 0;
    const body = b64e(JSON.stringify(d));
    return `CG1-${body}-${hashStr('cg:' + body).toString(36)}`;
  }
  async importCode(code) {
    const m = /^CG1-([A-Za-z0-9_-]+)-([a-z0-9]+)$/.exec(String(code || '').replace(/\s+/g, ''));
    if (!m || hashStr('cg:' + m[1]).toString(36) !== m[2]) throw new Error('That save code isn’t right — copy the whole thing and try again.');
    let d; try { d = JSON.parse(b64d(m[1])); } catch { throw new Error('That save code isn’t right — copy the whole thing and try again.'); }
    const p = this.load();
    const owned = new Set([...DEFAULT_OWNED, ...(Array.isArray(d.owned) ? d.owned.filter((id) => itemById(id)) : [])]);
    for (const k of SAVE_FIELDS) p[k] = Math.max(0, Math.min(1e9, d[k] | 0));
    p.owned = [...owned];
    p.loadout = sanitizeLoadout({ ...DEFAULT_LOADOUT, ...(d.loadout || {}) }, owned);
    const n = cleanName(d.name); if (n.ok) p.name = n.name;
    return this.save(p);
  }
  async register() { throw new Error('Accounts need an online CranGuys server'); }
  async login() { throw new Error('Accounts need an online CranGuys server'); }
  async leaderboard() { const p = this.load(); return [{ name: p.name + ' (you)', wins: p.wins, crowns: p.crowns, xp: p.xp, shows: p.shows }]; }
  async logout() { return this.init(); }
  // authoritative-on-device rewards for offline shows
  reward(res) {
    const p = this.load(), ref = 'match:' + res.matchId;
    if (p.refs.includes(ref)) return null;
    const r = computeRewards(res), l0 = levelForXp(p.xp);
    p.berries += r.berries; p.crowns += r.crowns; p.xp += r.xp; p.shows++; p.rounds += res.rounds; if (res.won) p.wins++; if (res.rounds >= res.totalRounds - 1) p.finals++;
    const l1 = levelForXp(p.xp); let levelUp = 0;
    if (l1 > l0) { levelUp = l1; p.berries += LEVEL_UP_BONUS * (l1 - l0); }
    if (res.won && !p.owned.includes('h_crown') && p.wins === 1) p.owned.push('h_crown');
    const rank = res.ranked ? rankedUpdate(p, res.ranked, res.matchId) : null; // ranked points live on this device too
    p.refs.push(ref); if (p.refs.length > 50) p.refs.shift();
    this.save(p);
    return { ...r, applied: true, levelUp, bonus: levelUp ? LEVEL_UP_BONUS : 0, rank };
  }
}


export { RemoteBackend, LocalBackend };
