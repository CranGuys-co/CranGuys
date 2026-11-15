// CranGuys — client entry point: boots renderer/audio/input, picks online (CranGuys server) or offline (bots),
// runs the frame loop and drives the show flow between menu, lobby, rounds, podium and rewards.
import { Scene } from './render/scene.js';
import { Sound } from './audio/sound.js';
import { Input } from './input.js';
import { Cam } from './render/camera.js';
import { UI } from './ui/ui.js';
import { isAdFrame, runAdFrame } from './ui/ads.js';
import { ClientGame } from './play.js';
import { RemoteConn, LocalServer } from './online/net.js';
import { P2PHost, P2PClient, findPublicRoom, newCode, cleanCode, p2pSupported, lbFetch, lbPublish, Presence, recFetch, recPublish, REC_MAPS } from './online/p2p.js';
import { isUnreal, rankOf } from './online/ranks.js';
import { Chat } from './ui/chatUI.js';
import { RemoteBackend } from './online/api.js';
import { CloudBackend } from './online/cloud/backend.js';
import { cloudOn } from './online/cloud/config.js';
import { top as cloudTop, records as cloudRecords, CloudPresence } from './online/cloud/board.js';
import { BeanVis } from './render/bean.js';
import { BotBrain } from './sim/bots.js';
import { watchIcons } from './ui/icons.js';
import { $, settings, saveSettings, beanLook, isTouch, hex2rgb, fmtTime } from './util.js';
import { levelMeta } from './levels/index.js';
import { PHASE, TICK_HZ, DT, MODE, TIMING, INTERP_TICKS, BTN, BUILD } from './sim/config.js';
import { crownAt } from './levels/crownpeak.js';
import { windOn, slimeAt } from './sim/world.js';
import { ropeAngle, ropeSeg } from './levels/jumprope.js';
import { rlState } from './levels/redlight.js';
import { cmCycle, cmPhase, CM_COLORS } from './levels/colormatch.js';
import { slotWave, LOW, DUCK } from './levels/wallrush.js';
import { qt, clamp } from './sim/math.js';
import { itemById, tagOf } from './economy/cosmetics.js';
const MENU_STATES = new Set(['menu', 'locker', 'shop', 'pass']);
const NO_TINT = [1, 1, 1, 1], GLOW_GREEN = [0.55, 1.45, 0.6, 1], GLOW_GREEN2 = [0.7, 1.25, 0.72, 1];

class App {
  constructor() {
    this.state = 'boot'; this.game = null; this.conn = null; this.mode = 'offline'; this.onlineOK = false;
    this.menuYaw = 0.35; this.ballRot = new Map(); this.remoteFx = new Map(); this.spectate = -1;
    this.frames = 0; this.fpsT = 0; this.fpsVal = 60; this.lowFps = 0; this.lastHud = 0;
  }

