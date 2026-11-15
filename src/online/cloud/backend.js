// CranGuys — the save the game plays with. Signed out (or with no Supabase project set up) it's this device's
// guest save, exactly as before (LocalBackend). Signed in, it's the account: every change is made on the server
// by cg-api with the same rules (src/online/progress.js), and this object keeps the latest copy for the game.
// Things the game needs instantly (a show's rewards, a ranked booking) are worked out here first with those same
// rules, then confirmed by the server.
import { LocalBackend } from '../api.js';
import * as rules from '../progress.js';
import { cloudOn } from './config.js';
import { hasSessionHint } from './client.js';
import * as account from './account.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CloudBackend extends LocalBackend {
  constructor() { super(); this.user = null; this.listeners = new Set(); this.q = Promise.resolve(); this.refs = []; this.attaching = false; }
  get signedIn() { return !!this.user; }
  get email() { return (this.user && this.user.email) || ''; }
  // fn(profile, info) whenever the account's copy changes (signed in / out, a server reply…)
  on(fn) { this.listeners.add(fn); }
  emit(info = {}) { for (const fn of this.listeners) { try { fn(this.profile, info); } catch (e) { console.error(e); } } }

  async init() {
    await super.init(); // this device's guest save (as before)
    if (!cloudOn()) return this.profile;
    account.onAuthChange((ev, user) => this.authChanged(ev, user)).catch(() => {});
    if (hasSessionHint()) {
      try { const u = await account.currentUser(); if (u) await this.attach(u); }
      catch (e) { console.info('[cranguys] account unavailable:', e.message); }
    }
    return this.profile;
  }
  // signed in by the emailed link, or signed out in another tab / because the session ran out
  async authChanged(ev, user) {
    if (this.attaching) return;
    if (ev === 'SIGNED_OUT' && this.user) this.detach({ signedOut: true });
    else if (ev === 'SIGNED_IN' && user && !this.user) { try { await this.attach(user); } catch (e) { this.emit({ error: e }); } }
  }
  // Load the account (made on its first sign-in, starting from this device's guest save if bringSave).
  async attach(user, { bringSave = true } = {}) {
    this.attaching = true;
    try {
      const guest = this.load();
      const r = await account.call('me', { name: guest.name, device: bringSave ? rules.saveData(guest) : undefined });
      this.user = user; this.profile = r.profile; this.refs = []; this.settled = r.settled || null;
      this.emit({ signedIn: true, created: !!r.created, imported: !!r.imported, settled: r.settled || null });
      return r;
    } finally { this.attaching = false; }
  }
  detach(info = {}) { this.user = null; this.profile = this.pub(this.load()); this.emit({ signedIn: false, ...info }); }
  async signIn(email, code, opts) {
    this.attaching = true;
    try { const u = await account.verifyCode(email, code); return await this.attach(u, opts); }
    finally { this.attaching = false; }
  }
  async signOut() { await account.signOut(); this.detach({ signedOut: true }); }
  async deleteAccount() { await this.server('delete', { confirm: 'DELETE' }); await account.signOut(); this.detach({ deleted: true }); }

  // One call to cg-api at a time, in order (a ranked booking must land before its result). Network hiccups are
  // retried a couple of times; refusals come back as errors with the message to show.
  server(action, body) {
    const run = async () => {
      for (let i = 0; ; i++) {
        try {
          const r = await account.call(action, body);
          if (r && r.profile && this.user) this.profile = r.profile;
          return r;
        } catch (e) {
          if (e.status === 401 && this.user) { this.detach({ expired: true }); throw new Error('Your sign-in ran out — sign in again.'); }
          if (!e.net || i >= 2) throw e;
          await sleep(i ? 6000 : 2000);
        }
      }
    };
    const p = this.q.then(run, run);
    this.q = p.catch(() => {});
    return p;
  }
  // a guest save change while signed in mustn't replace the account's copy on screen
  save(p) { if (!this.user) return super.save(p); const keep = this.profile, out = super.save(p); this.profile = keep; return out; }

  rankBook(mid, kind, oppRp) {
    if (!this.user) return super.rankBook(mid, kind, oppRp);
    const p = structuredClone(this.profile);
    if (!rules.rankBook(p, mid, kind, oppRp)) return this.profile;
    this.profile = rules.publicProfile(p);
    this.server('book', { mid, kind, opp: oppRp | 0 }).then(() => this.emit({}), (e) => console.warn('[cranguys] ranked booking:', e.message));
    return this.profile;
  }
  async equip(lo) { if (!this.user) return super.equip(lo); return (await this.server('equip', { loadout: lo })).profile; }
  async buy(id) { if (!this.user) return super.buy(id); return (await this.server('buy', { id })).profile; }
  async rename(name) { if (!this.user) return super.rename(name); return (await this.server('rename', { name })).profile; }
  async passClaim() { if (!this.user) return super.passClaim(); const r = await this.server('pass'); return { profile: r.profile, claim: r.claim }; }
  async redeem(code) { if (!this.user) return super.redeem(code); const r = await this.server('redeem', { code }); return { profile: r.profile, promo: r.promo }; }
  personalBest(id, ms) {
    if (!this.user) return super.personalBest(id, ms);
    const pbs = this.profile.pbs || {};
    return !(pbs[id] && pbs[id] <= ms); // the server keeps it (see record)
  }
  // a finish time on a race: personal best and maybe the world record, decided by the server
  async record(id, ms) {
    const r = await this.server('record', { map: id, ms: Math.round(ms) });
    this.emit({});
    return { pb: !!r.pb, record: !!r.record };
  }
  // A show finished: the rewards screen gets the game's own numbers straight away; the server then works them
  // out again (and checks ranked results against the other players' bookings) and its copy replaces ours.
  reward(res) {
    if (!this.user) return super.reward(res);
    const p = structuredClone(this.profile); p.refs = this.refs;
    const r = rules.reward(p, res);
    if (!r) return null;
    this.refs = p.refs; this.profile = rules.publicProfile(p);
    this.server('result', { res }).then((x) => this.emit({ result: x }), (e) => this.emit({ resultError: e }));
    return r;
  }
}

export { CloudBackend };
