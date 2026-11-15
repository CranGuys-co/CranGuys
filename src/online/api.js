// CranGuys — backends. RemoteBackend talks to the CranGuys cloud API (auth, profile, locker, shop).
// LocalBackend is the offline economy stored on this device, used for guests (the rules are in progress.js).
import { store } from '../util.js';
import { dailyShop, itemById } from '../economy/cosmetics.js';
import { beanName } from './names.js';
import { hashStr } from '../sim/math.js';
import { promoFor } from '../economy/promo.js';
import { cleanName } from './chatFilter.js';
import * as rules from './progress.js';
// Save codes let a bean move between devices without a server: CG1-<base64 json>-<checksum>.
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

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
    if (!p) { p = rules.newProfile(Math.random); store.set(KEY, p); }
    if (!cleanName(p.name).ok) { p.name = beanName(Math.random); store.set(KEY, p); } // names set before auto-mod existed
    return p;
  }
  pub(p) { return rules.publicProfile(p); }
  // a random id for this bean on the global leaderboard (never anything personal)
  lbId() { const p = this.load(); if (!p.lbId) { p.lbId = Math.random().toString(36).slice(2, 12); this.save(p); } return p.lbId; }
  save(p) { store.set(KEY, p); this.profile = this.pub(p); return this.profile; }
  async init() {
    const p = this.load();
    // a ranked match that was booked but never reported back (closed / refreshed mid-match) stays a loss
    this.settled = p.rkPending ? rules.rankSettle(p) : null;
    if (this.settled) store.set(KEY, p);
    this.profile = this.pub(p); return this.profile;
  }
  // a ranked match has started: book it as a loss now; the real result replaces it when the match ends
  rankBook(mid, kind, oppRp) { const p = this.load(); if (rules.rankBook(p, mid, kind, oppRp)) this.save(p); return this.profile; }
  async status() { return { online: 1, queue: 0, shows: 0, lobbies: 0 }; }
  async equip(lo) { const p = this.load(); rules.equip(p, lo); return this.save(p); }
  async shop() { const s = dailyShop(); return { ...s, catalog: [s.featured, ...s.items].map(itemById) }; }
  async buy(id) { const p = this.load(); rules.buy(p, id); return this.save(p); }
  async rename(name) { const p = this.load(); rules.rename(p, name); return this.save(p); }
  // personal best time on a map (milliseconds); true if this one beat it
  personalBest(id, ms) { const p = this.load(); if (!rules.personalBest(p, id, ms)) return false; this.save(p); return true; }
  // CranPass: claim every level reached since the last claim (see src/economy/pass.js)
  async passClaim() { const p = this.load(), claim = rules.passClaim(p); return { profile: this.save(p), claim }; }
  // promo codes (see src/economy/promo.js): unlock items once, on this device
  async redeem(code) { const p = this.load(), promo = rules.redeem(p, code); return { profile: this.save(p), promo }; }
  exportCode() {
    const body = b64e(JSON.stringify(rules.saveData(this.load())));
    return `CG1-${body}-${hashStr('cg:' + body).toString(36)}`;
  }
  async importCode(code) {
    const m = /^CG1-([A-Za-z0-9_-]+)-([a-z0-9]+)$/.exec(String(code || '').replace(/\s+/g, ''));
    if (!m || hashStr('cg:' + m[1]).toString(36) !== m[2]) throw new Error('That save code isn’t right — copy the whole thing and try again.');
    let d; try { d = JSON.parse(b64d(m[1])); } catch { throw new Error('That save code isn’t right — copy the whole thing and try again.'); }
    const p = this.load(); rules.loadSaveData(p, d); return this.save(p);
  }
  async register() { throw new Error('Accounts need an online CranGuys server'); }
  async login() { throw new Error('Accounts need an online CranGuys server'); }
  async leaderboard() { const p = this.load(); return [{ name: p.name + ' (you)', wins: p.wins, crowns: p.crowns, xp: p.xp, shows: p.shows }]; }
  async logout() { return this.init(); }
  // authoritative-on-device rewards for offline shows
  reward(res) { const p = this.load(), r = rules.reward(p, res); if (!r) return null; this.save(p); return r; }
}

export { RemoteBackend, LocalBackend };