  async boot() {
    watchIcons();
    // safety notice: shown on every visit, only dismissible with Accept
    const sf = $('#safety'); sf.classList.add('show');
    $('#sfAccept').addEventListener('click', () => { sf.classList.remove('show'); sf.remove(); this.sound && this.sound.unlock(); this.accepted = true; this.tryInvite(); });
    addEventListener('keydown', (e) => { if (!this.accepted && e.key === 'Escape') e.preventDefault(); }, true);
    if (isTouch()) document.body.classList.add('touch');
    this.sound = new Sound();
    this.scene = new Scene($('#gl'), this.sound);
    this.ui = new UI(this);
    this.chat = new Chat(this);
    if (!this.scene.ok) { $('#nogl').classList.add('show'); $('#boot').classList.remove('show'); return; }
    this.fx = this.scene.fx;
    this.input = new Input($('#gl'));
    this.input.buildTouch($('#touch'));
    this.cam = new Cam();
    this.applySettings();
    // iPad Safari: block pinch/double-tap zoom gestures, and recover if iOS drops the GL context in the background
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    $('#gl').addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ui.toast('Graphics paused…'); });
    $('#gl').addEventListener('webglcontextrestored', () => location.reload());
    const unlock = () => this.sound.unlock();
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock); addEventListener('touchend', unlock);
    this.ui.boot(0.3, 'Inflating jelly beans…');
    // drag to spin the bean on the menu / locker
    let drag = null;
    $('#gl').addEventListener('pointerdown', (e) => { if (MENU_STATES.has(this.state)) drag = e.clientX; });
    addEventListener('pointermove', (e) => { if (drag !== null) { this.menuYaw += (e.clientX - drag) * 0.012; drag = e.clientX; } });
    addEventListener('pointerup', () => (drag = null));

    // backends: offline always available; online if a CranGuys server answers
    // your save: this device's guest save, or your account once you sign in (src/online/cloud/backend.js)
    this.local = new CloudBackend(); await this.local.init();
    this.local.on((p, info) => this.onAccount(p, info));
    this.watchForUpdates();
    if (this.local.settled) setTimeout(() => this.ui.toast(`Your last ranked match didn’t finish — it counts as a loss (${this.local.settled.to - this.local.settled.from} RP).`, 'bad'), 1500);
    const base = settings.server || (location.protocol.startsWith('http') ? location.origin : '');
    if (base && settings.mode !== 'offline') {
      this.ui.boot(0.55, 'Looking for the CranGuys server…');
      try {
        this.remote = new RemoteBackend(base);
        const st = await Promise.race([this.remote.status(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
        if (st && st.name === 'CranGuys') { await this.remote.init(this.local.profile.name); this.onlineOK = true; }
      } catch (e) { console.info('[cranguys] online unavailable:', e.message); }
    }
    // Solo works anywhere; Online uses the CranGuys server when there is one, otherwise peer-to-peer quick play;
    // Friends makes / joins a private room (peer-to-peer, so it works on static hosting like GitHub Pages).
    this.p2pOK = p2pSupported();
    this.rankKind = settings.rankKind === 'ranked' ? 'ranked' : 'duel';
    this.mode = settings.mode === 'offline' ? 'offline' : (settings.mode === 'friends' || settings.mode === 'ranked') && this.p2pOK ? settings.mode : this.onlineOK || this.p2pOK ? 'online' : 'offline';
    // invite links (…?room=ABCDE) open straight into Friends mode and join once the safety notice is accepted
    const invite = cleanCode(new URLSearchParams(location.search).get('room') || '');
    if (invite.length === 5 && this.p2pOK) { this.mode = 'friends'; this.invite = invite; }
    this.backend = this.mode === 'online' && this.onlineOK ? this.remote : this.local;
    this.ui.boot(0.9, 'Polishing the crown…');
    this.ui.setProfile(this.backend.profile);
    this.ui.setMode(this.mode, this.onlineOK || this.p2pOK);
    this.menuBean = new BeanVis(beanLook(this.backend.profile.loadout));
    this.connect();
    this.syncLeaderboard();
    this.startLive();
    this.ui.boot(1);
    setTimeout(() => { this.goto('menu'); if (this.invite) $('#roomIn').value = this.invite; this.tryInvite(); }, 250);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  applySettings() {
    const q = settings.quality === 'auto' ? (isTouch() ? 1 : 2) : { low: 0, medium: 1, high: 2 }[settings.quality] ?? 1;
    this.scene.setQuality(this.autoDrop ? Math.max(0, q - this.autoDrop) : q);
    this.sound.setVol({ master: settings.master, music: settings.music, sfx: settings.sfx });
    document.documentElement.style.setProperty('--tsize', settings.touchSize);
    for (const b of document.querySelectorAll('.tbtn')) b.style.scale = settings.touchSize;
  }

  // ---------------- connection ----------------
  connect() {
    if (this.conn) { this.conn.close(); this.conn = null; }
    if (this.mode === 'online' && this.onlineOK) {
      this.conn = new RemoteConn(this.remote.wsUrl(), this.remote.token, (m) => this.onMsg(m), (st, code) => this.onConnState(st, code));
    } else this.ui.setStatus(this.idleStatus());
  }
  idleStatus() {
    return this.mode === 'offline' ? 'Solo · 59 bots ready' : this.mode === 'friends' ? 'Create a room or type a code' : this.mode === 'ranked' ? (this.needsAccount() ? 'Sign in to play Ranked' : this.rankKind === 'duel' ? '1v1 · real players only' : `Ranked · needs 5+ real players`) : this.onlineOK ? 'Connected' : 'Online · real players + bots';
  }
  closeConn() { const c = this.conn; this.conn = null; if (c) { try { c.close(); } catch {} } }
  // ---------------- peer-to-peer play (no server needed) ----------------
  p2pConn(Kind, opts) {
    this.closeConn();
    return (this.conn = new Kind({ backend: this.local, onMsg: (m) => this.onMsg(m), onState: (s, x) => this.onP2PState(s, x), ...opts }));
  }
  async hostRoom(isPublic, kind = null) {
    const conn = this.p2pConn(P2PHost, { code: newCode(), isPublic, kind });
    this.state = 'searching'; this.ui.setSearching(true, kind === 'duel' ? 'Opening a duel…' : kind ? 'Opening a ranked show…' : isPublic ? 'Opening a public show…' : 'Creating your room…');
    await conn.start();
  }
  async joinRoom(code, isPublic = false) {
    code = cleanCode(code);
    if (code.length !== 5) { this.sound.play('error'); return this.ui.toast('Room codes are 5 letters/numbers — ask your friend for theirs!', 'bad'); }
    if (this.state === 'show' || (this.state === 'searching' && !isPublic)) return;
    this.sound.unlock(); this.pendingReward = null; this.ui.hideOverlay('rewards');
    const conn = this.p2pConn(P2PClient, { code });
    this.state = 'searching'; this.ui.setSearching(true, isPublic ? 'Joining a show…' : `Joining room ${code}…`);
    const run = conn.start();
    if (isPublic) return run;
    try { await run; } catch (e) { if (this.conn === conn) this.p2pFail(e); }
  }
  async quickPlay() {
    const token = (this.searchToken = {});
    this.state = 'searching'; this.ui.setSearching(true, 'Looking for players online…');
    try {
      const room = await findPublicRoom();
      if (this.searchToken !== token) return;
      if (room) { try { await this.joinRoom(room.code, true); return; } catch (e) { if (this.searchToken !== token) return; } }
      await this.hostRoom(true);
    } catch (e) {
      if (this.searchToken !== token) return;
      this.p2pFail(e);
      if (e && e.code === 'NET') { // no way online from here: drop into a solo show instead of doing nothing
        this.setMode('offline'); this.ui.toast('Playing Solo with bots instead — you can try Online again later.', 'info'); this.play();
      }
    }
  }
  // Ranked: find a public room of the same kind (duels take anyone, whatever their rank), or open one and wait
  async rankedPlay() {
    if (this.needsAccount()) { this.ui.toast('Sign in to play Ranked — your rank is saved to your account.', 'info'); this.ui.accountModal(); return; }
    const kind = this.rankKind, token = (this.searchToken = {});
    this.state = 'searching'; this.ui.setSearching(true, kind === 'duel' ? 'Looking for an opponent — anyone, any rank…' : 'Looking for a ranked show…');
    try {
      const room = await findPublicRoom(2600, kind, this.local.profile.rp | 0);
      if (this.searchToken !== token) return;
      if (room) { try { await this.joinRoom(room.code, true); return; } catch (e) { if (this.searchToken !== token) return; } }
      await this.hostRoom(true, kind);
    } catch (e) { if (this.searchToken === token) this.p2pFail(e); }
  }
  // ---------- live counts & world records (both ride on the public brokers) ----------
  startLive() {
    if (!this.p2pOK) return;
    const counts = (c) => { this.counts = c; this.ui.playerCounts(c); };
    if (cloudOn()) { // counted by the database (falls back to the brokers if Supabase can't be reached)
      this.presence = new CloudPresence(counts);
      this.presence.start().catch(() => { this.presence = new Presence(counts); this.presence.start(); });
    } else { this.presence = new Presence(counts); this.presence.start(); }
    addEventListener('visibilitychange', () => this.presence && this.presence.pause(document.hidden));
    addEventListener('pagehide', () => this.presence && this.presence.beat(true));
    setInterval(() => this.updatePresence(), 2000);
    this.loadRecords();
  }
  // what this player counts as right now (private Friends rooms are never reported)
  updatePresence() {
    if (!this.presence) return;
    const g = this.game, c = this.conn, searching = this.ui && $('#playBtn').classList.contains('searching');
    let m = 'menu';
    if (g && this.state === 'show') m = g.kind === 'duel' ? 'duel' : g.kind === 'ranked' ? 'ranked' : g.room ? 'menu' /* private room */ : c instanceof P2PHost || c instanceof P2PClient || c instanceof RemoteConn ? 'online' : 'menu' /* solo */;
    else if (searching) m = this.mode === 'ranked' ? (this.rankKind === 'duel' ? 'duel' : 'ranked') : this.mode === 'online' ? 'online' : 'menu';
    this.presence.set(m);
  }
  async loadRecords() {
    try { const r = cloudOn() ? await cloudRecords() : await recFetch(); this.records = r; this.ui.recordsChanged(); } catch (e) { /* offline */ }
  }
  // my bean just finished a race / grabbed the crown: personal best, and maybe a world record
  async onFinishTime(levelId, ms) {
    const id = String(levelId).split(':')[0]; if (!REC_MAPS[id] || ms < REC_MAPS[id] * 1000) return;
    if (cloudOn()) return this.onFinishTimeCloud(id, ms);
    const pb = this.local.personalBest(id, ms);
    const cur = this.records && this.records.get(id);
    if (cur && cur.t <= ms) { if (pb) this.ui.feed(`New personal best: ${fmtTime(ms)}!`, 'good'); return; }
    // double-check the latest record (someone may have just beaten it), then claim it
    try {
      const fresh = await recFetch(1800); this.records = fresh; const now = fresh.get(id);
      if (now && now.t <= ms) { if (pb) this.ui.feed(`New personal best: ${fmtTime(ms)}!`, 'good'); return; }
      const p = this.local.profile, look = beanLook(p.loadout);
      await recPublish(id, { n: p.name, t: ms, c: String(look.css).startsWith('#') ? look.css : '#ff7af6', tg: tagOf(p.owned) });
      this.records.set(id, { id, n: p.name, t: ms, c: look.css, tg: tagOf(p.owned), at: Date.now() });
      this.worldRecord(id, ms);
    } catch (e) { if (pb) this.ui.feed(`New personal best: ${fmtTime(ms)}!`, 'good'); }
  }
  // with accounts, the server keeps personal bests and decides world records (guests keep their bests here)
  async onFinishTimeCloud(id, ms) {
    if (!this.local.signedIn) {
      if (this.local.personalBest(id, ms)) this.ui.feed(`New personal best: ${fmtTime(ms)}! Sign in to go for the world record.`, 'good');
      return;
    }
    try {
      const r = await this.local.record(id, ms);
      if (r.record) { await this.loadRecords(); this.worldRecord(id, ms); }
      else if (r.pb) this.ui.feed(`New personal best: ${fmtTime(ms)}!`, 'good');
    } catch (e) { /* offline: the time just doesn't count */ }
  }
  worldRecord(id, ms) {
    this.ui.banner('WORLD RECORD!', 'good', `${fmtTime(ms)} on ${levelMeta(id).name} — the fastest anyone has ever done it!`);
    this.sound.play('confetti'); this.fx.confetti([this.game && this.game.me ? this.game.me.p[0] : 0, 3, this.game && this.game.me ? this.game.me.p[2] : 0], 80, 9);
    this.ui.recordsChanged();
  }
  // A newer build on the website? (Friends must be on the same build to play together, so say so.)
  watchForUpdates() {
    if (BUILD.startsWith('__') || !/^https?:/.test(location.protocol)) return; // unbundled dev copy
    const check = async () => {
      try {
        const r = await fetch(location.href.split('#')[0], { cache: 'no-store' }); if (!r.ok) return;
        const m = /name="cg-build" content="([0-9a-f]+)"/.exec(await r.text());
        if (m && m[1] !== BUILD) this.ui.updateReady();
      } catch (e) { /* offline: try again later */ }
    };
    setTimeout(check, 8000); setInterval(check, 4 * 60 * 1000);
  }
  // CranPass: claim every level reached since the last claim
  async claimPass() {
    if (this.claiming) return; this.claiming = true;
    try {
      const r = await this.backend.passClaim();
      this.backend.profile = r.profile; if (this.backend.setProfile) this.backend.setProfile(r.profile);
      this.ui.setProfile(r.profile); this.refreshBean();
      const c = r.claim || {}, items = (c.items || []).map((id) => itemById(id)).filter(Boolean);
      this.sound.play('buy'); this.fx.confetti([0, 2.2, 0], 70, 8); this.fx.sparkle([0, 1.2, 0], 18, [1, 0.9, 0.4, 1]);
      this.ui.toast(`CranPass: +${c.berries | 0} Cranberries${c.crowns ? ` · +${c.crowns} Crown${c.crowns > 1 ? 's' : ''}` : ''}${items.length ? ' · ' + items.map((i) => i.name).join(', ') : ''}!`, 'good');
    } catch (e) { this.sound.play('error'); this.ui.toast(e.message || 'Couldn’t claim right now.', 'bad'); }
    finally { this.claiming = false; }
  }
  // promo codes: unlock whatever the code gives, on whichever backend this mode uses
  async redeem(code) {
    const before = new Set((this.backend.profile && this.backend.profile.owned) || []);
    const r = await this.backend.redeem(code);
    this.backend.profile = r.profile; if (this.backend.setProfile) this.backend.setProfile(r.profile);
    this.ui.setProfile(r.profile); this.refreshBean(); this.syncLeaderboard();
    return { promo: r.promo, items: (r.promo && r.promo.items || []).filter((id) => !before.has(id) || r.profile.owned.includes(id)) };
  }
  debugThumb(lo, kind, size) { return this.scene.thumb(beanLook(lo), kind, size); } // test hook
  // locker / shop thumbnail: a real render of your bean trying the item on (cached per look)
  thumb(it, slot) {
    if (!this.scene || !this.scene.ok || !it || it.slot === 'tag') return null;
    const p = this.backend.profile, lo = { ...(p && p.loadout) };
    let kind = 'body';
    if (slot === 'color') { lo.color = it.id; lo.hat = 'h_none'; }
    else if (slot === 'color2') { lo.color2 = it.id; if (lo.pattern === 'p_solid') lo.pattern = 'p_stripes'; lo.hat = 'h_none'; }
    else if (slot === 'pattern') { lo.pattern = it.id; lo.hat = 'h_none'; if (lo.color2 === lo.color) lo.color2 = lo.color === 'c_cloud' ? 'c_grape' : 'c_cloud'; }
    else if (slot === 'face') { lo.face = it.id; lo.hat = 'h_none'; kind = 'face'; }
    else { lo.hat = it.id; kind = it.back ? 'back' : it.wrap ? 'head' : 'hat'; } // wrap-round hats are framed with the whole head, capes and wings from behind
    const key = kind + '|' + [lo.color, lo.color2, lo.pattern, lo.face, lo.hat].join();
    this.thumbs = this.thumbs || new Map();
    let u = this.thumbs.get(key);
    if (u === undefined) { try { u = this.scene.thumb(beanLook(lo), kind); } catch (e) { console.warn('thumb', e); u = null; } this.thumbs.set(key, u); if (this.thumbs.size > 400) this.thumbs.delete(this.thumbs.keys().next().value); }
    return u;
  }
  setRankKind(k) {
    if (this.state !== 'menu' && !MENU_STATES.has(this.state)) return;
    this.rankKind = k === 'ranked' ? 'ranked' : 'duel'; settings.rankKind = this.rankKind; saveSettings();
    this.ui.setMode(this.mode, this.onlineOK || this.p2pOK, this.rankKind); this.ui.setStatus(this.idleStatus());
  }
  leaderboard() { return cloudOn() ? cloudTop() : lbFetch(); }
  myLbId() { return cloudOn() ? 'me' : this.local.lbId(); }
  // ranked play needs an account when the game has a Supabase project (so the leaderboard can be trusted)
  needsAccount() { return cloudOn() && !this.local.signedIn; }
  // the account was signed in or out, or the server sent back a fresher copy of it
  onAccount(p, info = {}) {
    if (this.backend === this.local) { this.ui.setProfile(this.local.profile); this.refreshBean(); this.ui.rankCard(); }
    if (MENU_STATES.has(this.state)) this.ui.setStatus(this.idleStatus());
    if (info.signedIn === true) this.ui.toast(info.created ? (info.imported ? `Welcome, ${p.name}! Your bean is now saved to your account.` : `Welcome, ${p.name}!`) : `Signed in — welcome back, ${p.name}!`, 'good');
    if (info.settled) this.ui.toast(`Your last ranked match didn’t finish — it counts as a loss (${info.settled.to - info.settled.from} RP).`, 'bad');
    if (info.signedOut) this.ui.toast('Signed out — you’re playing as a guest on this device.', 'info');
    if (info.expired) this.ui.toast('Your sign-in ran out — sign in again to keep saving to your account.', 'bad');
    if (info.deleted) this.ui.toast('Your account has been deleted.', 'info');
    if (info.result && info.result.rankedCounted === false) this.ui.toast('That ranked match couldn’t be confirmed by the other players, so it didn’t change your rank.', 'info');
    if (info.resultError) this.ui.toast(info.resultError.message, 'bad');
    if (info.result || info.resultError) { this.ui.setProfile(this.local.profile); }
  }
  // Every bean that has played ranked keeps one (anonymous) entry on the global leaderboard: highest rank first.
  // Only republished when something on it changes (name, crowns, rank, colour).
  syncLeaderboard() {
    if (cloudOn()) return; // the server keeps the leaderboard (supabase/functions/cg-api)
    const p = this.local.profile; if (!p || !this.p2pOK) return;
    const w = p.wins | 0, look = beanLook(p.loadout), c = String(look.css).startsWith('#') ? look.css : '#ff7af6', on = (p.rkPlayed | 0) > 0;
    const tg = tagOf(p.owned), sig = on ? ['v3', p.name, p.rp | 0, w, c, p.level, tg].join('|') : '';
    if (sig === (p.lbSig || '') || this.lbBusy) return;
    this.lbBusy = true;
    lbPublish(this.local.lbId(), on ? { n: p.name, w, rp: p.rp | 0, lv: p.level, c, tg } : null)
      .then(() => { const q = this.local.load(); q.lbSig = sig; q.lbOn = on; this.local.save(q); })
      .catch(() => {}).finally(() => { this.lbBusy = false; });
  }
  p2pFail(e) {
    this.closeConn(); this.searchToken = null;
    if (this.state === 'searching') { this.state = 'menu'; this.ui.setSearching(false); this.ui.setStatus(this.idleStatus()); }
    this.sound.play('error'); this.ui.toast(e && e.message ? e.message : 'Couldn’t connect.', 'bad');
  }
  onP2PState(s, x) {
    const g = this.game;
    if (s === 'open' || s === 'hostlost' || s === 'hostleft') this.ui.migrating(false);
    if (s === 'open' && this.conn && !this.conn.isHost && x === 'relay') this.ui.toast('Connected through the relay (a little laggier).', 'info');
    else if (s === 'peers' && g && g.phase === PHASE.LOBBY) { if (x > 0 && this.conn && this.conn.isHost) this.sound.play('join'); }
    else if (s === 'relay') this.ui.toast('Direct link dropped — switched to the relay.', 'bad');
    else if (s === 'migrating') { this.ui.toast(x === 'moved' ? 'The host left — moving the show to a new host…' : 'Lost the host — finding whoever takes over…', 'info'); this.ui.migrating(true); }
    else if (s === 'promote') this.promoteToHost(x);
    else if (s === 'replaced') this.rejoinAsGuest(x);
    else if (s === 'hostleft' || s === 'hostlost') {
      if (this.state === 'show' || this.state === 'podium' || this.state === 'searching') { this.ui.toast(s === 'hostleft' ? 'The host left, so the show is over.' : 'Lost connection to the host.', 'bad'); this.endShow(); }
    } else if (s === 'merge' && (this.mode === 'online' || this.mode === 'ranked') && g && g.phase === PHASE.LOBBY) { // another lonely public room: join it
      const kind = this.conn && this.conn.kind || null;
      this.endShow(true); this.state = 'menu';
      const token = (this.searchToken = {});
      (async () => {
        try { await this.joinRoom(x, true); }
        catch { if (this.searchToken === token) await this.hostRoom(true, kind).catch((e) => this.p2pFail(e)); }
      })();
    }
  }
  // host migration: the old host left and we were next in line, so the show now runs on this device
  async promoteToHost({ state, pid, code }) {
    const host = this.p2pConn(P2PHost, { code, isPublic: !!state.pub, restore: state, selfPid: pid });
    try {
      await host.start();
      this.ui.migrating(false);
      this.ui.toast('The host left — the show carries on, hosted by you now. Keep this tab open!', 'gold');
    } catch (e) { if (this.conn === host) { this.ui.migrating(false); this.p2pFail(e); this.endShow(); } }
  }
  // we were hosting but froze (tab asleep, phone locked) long enough for a guest to take over: hop back in as a guest
  async rejoinAsGuest({ code, pid }) {
    if (this.state !== 'show' && this.state !== 'podium') return;
    this.ui.migrating(true);
    this.ui.toast('You were away, so another player took over hosting — rejoining the show…', 'info');
    const conn = this.p2pConn(P2PClient, { code, pid });
    try { await conn.start(); this.ui.migrating(false); }
    catch (e) { if (this.conn === conn) { this.ui.migrating(false); this.ui.toast('Couldn’t get back into the show.', 'bad'); this.endShow(); } }
  }
  startRoom() { if (this.conn && this.conn.isHost) this.conn.send({ t: 'start' }); }
  tryInvite() {
    if (!this.invite || !this.accepted || this.state !== 'menu') return;
    const code = this.invite; this.invite = null;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch {}
    this.joinRoom(code);
  }
  onConnState(st, code) {
    if (st === 'open') this.ui.setStatus('Connected');
    else if (st === 'reconnecting') { this.ui.setStatus('Reconnecting…', false); if (this.state === 'show') this.ui.toast('Connection lost — reconnecting…', 'bad'); }
    else if (st === 'closed' && code === 4002) this.ui.setStatus('Signed in elsewhere', false);
  }
  setMode(mode) {
    if (mode === this.mode) return;
    if (mode !== 'offline' && !this.onlineOK && !this.p2pOK) return this.ui.toast('Online play isn’t supported in this browser.', 'bad');
    if (this.state !== 'menu' && !MENU_STATES.has(this.state)) return;
    this.cancel();
    this.mode = mode; settings.mode = mode === 'offline' || mode === 'friends' || mode === 'ranked' ? mode : 'auto'; saveSettings();
    this.backend = mode === 'online' && this.onlineOK ? this.remote : this.local;
    this.ui.setMode(mode, this.onlineOK || this.p2pOK); this.clearPreview(); this.ui.setProfile(this.backend.profile); this.refreshBean();
    this.connect();
  }

  onMsg(m) {
    if (m instanceof Uint8Array) { if (this.game) this.game.onMessage(m); return; }
    switch (m.t) {
      case 'welcome':
        if (m.profile && this.mode === 'online') { this.remote.setProfile(m.profile); this.ui.setProfile(m.profile); }
        this.mmStatus(m);
        // a server restart forgets our show: if it doesn't send it back promptly, return to the menu
        if ((this.state === 'show' || this.state === 'podium') && this.conn instanceof RemoteConn) { clearTimeout(this.staleT); this.staleT = setTimeout(() => { if (this.state === 'show' || this.state === 'podium') { this.ui.toast('That show ended while you were away.', 'bad'); this.endShow(); } }, 3000); }
        return;
      case 'mm': return this.mmStatus(m);
      case 'err':
        if (this.state === 'searching' && this.conn instanceof P2PClient) return this.p2pFail(new Error(m.msg || 'Couldn’t join.'));
        if (m.code === 'auth' && this.mode === 'online') { this.remote.token = null; this.remote.init().then(() => this.connect()); return; }
        if (m.code === 'version') { this.ui.toast(m.msg, 'bad'); setTimeout(() => location.reload(), 2500); return; }
        this.ui.toast(m.msg || 'Server error', 'bad'); return;
      case 'left': if (this.state === 'show') this.endShow(); return;
      case 'reward':
        this.pendingReward = m;
        if (m.reward) { this.ui.rankCard(); this.syncLeaderboard(); }
        if (m.profile) { this.backend.profile = m.profile; if (this.backend.setProfile) this.backend.setProfile(m.profile); this.ui.setProfile(m.profile); this.refreshBean(); }
        if (this.state !== 'show' && this.state !== 'podium') { this.ui.rewards(m, this.backend.profile); this.pendingReward = null; }
        return;
      case 'match':
        clearTimeout(this.staleT);
        if (!this.game) this.game = new ClientGame(this);
        this.game.onMessage(m); return;
      default: if (this.game) this.game.onMessage(m);
    }
  }
  mmStatus(m) {
    if (this.mode !== 'online' || !(this.conn instanceof RemoteConn)) return;
    if (m.st === 'queued') this.ui.setSearching(true, `Finding a show… ${Math.floor(m.waited || 0)}s`);
    else if (m.st === 'found') this.ui.setSearching(true, 'Show found! Joining…');
    else if (this.state !== 'searching') this.ui.setStatus(`${m.online} online · ${m.shows} show${m.shows === 1 ? '' : 's'} live`);
  }

  // ---------------- menu actions ----------------
  goto(s) {
    if (s === 'menu' && this.state === 'searching') { this.ui.show('menu'); return; }
    this.state = s; this.ui.show(s); this.input.enabled = false; this.input.release(); this.ui.touch(false);
    this.sound.music('menu');
    $('#nametags').innerHTML = ''; this.ui.tags = [];
  }
  play() {
    this.sound.unlock();
    if (this.state === 'searching' || this.state === 'show') return;
    this.pendingReward = null;
    this.ui.hideOverlay('rewards');
    if (this.mode === 'ranked') { this.sound.play('whoosh'); this.rankedPlay(); return; }
    if (this.mode === 'friends' || (this.mode === 'online' && !this.onlineOK)) {
      this.sound.play('whoosh');
      if (this.mode === 'friends') this.hostRoom(false).catch((e) => this.p2pFail(e));
      else this.quickPlay();
      return;
    }
    if (this.mode === 'offline') {
      if (this.conn) this.conn.close();
      this.conn = new LocalServer(this.local, (m) => this.onMsg(m), () => {});
      this.ui.setSearching(true, 'Filling the lobby with bots…');
    } else {
      if (!this.conn || !this.conn.open) { this.ui.toast('Not connected yet…', 'bad'); return; }
      this.ui.setSearching(true, 'Finding a show…');
    }
    this.state = 'searching';
    this.conn.send({ t: 'queue' });
    this.sound.play('whoosh');
  }
  cancel() {
    if (this.state !== 'searching') return;
    if (this.conn && !(this.conn instanceof RemoteConn)) { this.searchToken = null; this.closeConn(); }
    if (this.conn) this.conn.send({ t: 'unqueue' });
    this.state = 'menu'; this.ui.setSearching(false); this.ui.setStatus(this.idleStatus());
  }
  equip(slot, id) {
    const p = this.backend.profile; const prev = p.loadout[slot];
    p.loadout = { ...p.loadout, [slot]: id };
    this.refreshBean(); this.ui.setProfile(p);
    this.fx.sparkle([0, 1, 0], 8, [1, 1, 1, 1]);
    clearTimeout(this.eqT);
    this.eqT = setTimeout(async () => {
      try { const np = await this.backend.equip(p.loadout); this.ui.setProfile(np); }
      catch (e) { p.loadout = { ...p.loadout, [slot]: prev }; this.refreshBean(); this.ui.setProfile(p); this.ui.toast(e.message, 'bad'); }
    }, 350);
  }
  // try a cosmetic on the menu bean without buying it (shop items, or locked items in the locker)
  tryOn(it, where) {
    if (!it) return;
    const p = this.backend.profile;
    const slot = it.slot === 'color' ? (where === 'shop' ? 'color' : this.ui.colorSlot || 'color') : it.slot;
    if (this.preview && this.preview.id === it.id && this.preview.slot === slot) return this.clearPreview();
    this.preview = { id: it.id, slot, loadout: { ...p.loadout, [slot]: it.id } };
    this.refreshBean(); this.sound.play('pop'); this.fx.sparkle([0, 1.2, 0], 10, [1, 1, 1, 1]);
    this.ui.tryOnBar(it, slot);
  }
  clearPreview() {
    if (!this.preview) return;
    this.preview = null; this.refreshBean(); this.ui.tryOnBar(null);
  }
  refreshBean() { this.menuBean.setLook(beanLook(this.preview ? this.preview.loadout : this.backend.profile.loadout)); }
  async buy(id) {
    const it = itemById(id);
    const price = it.price.c ? `${it.price.c} Crowns` : `${it.price.b} Cranberries`;
    this.ui.confirm(`Buy ${it.name}?`, `This costs ${price}.`, 'Buy it!', async () => {
      try {
        const p = await this.backend.buy(id); this.ui.setProfile(p);
        this.sound.play('buy'); this.fx.confetti([0, 1, 0], 50, 7);
        const pv = this.preview && this.preview.id === id ? this.preview : null;
        if (pv) { this.clearPreview(); this.equip(pv.slot, id); this.ui.toast(`🎉 ${it.name} is yours — and you're wearing it!`, 'good'); }
        else this.ui.toast(`🎉 ${it.name} is yours! Equip it in the Locker.`, 'good');
        if (this.ui.screen === 'shop') this.ui.renderShop(); else if (this.ui.screen === 'locker') this.ui.renderLocker();
      } catch (e) { this.sound.play('error'); this.ui.toast(e.message, 'bad'); }
    });
  }
  async rename(n) { const p = await this.backend.rename(n); this.ui.setProfile(p); if (this.backend !== this.local) await this.local.rename(n).catch(() => {}); this.syncLeaderboard(); }
  async account(kind, u, pw) {
    const p = kind === 'register' ? await this.remote.register(u, pw) : kind === 'login' ? await this.remote.login(u, pw) : await this.remote.logout();
    this.ui.setProfile(p); this.refreshBean(); this.connect();
  }

  // ---------------- show flow (called by ClientGame) ----------------
  onMatch(m) {
    const g = this.game;
    if (this.state !== 'show') this.chat.reset();
    this.state = 'show'; this.ui.setSearching(false); this.blurUI(); this.myResult = null;
    this.ballRot.clear(); this.remoteFx.clear(); this.spectate = -1;
    if (g.phase === PHASE.LOBBY) { this.ui.show('lobby'); this.ui.lobbyInit(g); this.sound.music('lobby'); this.setControls(true); }
    else { this.ui.show('hud'); this.ui.hudRound(g); this.sound.music(g.isFinal ? 'final' : 'round'); this.setControls(g.phase === PHASE.PLAY); }
    // (re)joined mid-round — e.g. after the host left: the round intro must not stay up over the game
    if (g.phase !== PHASE.INTRO) this.ui.hideOverlay('intro');
    if (g.phase === PHASE.PLAY) { this.clearCountdown(); this.wentGo = g.epoch; }
    this.cam.reset(Math.PI, null);
  }
  onRound(m) {
    const g = this.game;
    this.bookRanked();
    this.ui.show('hud'); this.ui.hudRound(g); this.ui.hideOverlay('results'); this.ui.clearBanner();
    this.ui.intro(m, g.level);
    this.setControls(false); this.blurUI();
    this.sound.music(g.isFinal ? 'final' : 'round'); this.sound.play('whoosh');
    this.ballRot.clear(); this.remoteFx.clear(); this.spectate = -1; this.myResult = null; this.cannonQ = [];
    $('#nametags').innerHTML = ''; this.ui.tags = [];
  }
  // ranked: once a match really starts, this device books it as a loss until the real result comes in, so
  // closing or refreshing the page mid-match can't dodge a defeat (see rankedBook in src/online/ranks.js)
  bookRanked() {
    const g = this.game; if (!g || !g.kind || !g.mid || this.conn instanceof RemoteConn) return;
    const me = g.roster.get(g.you); if (!me || me.status === 'x') return;
    const others = [...g.roster.values()].filter((r) => !r.bot && r.slot !== g.you && r.status !== 'gone');
    const opp = others.length ? Math.round(others.reduce((a, r) => a + (r.rp | 0), 0) / others.length) : this.local.profile.rp | 0;
    this.local.rankBook(g.mid, g.kind, opp);
  }
  onSpawn(me) { if (this.game && this.game.phase !== PHASE.PLAY) this.cam.reset(me.yaw, me.p); }
  onPhase(p, m) {
    const g = this.game;
    if (p === PHASE.COUNTDOWN) {
      this.ui.hideOverlay('intro');
      if (g.meActive) this.cam.reset(g.me.yaw, g.me.p);
      const left = m.left;
      clearTimeout(this.cdT1); clearTimeout(this.cdT2); clearTimeout(this.cdT3);
      this.clearCountdown();
      [[3, left - 3], [2, left - 2], [1, left - 1]].forEach(([n, at]) => this.cdTimers.push(setTimeout(() => { this.ui.countdown(n); this.sound.play('count'); }, Math.max(0, at) * 1000)));
      this.cdTimers.push(setTimeout(() => this.go(), Math.max(0, left) * 1000));
    } else if (p === PHASE.PLAY) {
      this.go();

    } else if (p === PHASE.ROUND_END) {
      this.setControls(false); this.sound.play('whistle');
      if (!this.myResult) this.ui.banner(g.level.type === 'survival' ? 'TIME’S UP!' : 'ROUND OVER!', 'info');
    } else if (p === PHASE.LOBBY) { this.ui.show('lobby'); }
  }
  clearCountdown() { for (const t of this.cdTimers || []) clearTimeout(t); this.cdTimers = []; }
  go() {
    if (!this.game || this.wentGo === this.game.epoch) return;
    this.wentGo = this.game.epoch;
    this.clearCountdown(); this.ui.countdown('GO!'); this.sound.play('go');
    if (this.game.meActive) this.setControls(true);
    const L = this.game.level;
    const fin = this.game.isFinal;
    this.ui.objective(L.rl ? 'Run on GREEN · freeze on RED!' : L.rope ? 'Jump the rope · don’t fall off!' : L.type === 'race' ? (fin ? 'First to the finish wins!' : 'Reach the finish line!') : L.type === 'survival' ? (fin ? 'Be the last bean standing!' : 'Don’t fall!') : L.goal || 'Grab the crown at the summit!');
    setTimeout(() => this.ui.objective(''), 3500);
  }
  onRoundWin(slot) { // duels: who took the round
    const g = this.game; if (!g) return;
    const r = g.roster.get(slot);
    if (slot === g.you) { this.myResult = 'q'; this.ui.banner('ROUND WON!', 'good', '⚔ ' + this.duelScore()); this.sound.play('qualify'); if (g.meActive) this.fx.confetti(g.me.p, 60, 10); }
    else if (slot < 0) { this.ui.banner('DRAW!', 'info', 'Nobody takes this round'); }
    else { this.myResult = this.myResult || 'x'; this.ui.banner(`${r ? r.name.toUpperCase() : 'THEY'} TAKE${r ? 'S' : ''} IT`, 'bad', '⚔ ' + this.duelScore()); this.sound.play('eliminated'); }
    this.setControls(false); this.ui.duelBoard(g);
  }
  duelScore() { const g = this.game, ds = [...g.roster.values()].filter((r) => !r.bot && r.status !== 'gone'), me = g.dw[g.you] | 0, o = ds.find((r) => r.slot !== g.you); return `${me} – ${o ? g.dw[o.slot] | 0 : 0}`; }
  onQualify(slot, place) {
    const g = this.game, r = g.roster.get(slot); if (!r) return;
    if (g.duel) { if (slot === g.you) { this.myResult = 'q'; this.setControls(false); } return; } // the round-win banner says it all
    const surv = g.level.type === 'survival';
    if (slot === g.you) {
      this.myResult = 'q';
      this.ui.banner(surv ? 'SURVIVED!' : 'QUALIFIED!', 'good', surv ? '' : `#${place}`);
      this.sound.play('qualify'); this.fx.confetti(g.me.p, 70, 10); this.setControls(false);
    } else if (!surv && (place <= 3 || g.roster.get(slot).userId)) this.ui.feed(`${r.name} qualified #${place}`, 'good');
  }
  onEliminate(slot) {
    const g = this.game, r = g.roster.get(slot); if (!r) return;
    if (g.duel) { if (slot === g.you) { this.myResult = 'x'; this.setControls(false); } return; }
    if (slot === g.you) { this.myResult = 'x'; this.ui.banner('ELIMINATED!', 'bad', 'You can keep spectating'); this.sound.play('eliminated'); this.setControls(false); }
    else if (g.level.type === 'survival' && g.phase === PHASE.PLAY) this.ui.feed(`${r.name} fell!`, 'bad');
  }
  onCrown(slot) {
    const g = this.game, r = g.roster.get(slot);
    if (g.duel) { this.sound.play('crown'); return; } // the round-win banner follows
    this.sound.play('crown');
    if (slot === g.you) { this.myResult = 'q'; this.ui.banner('CROWNED!', 'gold', 'YOU WIN THE SHOW!', true); this.fx.confetti(g.me.p, 120, 12); }
    else if (r) this.ui.banner(r.name.toUpperCase(), 'gold', 'GRABBED THE CROWN!');
  }
  onRoundEnd() {}
  onHoop(slot, h) { // someone went through a hoop
    const g = this.game; if (!g) return;
    if (slot === g.you) {
      this.sound.play(h.v >= 5 ? 'buy' : 'cp'); this.fx.sparkle(h.p, h.v >= 5 ? 26 : 12, h.v >= 5 ? [1, 0.85, 0.3, 1] : [0.6, 1, 0.8, 1]); this.fx.ring(h.p, [1, 1, 1, 0.9]);
      this.ui.feed(h.v >= 5 ? `+${h.v} GOLD HOOP! ✨` : `+${h.v} point${h.v > 1 ? 's' : ''}`, 'good');
    } else { this.fx.sparkle(h.p, 6); this.fx.near(h.p, 'pop', 0.4); }
  }
  // Crown Peak: a cannon will fire at server tick `at` — queue two flashes (0.9 s and 0.45 s before)
  onCannonWarn(i, at) { (this.cannonQ || (this.cannonQ = [])).push({ i, at, n: 0 }); }
  cannonFlashes() {
    const g = this.game, q = this.cannonQ, B = g && g.level.boulders; if (!q || !q.length || !B || !B.xs) return;
    const now = g.serverTick() - INTERP_TICKS;
    for (let k = q.length - 1; k >= 0; k--) {
      const w = q[k], due = w.at - (w.n === 0 ? 0.9 : 0.45) * TICK_HZ;
      if (w.at < now - 30) { q.splice(k, 1); continue; }
      if (now < due) continue;
      w.n++; if (w.n >= 2) q.splice(k, 1);
      const p = [B.xs[w.i], B.y + 0.1, B.z + 2.55]; // the muzzle
      this.fx.add({ p, v: [0, 0, 0], life: 0.26, size: 1.3, grow: 3.2, col: [1, 0.36, 0.14, 1], cell: 0, add: true });
      this.fx.add({ p, v: [0, 0, 0], life: 0.2, size: 0.8, grow: 1.5, col: [1, 0.95, 0.6, 1], cell: 0, add: true });
      this.fx.ring([p[0], p[1] - 0.3, p[2]], [1, 0.5, 0.2, 0.9]);
      this.fx.near(p, 'warn', 0.9);
    }
  }
  onBoom(i) { // Boulder Bash: a cannon fires
    const g = this.game, B = g && g.level.boulders; if (!B || !B.cannons || !B.cannons[i]) return;
    const c = B.cannons[i], p = [c.p[0] - Math.sin(c.yaw) * 1.6, 1.8, c.p[2] - Math.cos(c.yaw) * 1.6];
    this.fx.dust(p, 10, [1, 1, 1, 0.8], 3.5); this.fx.near(p, 'doorthud', 0.8);
  }
  onChat(m) { this.chat.receive(m); }
  onChatBlocked(m) { this.chat.blocked(m); }
  onResults(m) { this.ui.clearBanner(); this.ui.results(m, this.game); }
  onPodium(m) {
    this.state = 'podium'; this.podiumTop = m.top || []; this.ui.hideOverlay('results'); this.ui.clearBanner();
    this.ui.show('podium'); this.ui.podium(m, this.game); this.setControls(false); this.ui.nametags([]);
    this.sound.music('podium'); this.sound.play('confetti'); this.podiumT = 0;
  }
  onShowEnd() { this.endShow(); }
  endShow(quiet) {
    this.clearCountdown(); this.ui.migrating(false);
    this.game = null; this.setControls(false); this.ui.hideOverlay('results'); this.ui.hideOverlay('intro'); this.ui.clearBanner();
    if (this.conn && !(this.conn instanceof RemoteConn)) this.closeConn();
    if (quiet) return;
    this.goto('menu'); this.ui.setSearching(false); this.ui.setStatus(this.idleStatus());
    if (this.pendingReward) { this.ui.rewards(this.pendingReward, this.backend.profile); this.pendingReward = null; this.sound.play('qualify', 0.6); }
  }
  leaveShow(sure) {
    const c = this.conn;
    if (c) c.send({ t: 'leave' }); this.endShow();
  }
  setControls(on) { this.input.enabled = on; this.ui.touch(on); if (!on) this.input.release(); }
  wantControls() {
    const g = this.game;
    if (this.state !== 'show' || !g || !g.level || !g.meActive || this.chatOpen || this.ui.modalOpen()) return false;
    if (this.myResult === 'q' || this.myResult === 'x') return false;
    if (g.phase === PHASE.LOBBY || g.phase === PHASE.PLAY) return true;
    if (g.phase === PHASE.COUNTDOWN) return this.wentGo === g.epoch; // GO! can land a beat before the phase message
    return false;
  }
  blurUI() { const a = document.activeElement; if (a && a !== document.body && a.blur && a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA') a.blur(); }
  cycleSpectate(d) {
    const ids = this.lastRemotes ? this.lastRemotes.map((s) => s.slot) : []; if (!ids.length) return;
    const i = ids.indexOf(this.spectate); this.spectate = ids[(i + d + ids.length) % ids.length];
  }

  onLocalEvents(ev, me) {
    const S = this.sound, F = this.fx, C = this.cam;
    for (let i = 0; i < ev.length; i += 2) {
      const n = ev[i], v = ev[i + 1], p = me.p;
      switch (n) {
        case 'jump': S.play('jump'); F.dust([p[0], p[1] - 0.75, p[2]], 4, [1, 1, 1, 0.5], 1.2); break;
        case 'hop': S.play('hop'); break;
        case 'land': if (v > 6) { S.play('land', clamp(v / 16, 0.2, 1)); F.dust([p[0], p[1] - 0.75, p[2]], v > 14 ? 12 : 6); if (v > 18) C.shake(0.12, 0.2); } break;
        case 'dive': S.play('dive'); break;
        case 'belly': S.play('belly'); F.dust([p[0], p[1] - 0.45, p[2]], 8); break;
        case 'bounce': S.play('bounce'); F.ring([p[0], p[1] - 0.6, p[2]], [0.7, 1, 0.4, 0.9]); C.shake(0.08, 0.2); break;
        case 'bump': S.play('bump'); F.stars([p[0], p[1] - 0.4, p[2]]); break;
        case 'rag': S.play('rag'); F.stars(p); C.shake(0.35, 0.35); break;
        case 'zap': S.play('zap'); F.sparkle(p, 10, [1, 0.3, 0.6, 1]); C.shake(0.3, 0.3); break;
        case 'getup': S.play('getup'); break;
        case 'ledge': S.play('ledge'); break;
        case 'climb': S.play('climb'); break;
        case 'cp': S.play('cp'); this.ui.feed('✔ Checkpoint!', 'good'); break;
        case 'fall': S.play('fall'); F.splash([p[0], this.game ? this.game.level.slimeY + 0.5 : p[1], p[2]]); break;
        case 'respawn': S.play('respawn'); F.sparkle(p, 12); break;
      }
    }
  }

  // Wall Rush: solid blocks in the slot's colour, low (jump) blocks green, raised (dive) bars bright yellow
  // ---------- Rope Rumble & Red Light Rush ----------
  // The giant mascots: beans scaled way up, posed by the map (cranking the rope / turning to look).
  mascots(L, t, dt, now) {
    if (this._mascotFor !== L) {
      this._mascotFor = L;
      const looks = L.rope
        ? [beanLook({ color: 'c_tangerine', color2: 'c_sunny', pattern: 'p_stripes', face: 'f_happy', hat: 'h_party' }), beanLook({ color: 'c_sky', color2: 'c_cloud', pattern: 'p_polka', face: 'f_wink', hat: 'h_propeller' })]
        : [beanLook({ color: 'c_tangerine', color2: 'c_sunny', pattern: 'p_split', face: 'f_classic', hat: 'h_flower' })];
      this._mascots = looks.map((look) => { const vis = new BeanVis(look); vis.scale = L.rope ? 8.5 : 7.5; return { vis, look }; });
    }
    const out = [];
    if (L.rope) {
      const a = ropeAngle(L.rope.plan, t);
      L.rope.mascots.forEach(([x, y, z, yaw], i) => {
        const m = this._mascots[i], sc = m.vis.scale, p = [x, y + 0.78 * sc, z];
        const sw = 1.55 - Math.cos(a) * 0.9, sp = 0.35 + Math.sin(a) * (i ? -0.25 : 0.25); // hands go round with the crank
        m.vis.update(dt, { p, v: [0, 0, 0], yaw, mode: MODE.NORMAL, gr: true, mt: 0 }, now, { pose: [sw, sp, sw, sp, Math.sin(a) * 0.12, -Math.sin(a) * 0.12] });
        out.push({ vis: m.vis, look: m.look, p, st: { mode: MODE.NORMAL } });
      });
    } else {
      const m = this._mascots[0], sc = m.vis.scale, [x, y, z] = L.rl.mascot, p = [x, y + 0.78 * sc, z], st = rlState(L.rl.plan, t);
      // facing away (yaw 0) on green; whips round to face the field (π) for red; a little twitch just before
      let yaw = 0;
      if (st.phase === 'wait') yaw = Math.PI;
      else if (st.phase === 'turn') yaw = Math.PI * Math.min(1, st.u / (L.rl.turn * 0.55));
      else if (st.phase === 'scan') yaw = Math.PI;
      else if (st.u < 0.35) yaw = Math.PI * (1 - st.u / 0.35);
      else if (st.left < 0.4) yaw = Math.sin(now * 40) * 0.12;
      const look = st.phase === 'scan' || st.phase === 'wait';
      m.vis.update(dt, { p, v: [0, 0, 0], yaw, mode: MODE.NORMAL, gr: true, mt: 0 }, now, { pose: look ? [0.2, 0.3, 0.2, 0.3, 0, 0] : [Math.sin(now * 6) * 0.5, 0.5, -Math.sin(now * 6) * 0.5, 0.5, 0, 0], expr: st.phase === 'scan' ? 3 : undefined });
      out.push({ vis: m.vis, look: m.look, p, st: { mode: MODE.NORMAL } });
    }
    return out;
  }
  // the rope glows (hotter when it's whipping down after a fake-out); its shadow darkens as it drops
  ropeTinter(L, t) {
    const R = L.rope, i = ropeSeg(R.plan, t), seg = i >= 0 ? R.plan[i] : null, a = ropeAngle(R.plan, t), low = Math.max(0, Math.cos(a));
    const hot = seg && seg.kind === 'whip', stall = seg && seg.kind === 'stall', pulse = 0.85 + 0.15 * Math.sin(performance.now() / 60);
    const rope = hot ? [1.25, 0.55 * pulse, 0.5, 1] : stall ? [1.2 * pulse, 1.1 * pulse, 0.7, 1] : [1.1, 1.05, 0.85, 1];
    const shadow = [0.55 + low * 0.5, 0.45 - low * 0.25, 0.75 - low * 0.35, 1];
    return (c) => (c.vis.tk === 'rope' ? rope : shadow);
  }
  ropeTick(L, t) {
    const a = ropeAngle(L.rope.plan, t), turn = Math.floor((a + Math.PI) / (Math.PI * 2)); // +1 each time the rope passes the bottom
    if (this._ropeTurn !== undefined && turn > this._ropeTurn) { this.sound.play('rope', 0.9); this.cam.shake(0.08, 0.15); }
    this._ropeTurn = turn;
    const i = ropeSeg(L.rope.plan, t), stall = i >= 0 && L.rope.plan[i].kind === 'stall';
    if (stall && !this._ropeStall) this.sound.play('tease');
    this._ropeStall = stall;
  }
  // Red Light Rush: the spotlight bar is pure light
  rlTinter() { const f = 0.9 + 0.1 * Math.sin(performance.now() / 50); return () => [1.4 * f, 1.35 * f, 0.9, 1]; }
  redLightTick(L, t, beans, ph) {
    const st = rlState(L.rl.plan, t), g = this.game, prev = this._rl;
    this._rl = st.phase;
    if (ph === PHASE.PLAY) {
      if (st.phase === 'green' && prev !== 'green') { this.sound.music('rlgl'); if (prev) this.sound.play('go', 0.6); }
      if (st.phase === 'turn' && prev === 'green') { this.sound.music(null); this.sound.play('scratch'); }
      if (st.phase === 'scan' && prev === 'turn') this.sound.play('scan');
      this.ui.lightHud(st.phase, st.left);
    } else this.ui.lightHud(null);
    // everyone frozen on the field glows green while the mascot looks
    const scan = st.phase === 'scan' && ph === PHASE.PLAY;
    for (const b of beans) {
      const on = scan && b.p[2] > L.rl.z0 + 1 && b.p[2] < L.rl.line;
      b.vis.params.tint = on ? (Math.sin(performance.now() / 90) > -0.3 ? GLOW_GREEN : GLOW_GREEN2) : NO_TINT;
    }
  }
  redLightOff() { this._rl = null; this.ui.lightHud(null); if (this.game) for (const r of this.game.roster.values()) r.vis.params.tint = NO_TINT; }
  onRedLight(slot, x, y, z) { // someone moved while the mascot was looking
    const g = this.game, p = [x / 10, y / 10, z / 10], r = g && g.roster.get(slot);
    for (let i = 0; i < 3; i++) this.fx.ring([p[0], p[1] - 0.6 + i * 0.5, p[2]], [1, 0.15, 0.2, 0.95]);
    this.fx.sparkle(p, 22, [1, 0.2, 0.25, 1]); this.fx.dust([p[0], p[1] - 0.7, p[2]], 10, [1, 0.3, 0.35, 0.9], 3);
    this.fx.near(p, 'buzzer', 0.8);
    if (slot === g.you) { this.sound.play('buzzer'); this.cam.shake(0.3, 0.35); this.ui.banner('YOU MOVED!', 'bad', 'Back to the start line…'); }
    else if (r && !r.bot) this.ui.feed(`${r.name} moved — back to the start!`, 'bad');
  }
  wallTinter(L, t) {
    const plan = L.wall.plan, cols = [[1, 0.37, 0.64, 1], [1, 0.55, 0.25, 1], [0.6, 0.38, 1, 1], [0.25, 0.7, 1, 1], [1, 0.3, 0.45, 1], [0.85, 0.4, 0.95, 1]];
    return (c) => {
      const { s, j } = c.vis.wb, W = slotWave(plan, s, t), k = W ? W.pat[j] : 1;
      return k === LOW ? [0.35, 0.92, 0.55, 1] : k === DUCK ? [1, 0.86, 0.2, 1] : cols[s % cols.length];
    };
  }
  // Colour Clash: tile colours for this cycle, the big screen showing the colour, sinking tiles going dark
  cmTinter(L, t) {
    const P = cmCycle(L.cm.plan, t), ph = cmPhase(P, t), cache = (this._cmc = this._cmc || new Map());
    const rgb = (i) => { let v = cache.get(i); if (!v) cache.set(i, (v = [...hex2rgb(CM_COLORS[i].hex), 1])); return v; };
    const flash = 0.75 + 0.25 * Math.sin(performance.now() / 70);
    return (c) => {
      if (c.vis.cmScreen) { if (!P || ph === 'ready' || ph === 'back') return [1, 1, 1, 1]; const v = rgb(P.target); return ph === 'drop' ? v : [v[0] * flash + (1 - flash), v[1] * flash + (1 - flash), v[2] * flash + (1 - flash), 1]; }
      if (!P) return [0.92, 0.9, 1, 1];
      const ci = P.col[c.vis.cm], v = rgb(ci);
      if ((ph === 'drop' || ph === 'back') && ci !== P.target) return [v[0] * 0.45, v[1] * 0.45, v[2] * 0.45, 1];
      return v;
    };
  }

  // ---------------- frame loop ----------------
  loop(ts) {
    requestAnimationFrame((t) => this.loop(t));
    const raw = Math.max(0, (ts - this.last) / 1000), dt = clamp(raw, 0, 0.1); this.last = ts;
    if (this.conn && this.conn.update) this.conn.update(dt);
    // controls watchdog: whatever order the network messages and timers arrive in, you can move whenever you
    // should be able to (this used to miss the GO! moment now and then, leaving you stuck with no joystick)
    this.chat.sync();
    const want = this.wantControls();
    if (want !== this.input.enabled) this.setControls(want);
    let inp = this.input.poll(this.cam.yaw, dt); inp.lastCam = this.input.lastCamInput;
    // debug/test hook: let the bot AI drive your bean in offline shows (CG.autopilot = true)
    if (this.autopilot && this.input.enabled) {
      const m = this.conn && this.conn.match, pl = m && m.players[this.conn.slot];
      if (pl && pl.st) { this._ap = this._ap || new BotBrain(4242, 0.97); const a = this._ap.input(m, pl); inp = { ...inp, mx: a.mx, mz: a.mz, b: a.b }; }
      else if (this.game && this.game.meActive) inp = { ...inp, mx: Math.sin(performance.now() / 1500) * 0.3, mz: 1, b: Math.random() < 0.03 ? BTN.JUMP : 0 }; // guest: just run forward
    }
    try {
      if ((this.state === 'show') && this.game && this.game.level) this.renderShow(dt, inp);
      else if (this.state === 'podium' && this.game) this.renderPodium(dt);
      else if (this.state !== 'boot') this.renderMenu(dt);
    } catch (e) { console.error(e); }
    // fps + adaptive quality
    this.frames++; this.fpsT += raw;
    if (this.fpsT > 1) {
      this.fpsVal = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0;
      this.ui.fps(`${Math.round(this.fpsVal)} fps · ${this.scene.R.stats.draws} draws` + (this.game && this.game.predTick ? ` · lead ${this.game.lead.toFixed(1)} · buf ${this.game.inbuf}` : ''));
      if (settings.quality === 'auto' && this.state === 'show') {
        this.lowFps = this.fpsVal < 40 ? this.lowFps + 1 : 0;
        if (this.lowFps >= 4 && (this.autoDrop || 0) < 2) { this.autoDrop = (this.autoDrop || 0) + 1; this.lowFps = 0; this.applySettings(); }
      }
    }
  }

  renderMenu(dt) {
    const t = performance.now() / 1000;
    const st = { p: [0, 0.78, 0], v: [0, 0, 0], yaw: this.menuYaw + Math.sin(t * 0.4) * 0.15, mode: MODE.NORMAL, gr: 1, mt: 0 };
    this.menuBean.update(dt, st, t, { menu: true, wave: this.state === 'menu' });
    const narrow = innerWidth < 640, side = this.state !== 'menu';
    const lookX = side && !narrow ? 1.25 * Math.min(1.6, innerWidth / innerHeight) : 0, lookY = side && narrow ? -0.9 : 0.85;
    this.cam.fixed([lookX, 1.25 + (side && narrow ? -1 : 0), 4.4 + (narrow ? 1.6 : 0)], [lookX, lookY, 0], 0.72);
    if (this.menuBean.look.fx && Math.random() < dt * 5) this.fx.sparkle([st.p[0] + (Math.random() - 0.5) * 1.2, st.p[1] + Math.random() * 1.3 - 0.3, st.p[2] + (Math.random() - 0.5) * 1.2], 1, [1, 0.88, 0.4, 1]); // legendary shimmer
    this.scene.renderStage(this.cam, dt, [{ vis: this.menuBean, look: this.menuBean.look, p: st.p, st }]);
  }

  renderPodium(dt) {
    const g = this.game, t = performance.now() / 1000;
    this.podiumT += dt;
    const spots = [[0, 1.6 + 0.78, 0], [-2.6, 1.0 + 0.78, 0], [2.6, 0.65 + 0.78, 0]];
    const beans = [];
    (this.podiumTop || []).slice(0, 3).forEach((slot, i) => {
      const r = g.roster.get(slot); if (!r) return;
      const hop = i === 0 ? Math.max(0, Math.sin(t * 5)) * 0.45 : Math.max(0, Math.sin(t * 4 + i)) * 0.2;
      const p = [spots[i][0], spots[i][1] + hop, spots[i][2]];
      const st = { p, v: [0, hop > 0.01 ? 1 : 0, 0], yaw: 0, mode: MODE.NORMAL, gr: hop < 0.02, mt: 0 };
      r.vis.update(dt, st, t, { celebrate: i === 0, wave: i > 0 });
      beans.push({ vis: r.vis, look: r.look, p, st });
    });
    if (Math.random() < dt * 1.6) this.fx.confetti([(Math.random() - 0.5) * 6, 6, (Math.random() - 0.5) * 3], 30, 4);
    this.cam.fixed([Math.sin(t * 0.25) * 2.2, 3.2, 8.6], [0, 1.9, 0], 0.78);
    this.scene.renderStage(this.cam, dt, beans, { podium: true, crownAt: beans.length && !g.duel ? [0, spots[0][1] + 1.75 + Math.sin(t * 3) * 0.1, 0] : null });
  }

  renderShow(dt, inp) {
    const g = this.game, t = performance.now() / 1000;
    g.update(dt, inp);
    // safety net: the round intro only belongs to the intro phase (a lost phase message can never strand you on it)
    if (g.phase !== PHASE.INTRO && this.ui.overlayOn('intro')) { this.ui.hideOverlay('intro'); if (g.phase === PHASE.PLAY) this.go(); }
    this.cannonFlashes();
    const worldTick = g.meActive && g.predTick !== null ? g.predTick - 1 + g.alpha : g.serverTick() - INTERP_TICKS;
    const worldTime = Math.max(0, worldTick * DT);
    const beans = [];
    let own = null;
    if (g.meActive && g.me.mode !== MODE.OUT) {
      own = g.ownRenderState(); const r = g.roster.get(g.you);
      if (g.me.mode === MODE.RESPAWN) { own.p = this.lastOwnP || own.p; own.v = [0, 0, 0]; }   // hold the camera where we fell
      else { this.lastOwnP = own.p; if (r) { r.vis.update(dt, own, t, { celebrate: this.myResult === 'q' }); beans.push({ p: own.p, st: own, vis: r.vis, look: r.look, slot: g.you }); } }
      // grab feedback: you caught someone / someone caught you
      const grabbing = g.me.mode === MODE.GRABBING, held = g.me.held | 0;
      if (grabbing && !this.wasGrabbing) { this.sound.play('grab'); this.fx.stars([own.p[0] + Math.sin(own.yaw) * 0.9, own.p[1] + 0.3, own.p[2] + Math.cos(own.yaw) * 0.9], 6); }
      if (held && held !== this.wasHeld) { const by = g.roster.get(held - 1); this.ui.feed(`${by ? by.name : 'Someone'} grabbed you!`, 'bad'); this.sound.play('grab', 0.7); }
      this.wasGrabbing = grabbing; this.wasHeld = held;
    }
    const { out, balls } = g.remotes();
    this.lastRemotes = out;
    const eye = this.cam.eye;
    for (const s of out) {
      if (s.mode === MODE.RESPAWN) continue;
      const r = g.roster.get(s.slot); if (!r) continue;
      r.vis.update(dt, s, t);
      beans.push({ p: s.p, st: s, vis: r.vis, look: r.look, slot: s.slot });
      // infer effects for other beans from state changes
      const pr = this.remoteFx.get(s.slot);
      if (pr) {
        const d = Math.hypot(s.p[0] - eye[0], s.p[1] - eye[1], s.p[2] - eye[2]);
        if (d < 32) {
          if (pr.mode !== MODE.RAG && s.mode === MODE.RAG) { this.fx.stars(s.p); this.fx.near(s.p, 'rag', 0.5); }
          if (!pr.gr && s.gr && pr.vy < -9) this.fx.dust([s.p[0], s.p[1] - 0.7, s.p[2]], 5);
          if (s.v[1] > 12 && pr.vy < 6) { this.fx.ring([s.p[0], s.p[1] - 0.6, s.p[2]], [0.7, 1, 0.4, 0.8]); this.fx.near(s.p, 'bounce', 0.4); }
          if (pr.mode !== MODE.DIVE && s.mode === MODE.DIVE) this.fx.near(s.p, 'dive', 0.35);
          if (s.gr && !pr.gr && s.v[1] < 2 && pr.vy > 3) this.fx.near(s.p, 'jump', 0.2);
        }
      }
      this.remoteFx.set(s.slot, { mode: s.mode, gr: s.gr, vy: s.v[1] });
    }
    // rolling boulders
    for (const b of balls) {
      let st = this.ballRot.get(b.id);
      if (!st || Math.hypot(b.p[0] - st.last[0], b.p[2] - st.last[2]) > 6) { st = { q: [0, 0, 0, 1], last: b.p.slice() }; this.ballRot.set(b.id, st); }
      const dx = b.p[0] - st.last[0], dz = b.p[2] - st.last[2], dl = Math.hypot(dx, dz);
      if (dl > 1e-4) st.q = qt.norm(qt.mul(qt.axis([dz / dl, 0, -dx / dl], dl / 1.3), st.q));
      st.last = b.p.slice(); b.q = st.q;
    }
    // ---- camera ----
    const ph = g.phase;
    let spect = null;
    if (ph === PHASE.INTRO && g.introStart && g.level.cam) this.cam.intro((performance.now() - g.introStart) / (TIMING.intro * 1000), g.level.cam);
    else if (own) this.cam.follow(dt, own.p, own.v, g.world, this.input.enabled ? inp : { camDX: 0, camDY: 0 }, Math.floor(worldTick));
    else if (out.length) {
      let tgt = out.find((s) => s.slot === this.spectate);
      if (!tgt) {
        const L = g.level;
        tgt = out.reduce((a, b) => (L.type === 'race' ? b.p[2] > a.p[2] : L.type === 'final' ? b.p[1] + b.p[2] * 0.2 > a.p[1] + a.p[2] * 0.2 : Math.random() < 0.02) ? b : a, out[0]);
        this.spectate = tgt.slot;
      }
      const r = g.roster.get(tgt.slot); spect = r ? r.name : '…';
      this.cam.follow(dt, tgt.p, tgt.v, g.world, inp, Math.floor(worldTick));
      this.ui.touch(false);
    }
    if (window.CG_CAM) this.cam.fixed(window.CG_CAM.e, window.CG_CAM.l, 0.8); // debug / screenshot hook
    // ---- crown ----
    let crown = null;
    if (g.level.type !== 'final' && g.isFinal && g.winner >= 0) { const w = beans.find((b) => b.slot === g.winner); if (w) crown = [w.p[0], w.p[1] + 1.55, w.p[2]]; }
    if (g.level.type === 'final') {
      if (g.winner < 0) crown = crownAt(worldTime);
      else { const w = beans.find((b) => b.slot === g.winner); crown = w ? [w.p[0], w.p[1] + 1.55, w.p[2]] : crownAt(worldTime); }
    }
    if (g.level.fans) for (const f of g.level.fans) if (windOn(f, worldTime) && Math.random() < dt * 22 && Math.abs(f.z - this.cam.look[2]) < 45) this.fx.wind([f.hub[0] + f.dir * 1.2, f.hub[1], f.z], f.dir);
    const L = g.level, rise = L.rules && L.rules.rise;
    const hoops = L.type === 'hunt' ? g.liveHoops(Math.floor(worldTick)) : null;
    if (hoops && Math.random() < dt * 8) for (const o of hoops) if (o.h.v >= 5) this.fx.sparkle(o.h.p, 1, [1, 0.85, 0.3, 1]);
    const kinTint = L.cm ? this.cmTinter(L, worldTime) : L.wall ? this.wallTinter(L, worldTime) : L.rope ? this.ropeTinter(L, worldTime) : L.rl ? this.rlTinter() : null;
    const mascots = L.rope || L.rl ? this.mascots(L, worldTime, dt, t) : null;
    if (L.rl) this.redLightTick(L, worldTime, beans, ph); else if (this._rl) this.redLightOff();
    if (L.rope && ph === PHASE.PLAY) this.ropeTick(L, worldTime);
    if (L.wall && ph === PHASE.PLAY) { // Wall Rush: shout when the walls step up a gear
      const st = L.wall.stages.filter((x) => worldTime >= x).length;
      if (this._wallStage !== undefined && st > this._wallStage) { this.ui.banner(st === 1 ? 'FASTER!' : 'MAXIMUM SPEED!', 'bad', st === 1 ? 'Single gaps · dive under the raised bars' : 'Walls back to back — good luck!'); this.sound.play('whistle'); }
      this._wallStage = st;
    } else this._wallStage = undefined;
    this.scene.renderGame(this.cam, dt, { worldTime, beans, balls, crown, debris: g.debris, tileStates: (d) => g.tileStates(d), doorStates: (d) => g.doorStates(d), focus: own ? own.p : this.cam.look,
      slimeY: rise ? slimeAt(rise, worldTime) : undefined, hoops, kinTint, mascots });
    // ---- nametags ----
    const tags = [];
    if (settings.nametags && ph !== PHASE.INTRO) {
      const R = this.scene.R;
      const list = beans.filter((b) => b.slot !== g.you).map((b) => ({ b, d: Math.hypot(b.p[0] - eye[0], b.p[1] - eye[1], b.p[2] - eye[2]) })).filter((x) => x.d < 34).sort((a, b) => a.d - b.d).slice(0, 24);
      for (const { b, d } of list) {
        const pr = R.project([b.p[0], b.p[1] + 1.2, b.p[2]]);
        if (pr.behind || pr.z > 1) continue;
        const rr = g.roster.get(b.slot);
        tags.push({ name: rr.name, x: pr.x, y: pr.y, s: clamp(1.25 - d / 34, 0.55, 1), h: !rr.bot && b.slot !== g.you, o: rr.tag === 'owner' });
      }
    }
    this.ui.nametags(tags);
    // ---- HUD (throttled) ----
    if (performance.now() - this.lastHud > 100) {
      this.lastHud = performance.now();
      if (ph === PHASE.LOBBY) this.ui.lobbyTick(g); else this.ui.hud(g, own ? null : spect);
    }
  }
}

if (isAdFrame()) runAdFrame(); // this page is only the little ad frame on the menu: show the ad, don't start the game
else {
  const app = new App();
  window.CG = app; // debug / test hook
  app.boot();
}

