// CranGuys — serverless multiplayer for static hosting (GitHub Pages and friends).
//
// One player's browser HOSTS the show: it runs the very same authoritative Match the Node server runs.
// Friends connect to the host peer-to-peer over WebRTC data channels (a reliable channel for game events and
// an unreliable one for snapshots/inputs). Public MQTT-over-WebSocket brokers are only used so browsers can
// find each other (signalling, public room listings) — and, when a direct connection is impossible (strict
// school / office networks without TURN), as a slower relay for the game data itself.
//
// Both classes expose the same small interface as RemoteConn / LocalServer: send(msg), update(dt), close(),
// .open and .rtt, delivering decoded messages (objects or binary snapshots) to onMsg.
import { Match } from '../sim/game.js';
import { sleep } from '../util.js';
import { TICK_HZ, NETV, PHASE } from '../sim/config.js';
import { decodeInput } from '../sim/protocol.js';
import { sanitizeLoadout, tagOf, cleanTag } from '../economy/cosmetics.js';
import { cleanRanked } from './ranks.js';
import { safeName } from './chatFilter.js';
const enc = new TextEncoder(), dec = new TextDecoder();
const P2P = {
  PREFIX: 'cranguys/v3',
  BROKERS: ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'],
  ICE: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }],
  MAX_HUMANS: 16, PUBLIC_LOBBY: 45, JOIN_GRACE: 20, CONNECT_MS: 6000, GATHER_MAX: 2500, ANSWER_MS: 9000, DC_MS: 8000, HOST_SILENT_MS: 7000, PEER_SILENT_MS: 12000,
  BACKUP_MS: 1500, // how often the host sends the full show state to its successors (host migration)
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
};
if (typeof window !== 'undefined' && window.CG_P2P && typeof window.CG_P2P === 'object') Object.assign(P2P, window.CG_P2P); // tests: slow machines
// test / power-user override: window.CG_BROKERS = ['ws://…'] or localStorage 'cg.brokers'
function brokers() {
  try {
    const o = (typeof window !== 'undefined' && window.CG_BROKERS) || JSON.parse(localStorage.getItem('cg.brokers') || 'null');
    if (Array.isArray(o) && o.length) return o;
  } catch {}
  return P2P.BROKERS;
}
const newCode = () => Array.from({ length: 5 }, () => P2P.CODE_CHARS[Math.floor(Math.random() * P2P.CODE_CHARS.length)]).join('');
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const p2pSupported = () => typeof WebSocket !== 'undefined';
const rtcOK = () => typeof RTCPeerConnection !== 'undefined' && !(typeof window !== 'undefined' && window.CG_NO_RTC);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const now = () => performance.now();
const TOPIC = { host: (c) => `${P2P.PREFIX}/r/${c}/h`, client: (c, pid) => `${P2P.PREFIX}/r/${c}/c/${pid}`, pub: `${P2P.PREFIX}/pub` };
const FR = { JSON: 1, BIN: 2 }; // relay frame kinds (signal messages are plain JSON text, first byte '{')

// ---------------------------------------------------------------- minimal MQTT 3.1.1 client (QoS 0)
class MiniMQTT {
  constructor(url, clientId) { this.url = url; this.clientId = clientId; this.ws = null; this.buf = new Uint8Array(0); this.pid = 1; this.connected = false; this.onmessage = null; this.onclose = null; }
  static str(s) { const b = enc.encode(s), o = new Uint8Array(2 + b.length); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
  static packet(header, ...parts) {
    const len = parts.reduce((a, p) => a + p.length, 0), rl = [];
    let x = len; do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; rl.push(d); } while (x > 0);
    const out = new Uint8Array(1 + rl.length + len); out[0] = header; out.set(rl, 1);
    let o = 1 + rl.length; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  connect(timeout) {
    return new Promise((resolve, reject) => {
      let settled = false, ws;
      const fail = (e) => { if (settled) return; settled = true; clearTimeout(to); try { ws && ws.close(); } catch {} reject(e); };
      const to = setTimeout(() => fail(new Error('timeout')), timeout);
      try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { return fail(e); }
      this.ws = ws; ws.binaryType = 'arraybuffer';
      ws.onopen = () => ws.send(MiniMQTT.packet(0x10, MiniMQTT.str('MQTT'), new Uint8Array([4, 0x02, 0, 30]), MiniMQTT.str(this.clientId)));
      ws.onerror = () => fail(new Error('socket error'));
      ws.onclose = () => { const was = this.connected; this.connected = false; clearInterval(this.pinger); if (!settled) fail(new Error('closed')); else if (was && this.onclose) this.onclose(); };
      ws.onmessage = (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        this.feed(new Uint8Array(ev.data), (type, flags, body) => {
          if (type === 2) { // CONNACK
            if (settled) return;
            if (body.length >= 2 && body[1] === 0) { settled = true; clearTimeout(to); this.connected = true; this.pinger = setInterval(() => this.raw(new Uint8Array([0xc0, 0])), 20000); resolve(this); }
            else fail(new Error('refused'));
          } else if (type === 3) this.onPublish(flags, body);
        });
      };
    });
  }
  subscribe(topic) { const id = (this.pid++ % 65535) + 1; this.raw(MiniMQTT.packet(0x82, new Uint8Array([id >> 8, id & 255]), MiniMQTT.str(topic), new Uint8Array([0]))); }
  publish(topic, payload, retain = false) { this.raw(MiniMQTT.packet(retain ? 0x31 : 0x30, MiniMQTT.str(topic), typeof payload === 'string' ? enc.encode(payload) : payload)); }
  close() { const was = this.connected; this.connected = false; clearInterval(this.pinger); this.onclose = null; try { if (was) this.raw(new Uint8Array([0xe0, 0])); this.ws && this.ws.close(); } catch {} }
  raw(bytes) { if (this.ws && this.ws.readyState === 1) { try { this.ws.send(bytes); } catch {} } }
  feed(chunk, cb) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length);
    let off = 0;
    for (;;) {
      if (b.length - off < 2) break;
      let mul = 1, len = 0, i = off + 1, ok = false;
      for (let k = 0; k < 4 && i < b.length; k++) { const c = b[i++]; len += (c & 127) * mul; mul *= 128; if (!(c & 128)) { ok = true; break; } }
      if (!ok || b.length - i < len) break;
      try { cb(b[off] >> 4, b[off] & 15, b.subarray(i, i + len)); } catch (e) { console.error(e); }
      off = i + len;
    }
    this.buf = b.slice(off);
  }
  onPublish(flags, body) {
    if (body.length < 2) return;
    const tl = (body[0] << 8) | body[1], topic = dec.decode(body.subarray(2, 2 + tl));
    let p = 2 + tl; if ((flags >> 1) & 3) p += 2;
    if (this.onmessage) this.onmessage(topic, body.slice(p));
  }
}

// ---------------------------------------------------------------- broker hub
// The host listens on every reachable broker; a client uses the first one that answers. The host always
// replies through the connection a client's message arrived on, so both ends share a broker.
class Hub {
  constructor(all, onMsg) { this.all = all; this.onMsg = onMsg; this.conns = new Set(); this.subs = new Set(); this.closed = false; }
  open() {
    const urls = brokers();
    return new Promise((resolve, reject) => {
      let left = urls.length, won = false;
      for (const url of urls) {
        this.dial(url).then((c) => { if (!won) { won = true; resolve(c); } }).catch(() => {})
          .then(() => { if (--left === 0 && !won) { const e = new Error('Can’t reach online play right now — check your internet connection (some school networks block it).'); e.code = 'NET'; reject(e); } });
      }
    });
  }
  dial(url) {
    const c = new MiniMQTT(url, 'cg-' + uid());
    return c.connect(P2P.CONNECT_MS).then(() => {
      if (this.closed || (!this.all && this.conns.size)) { c.close(); throw new Error('unneeded'); }
      c.onmessage = (topic, data) => { if (!this.closed) this.onMsg(topic, data, c); };
      c.onclose = () => { this.conns.delete(c); if (!this.closed && (this.all || !this.conns.size)) setTimeout(() => { if (!this.closed && (this.all || !this.conns.size)) this.dial(url).catch(() => {}); }, 2500); };
      for (const t of this.subs) c.subscribe(t);
      this.conns.add(c);
      return c;
    });
  }
  get count() { return this.conns.size; }
  sub(topic) { this.subs.add(topic); for (const c of this.conns) c.subscribe(topic); }
  pub(topic, data, via, retain) { if (via && this.conns.has(via)) via.publish(topic, data, retain); else for (const c of this.conns) c.publish(topic, data, retain); }
  close() { this.closed = true; for (const c of this.conns) c.close(); this.conns.clear(); }
}

// ---------------------------------------------------------------- WebRTC peer (two data channels)
class Peer {
  constructor(offerer) {
    this.h = {}; this.rel = null; this.fast = null; this.closed = false;
    this.pc = new RTCPeerConnection({ iceServers: P2P.ICE });
    this.pc.onconnectionstatechange = () => { const s = this.pc.connectionState; if (s === 'failed' || s === 'closed') this.emit('down', s); };
    if (offerer) { this.bind(this.pc.createDataChannel('rel', { ordered: true })); this.bind(this.pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 })); }
    else this.pc.ondatachannel = (e) => this.bind(e.channel);
  }
  on(ev, fn) { this.h[ev] = fn; return this; }
  emit(ev, a) { const f = this.h[ev]; if (f && !this.closed) { try { f(a); } catch (e) { console.error(e); } } }
  bind(dc) {
    dc.binaryType = 'arraybuffer';
    if (dc.label === 'fast') this.fast = dc; else this.rel = dc;
    dc.onopen = () => { if (this.open) this.emit('open'); };
    dc.onclose = () => this.emit('down', 'closed');
    dc.onmessage = (e) => this.emit('data', e.data);
  }
  get open() { return !!(this.rel && this.fast && this.rel.readyState === 'open' && this.fast.readyState === 'open'); }
  // objects / strings -> reliable channel; Uint8Array (snapshots, inputs) -> fast unreliable channel
  send(m) {
    try {
      if (m instanceof Uint8Array) { if (this.fast && this.fast.readyState === 'open' && this.fast.bufferedAmount < 262144) this.fast.send(m); }
      else if (this.rel && this.rel.readyState === 'open') this.rel.send(typeof m === 'string' ? m : JSON.stringify(m));
    } catch {}
  }
  gather() {
    const pc = this.pc;
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t0 = now(); let last = t0, srflx = false, done = false;
      const onCand = (e) => { last = now(); if (!e.candidate) finish(); else if (/ typ (srflx|relay)/.test(e.candidate.candidate)) srflx = true; };
      const iv = setInterval(() => { const t = now(); if (pc.iceGatheringState === 'complete' || t - t0 > P2P.GATHER_MAX || (srflx && t - last > 600)) finish(); }, 100);
      function finish() { if (done) return; done = true; clearInterval(iv); pc.removeEventListener('icecandidate', onCand); res(); }
      pc.addEventListener('icecandidate', onCand);
    });
  }
  desc() { const d = this.pc.localDescription; return { type: d.type, sdp: d.sdp }; }
  async createOffer() { await this.pc.setLocalDescription(await this.pc.createOffer()); await this.gather(); return this.desc(); }
  async acceptOffer(d) { await this.pc.setRemoteDescription(d); await this.pc.setLocalDescription(await this.pc.createAnswer()); await this.gather(); return this.desc(); }
  async acceptAnswer(d) { await this.pc.setRemoteDescription(d); }
  close() { if (this.closed) return; this.closed = true; this.h = {}; try { this.rel && this.rel.close(); this.fast && this.fast.close(); } catch {} try { this.pc.close(); } catch {} }
}

const frame = (kind, pid, body) => { // [kind][pidLen][pid…][body…]
  const p = enc.encode(pid || ''), f = new Uint8Array(2 + p.length + body.length);
  f[0] = kind; f[1] = p.length; f.set(p, 2); f.set(body, 2 + p.length); return f;
};

// ---------------------------------------------------------------- host: runs the show
class P2PHost {
  constructor({ backend, code, isPublic, kind, onMsg, onState, restore, selfPid }) {
    this.backend = backend; this.code = code; this.isPublic = !!isPublic; this.onMsg = onMsg; this.onState = onState || (() => {});
    this.kind = (restore && restore.kind) || (kind === 'duel' || kind === 'ranked' ? kind : null); // ranked rooms are always public
    this.restoreState = restore || null; this.pid = selfPid || uid(); this.succ = []; this.migrated = false;
    this.gen = restore ? (restore.gen | 0) + 1 : 0; // host generation: bumps every time the show changes hands
    this.isHost = true; this.open = false; this.rtt = 0; this.q = []; this.peers = new Map(); this.bySlot = new Map();
    this.match = null; this.slot = -1; this.acc = 0; this.lastPump = 0; this.closed = false;
    this.hub = new Hub(true, (t, d, via) => this.onRelay(t, d, via));
  }
  async start() {
    this.hub.sub(TOPIC.host(this.code));
    if (this.isPublic) this.hub.sub(TOPIC.pub);
    await this.hub.open();
    if (this.closed) return;
    if (this.restoreState) this.adopt(this.restoreState); else this.createMatch();
    this.open = true; this.onState('open');
    if (this.isPublic) { this.annT = setInterval(() => this.announce(), 2000); this.announce(); }
    this.tickT = setInterval(() => this.pump(), 1000 / 60); // keeps the show running even if rendering stalls
    this.backT = setInterval(() => this.backupTick(), P2P.BACKUP_MS);
    // a show that changed hands keeps saying so on the room's channel: if the old host was only frozen
    // (tab asleep, phone locked) it hears this when it wakes up and rejoins as a guest instead of splitting the room
    if (this.gen > 0) { const say = () => this.hub.pub(TOPIC.host(this.code), JSON.stringify({ t: 'takeover', gen: this.gen, by: this.pid })); say(); this.takeT = setInterval(say, 4000); }
    // closing the tab or app hands the show over instead of ending it (best effort)
    this.onHide = () => { if (this.migrateAway()) this.shutdown('moved'); };
    if (typeof addEventListener !== 'undefined') addEventListener('pagehide', this.onHide);
  }
  matchIO() {
    return {
      send: (slot, msg) => { if (!this.closed) this.route(slot, msg); },
      hooks: {
        onPlayerDone: (pl, res) => {
          if (pl.slot === this.slot) { const rw = this.backend.reward(res); this.deliver({ t: 'reward', ...res, reward: rw, profile: this.backend.profile }); }
          else { const e = this.bySlot.get(pl.slot); if (e) this.sendTo(e, { t: 'reward', ...res }); }
        },
        onEnd: () => setTimeout(() => this.shutdown('done'), 1500),
      },
    };
  }
  createMatch() {
    const p = this.backend.profile;
    const match = (this.match = new Match({
      lobbySecs: this.isPublic ? P2P.PUBLIC_LOBBY : 900, hold: !this.isPublic, kind: this.kind,
      show: typeof window !== 'undefined' && Array.isArray(window.CG_SHOW) && !this.kind ? window.CG_SHOW : undefined,
      ...this.matchIO(),
    }));
    match.room = this.isPublic ? null : this.code;
    this.slot = match.addPlayer({ userId: 'p2p:' + this.pid, name: safeName(p.name), cos: p.loadout, rk: p.rp | 0, tag: tagOf(p.owned) }); // same id scheme as guests, so we can rejoin as one
    match.welcome(this.slot);
  }
  // Host migration: carry on someone else's show from their last backup.
  adopt(S) {
    const m = (this.match = Match.restore(S, this.matchIO()));
    m.room = S.room;
    const me = m.players.find((p) => p.userId === 'p2p:' + this.pid && !p.left);
    if (!me) throw new Error('Couldn’t take over the show.');
    this.slot = me.slot; me.conn = true; me.dcAt = m.gt;
    // everyone else - the old host too, if it only froze or dropped out - gets a seat waiting for them
    for (const p of m.players) { // everyone else gets a seat waiting for them; they reconnect with the same id
      if (p.bot || p.left || p.slot === this.slot || !String(p.userId || '').startsWith('p2p:')) continue;
      const e = { pid: p.userId.slice(4), slot: p.slot, via: null, peer: null, relay: false, seen: now(), lost: true, gone: false };
      this.peers.set(e.pid, e); this.bySlot.set(e.slot, e);
      if (m.phase === PHASE.LOBBY) m.disconnect(p.slot); // lobby seats are re-taken on reconnect
    }
    m.welcome(this.slot);
  }
  // Pick up to two guests who would take over if we vanished, and keep them supplied with the full state.
  backupTick() {
    const m = this.match; if (!m || m.ended || this.closed) return;
    const cands = [...this.bySlot.values()].filter((e) => !e.lost && !e.gone && m.players[e.slot] && !m.players[e.slot].left);
    cands.sort((a, b) => (b.peer && b.peer.open ? 1 : 0) - (a.peer && a.peer.open ? 1 : 0) || a.slot - b.slot);
    const succ = cands.slice(0, 2).map((e) => e.pid);
    if (succ.join() !== this.succ.join()) {
      this.succ = succ; const s = JSON.stringify({ t: 'succ', list: succ });
      for (const e of this.bySlot.values()) this.sendTo(e, null, s);
    }
    if (!succ.length || m.phase >= PHASE.PODIUM) return;
    const s = JSON.stringify({ t: 'backup', state: { ...m.saveState(this.slot), pub: this.isPublic, gen: this.gen } });
    for (const pid of succ) { const e = this.peers.get(pid); if (e) this.sendTo(e, null, s); }
  }
  // Leaving on purpose: hand the show to the first successor and point everyone else at it.
  migrateAway() {
    const m = this.match;
    if (!this.closed && m && !this.succ.length) this.backupTick(); // someone only just joined: pick a successor now
    if (this.closed || this.migrated || !m || m.ended || m.phase >= PHASE.PODIUM || !this.succ.length) return false;
    const s0 = this.peers.get(this.succ[0]); if (!s0) return false;
    if (m.players[this.slot] && !m.players[this.slot].left) m.leave(this.slot); // we leave like any player (and keep our rewards)
    this.sendTo(s0, { t: 'migrate', state: { ...m.saveState(this.slot), pub: this.isPublic, gen: this.gen } });
    for (const e of this.bySlot.values()) if (e !== s0) this.sendTo(e, { t: 'hostmove', pid: this.succ[0] });
    this.migrated = true;
    return true;
  }
  // someone else is running this show now (we froze for too long): hand our guests over and rejoin as a guest
  onTakeover(m) {
    if (this.closed || !this.match || m.by === this.pid || !(m.gen > this.gen) || typeof m.by !== 'string') return;
    for (const e of this.bySlot.values()) this.sendTo(e, { t: 'hostmove', pid: m.by });
    this.migrated = true;
    this.shutdown('replaced');
    this.onState('replaced', { code: this.code, pid: this.pid });
  }
  humans() { let n = 0; if (this.match) for (const p of this.match.players) if (!p.bot && !p.left && p.status !== 'gone') n++; return n; }
  guests() { return this.humans() - 1; }
  cap() { return this.kind === 'duel' ? 2 : P2P.MAX_HUMANS; }
  announce() {
    const m = this.match; if (!m || m.ended || m.locked || m.phase !== PHASE.LOBBY || this.humans() >= this.cap()) return;
    this.hub.pub(TOPIC.pub, JSON.stringify({ t: 'room', code: this.code, v: NETV, n: this.humans(), left: Math.round(m.phaseT / TICK_HZ), at: Date.now(), since: this.since || (this.since = Date.now()), k: this.kind || '', rp: this.backend.profile.rp | 0 }));
  }
  // Two lonely public hosts of the same kind at once? The one with the 'bigger' code hops into the other room.
  onListing(data) {
    let r; try { r = JSON.parse(dec.decode(data)); } catch { return; }
    const m = this.match;
    if (!r || r.t !== 'room' || r.v !== NETV || r.code === this.code || this.merged || !m || m.locked || this.guests() > 0) return;
    if ((r.k || '') !== (this.kind || '')) return;
    if ((r.n > 1 || r.code < this.code) && r.left >= 10 && r.n < this.cap()) { this.merged = true; this.onState('merge', r.code); }
  }
  // Match -> players
  route(slot, msg) {
    if (slot === -1) {
      this.deliver(msg);
      if (this.bySlot.size) { const s = msg instanceof Uint8Array ? null : JSON.stringify(msg); for (const e of this.bySlot.values()) this.sendTo(e, msg, s); }
      return;
    }
    if (slot === this.slot) return this.deliver(msg);
    const e = this.bySlot.get(slot); if (e) this.sendTo(e, msg);
  }
  deliver(m) {
    if (m instanceof Uint8Array && this.q.length > 120) this.q = this.q.filter((x) => !(x instanceof Uint8Array)); // tab was asleep: drop stale snapshots
    this.q.push(m);
  }
  sendTo(e, msg, str) {
    if (!e || e.gone) return;
    const bin = msg instanceof Uint8Array;
    // messages only need the reliable channel: a new guest's hello can arrive on it a moment before the fast channel
    // opens, and the welcome back mustn't be dropped (the guest would wait on "Joining…" for ever)
    if (e.peer && (e.peer.open || (!bin && e.peer.rel && e.peer.rel.readyState === 'open'))) return e.peer.send(bin ? msg : str || JSON.stringify(msg));
    if (e.relay && e.via) this.hub.pub(TOPIC.client(this.code, e.pid), frame(bin ? FR.BIN : FR.JSON, '', bin ? msg : enc.encode(str || JSON.stringify(msg))), e.via);
  }
  // broker traffic addressed to the host
  onRelay(topic, data, via) {
    if (topic === TOPIC.pub && data[0] === 0x7b) return this.onListing(data);
    if (topic !== TOPIC.host(this.code) || !data.length || this.closed) return;
    if (data[0] === 0x7b) {
      let m; try { m = JSON.parse(dec.decode(data)); } catch { return; }
      if (m && m.t === 'takeover') return this.onTakeover(m);
      if (m && typeof m.pid === 'string' && m.pid.length <= 24) this.onSignal(m, via);
      return;
    }
    const n = data[1]; if (data.length < 2 + n) return;
    const e = this.peers.get(dec.decode(data.subarray(2, 2 + n))); if (!e) return;
    e.via = via; e.relay = true; this.alive(e);
    const body = data.subarray(2 + n);
    if (data[0] === FR.BIN) this.onPeerInput(e, body);
    else if (data[0] === FR.JSON) { let m; try { m = JSON.parse(dec.decode(body)); } catch { return; } this.onPeerMsg(e, m); }
  }
  async onSignal(m, via) {
    const reply = (o) => this.hub.pub(TOPIC.client(this.code, m.pid), JSON.stringify(o), via);
    if (m.t === 'offer') {
      if (m.v !== NETV) return reply({ t: 'nope', why: 'version' });
      let e = this.peers.get(m.pid);
      if (e && m.oid && e.oid === m.oid) { if (e.answer) reply(e.answer); return; } // a repeat: resend our answer once it's ready
      if (!e) {
        if (!this.match || this.match.locked || this.match.ended) return reply({ t: 'nope', why: 'started' });
        if (this.humans() >= this.cap() || this.peers.size >= P2P.MAX_HUMANS * 2) return reply({ t: 'nope', why: 'full' });
        e = { pid: m.pid, slot: -1, via, peer: null, relay: false, seen: now(), lost: false, gone: false };
        this.peers.set(m.pid, e);
      }
      e.via = via; e.seen = now(); e.relay = false; e.oid = m.oid; e.answer = null;
      if (e.peer) { e.peer.close(); e.peer = null; }
      if (m.sdp && rtcOK()) {
        try {
          const peer = (e.peer = new Peer(false));
          peer.on('data', (d) => this.onPeerRaw(e, d));
          peer.on('down', () => { if (e.peer === peer) { e.peer = null; if (!e.relay && e.slot >= 0) this.lose(e); } });
          const sdp = await peer.acceptOffer(m.sdp);
          e.answer = { t: 'answer', sdp };
          return reply(e.answer);
        } catch { if (e.peer) e.peer.close(); e.peer = null; }
      }
      e.answer = { t: 'answer', sdp: null }; // no WebRTC: the client will use the relay
      reply(e.answer);
    } else if (m.t === 'relay') { const e = this.peers.get(m.pid); if (e) { e.relay = true; e.via = via; this.alive(e); } }
  }
  onPeerRaw(e, d) {
    this.alive(e);
    if (typeof d === 'string') { let m; try { m = JSON.parse(d); } catch { return; } this.onPeerMsg(e, m); }
    else this.onPeerInput(e, new Uint8Array(d));
  }
  onPeerInput(e, u8) { // one or more 9-byte input packets
    if (e.slot < 0 || !this.match) return;
    for (let o = 0; o + 9 <= u8.length; o += 9) { const i = decodeInput(u8.subarray(o, o + 9)); if (i) this.match.input(e.slot, i.epoch, i.tick, i.mx, i.mz, i.b); }
  }
  onPeerMsg(e, m) {
    if (!m || typeof m.t !== 'string' || !this.match) return;
    switch (m.t) {
      case 'hello': {
        const pl = e.slot >= 0 ? this.match.players[e.slot] : null;
        if (pl && !pl.left) { e.lost = false; if (!pl.conn) this.match.reconnect(e.slot); return; } // back again (or after a host change)
        const slot = this.match.addPlayer({ userId: 'p2p:' + e.pid, name: safeName(m.name), /* auto-moderated: a modified client can't sneak a rude name in */ cos: sanitizeLoadout(m.cos), rk: Math.max(0, Math.min(99999, m.rk | 0)), tag: m.tag });
        if (slot < 0) { this.sendTo(e, { t: 'err', code: 'full', msg: 'That show is full or has already started.' }); return; }
        e.slot = slot; this.bySlot.set(slot, e);
        // someone just found our public show: make sure they get a proper look at the lobby
        if (this.isPublic && !this.kind && this.match.phase === PHASE.LOBBY && this.match.phaseT < P2P.JOIN_GRACE * TICK_HZ) this.match.setPhase(PHASE.LOBBY, P2P.JOIN_GRACE);
        this.match.welcome(slot);
        this.onState('peers', this.guests());
        return;
      }
      case 'leave': if (e.slot >= 0) this.match.leave(e.slot); this.drop(e); this.onState('peers', this.guests()); return;
      case 'ping': this.sendTo(e, { t: 'pong', c: m.c }); return;
      case 'resync': if (e.slot >= 0) this.match.welcome(e.slot); return;
      case 'chat': if (e.slot >= 0 && typeof m.x === 'string') this.match.chat(e.slot, m.x.slice(0, 200)); return;
    }
  }
  alive(e) {
    e.seen = now();
    if (e.lost && e.slot >= 0 && this.match) {
      e.lost = false; const pl = this.match.players[e.slot];
      if (pl && !pl.left && !pl.conn && this.match.reconnect(e.slot)) this.onState('peers', this.guests());
    }
  }
  lose(e) { if (e.lost || !this.match) return; e.lost = true; if (e.slot >= 0) this.match.disconnect(e.slot); this.onState('peers', this.guests()); }
  drop(e) { e.gone = true; if (e.peer) e.peer.close(); this.peers.delete(e.pid); if (e.slot >= 0) this.bySlot.delete(e.slot); }
  pump() {
    const t = now(); if (!this.lastPump) this.lastPump = t;
    const gap = t - this.lastPump, dt = Math.min(1, gap / 1000); this.lastPump = t;
    // we were frozen (tab asleep, slow frame): that time doesn't count as the guests being silent
    if (gap > 1000) for (const e of this.peers.values()) e.seen += gap - 100;
    const m = this.match; if (!m || m.ended) return;
    this.acc += dt; let n = 0;
    while (this.acc >= 1 / TICK_HZ && n < 30) { m.step(); this.acc -= 1 / TICK_HZ; n++; }
    if (n === 30) this.acc = 0;
    for (const e of this.peers.values()) {
      if (!e.lost && e.slot >= 0 && t - e.seen > P2P.PEER_SILENT_MS) this.lose(e);
      else if (e.slot < 0 && t - e.seen > 30000) this.drop(e); // knocked but never said hello
    }
  }
  // ---- interface used by the App / ClientGame (the host's own player) ----
  send(m) {
    if (m instanceof Uint8Array) { const i = decodeInput(m); if (i && this.match) this.match.input(this.slot, i.epoch, i.tick, i.mx, i.mz, i.b); return; }
    if (m.t === 'leave' || m.t === 'unqueue') {
      if (this.match && !this.match.ended) this.match.leave(this.slot);
      this.shutdown(this.migrateAway() ? 'moved' : 'host-left'); // the show carries on without us when it can
      this.deliver({ t: 'left' });
    }
    else if (m.t === 'resync' && this.match) this.match.welcome(this.slot);
    else if (m.t === 'chat' && this.match && typeof m.x === 'string') this.match.chat(this.slot, m.x);
    else if (m.t === 'start' && this.match && this.match.release(5)) this.onState('started');
  }
  update() { this.pump(); if (this.q.length) { const q = this.q; this.q = []; for (const m of q) this.onMsg(m); } }
  shutdown(reason) {
    if (this.closed) return; this.closed = true; this.open = false;
    clearInterval(this.annT); clearInterval(this.tickT); clearInterval(this.backT); clearInterval(this.takeT);
    if (this.onHide && typeof removeEventListener !== 'undefined') removeEventListener('pagehide', this.onHide);
    const m = this.match;
    if (!this.migrated) {
      if (m && !m.ended && m.roundIdx >= 0) for (const p of m.players) if (!p.bot && !p.done && p.status !== 'gone') m.finishPlayer(p, false); // everyone keeps what they earned so far
      for (const e of this.peers.values()) this.sendTo(e, { t: 'hostleft', reason });
    }
    const peers = [...this.peers.values()];
    setTimeout(() => { for (const e of peers) if (e.peer) e.peer.close(); this.hub.close(); }, 400); // let the goodbye go out
    if (this.match && !this.match.ended) this.match.ended = true;
    this.match = null;
  }
  close() { if (this.q.length) { const q = this.q; this.q = []; for (const m of q) this.onMsg(m); } this.shutdown('closed'); }
}

// ---------------------------------------------------------------- client: plays in someone else's show
class P2PClient {
  constructor({ backend, code, onMsg, onState, pid }) {
    this.backend = backend; this.code = cleanCode(code); this.onMsg = onMsg; this.onState = onState || (() => {});
    this.pid = pid || uid(); this.isHost = false; this.open = false; this.rtt = 0; this.relay = false; this.peer = null; this.q = [];
    this.ready = false; this.closed = false; this.lastHost = 0; this.inBuf = []; this.waiter = null; this.via = null;
    this.succ = []; this.backup = null; this.moving = false;
    // like the host, listen on every broker we can reach, so it doesn't matter which ones each network allows
    this.hub = new Hub(true, (t, d, c) => this.onRelay(t, d, c));
  }
  async start() {
    this.hub.sub(TOPIC.client(this.code, this.pid));
    await this.hub.open();
    await this.dial();
  }
  waitFor(types, ms) {
    return new Promise((res, rej) => { this.waiter = { types, res, to: setTimeout(() => { this.waiter = null; rej(new Error('No room with that code is open right now.')); }, ms) }; });
  }
  async dial() {
    let sdp = null;
    if (rtcOK()) {
      try {
        const peer = (this.peer = new Peer(true));
        peer.on('open', () => this.goLive('direct'));
        peer.on('data', (d) => this.onPeerRaw(d));
        peer.on('down', () => { if (this.peer === peer) this.onPeerDown(); });
        sdp = await peer.createOffer();
      } catch { if (this.peer) this.peer.close(); this.peer = null; sdp = null; }
    }
    if (this.closed) return;
    const ans = this.waitFor(['answer', 'nope'], P2P.ANSWER_MS);
    const offer = JSON.stringify({ t: 'offer', pid: this.pid, oid: uid(), sdp, v: NETV });
    this.hub.pub(TOPIC.host(this.code), offer);
    // MQTT QoS 0 can drop a message, and the host may still be connecting to a broker: knock again
    const again = [setTimeout(() => this.waiter && this.hub.pub(TOPIC.host(this.code), offer), 2500), setTimeout(() => this.waiter && this.hub.pub(TOPIC.host(this.code), offer), 5500)];
    let m;
    try { m = await ans; } finally { again.forEach(clearTimeout); }
    if (m.t === 'nope') throw new Error(m.why === 'full' ? 'That room is full.' : m.why === 'started' ? 'That show has already started — ask your friend to make a new room after it ends!' : m.why === 'version' ? 'Your friend is on a different version — both refresh the page.' : 'Could not join that room.');
    if (m.sdp && this.peer) {
      try { await this.peer.acceptAnswer(m.sdp); } catch { return this.useRelay(); }
      this.dcT = setTimeout(() => { if (!this.ready) this.useRelay(); }, P2P.DC_MS);
    } else this.useRelay();
  }
  useRelay() {
    if (this.closed) return;
    this.relay = true; if (this.peer) { this.peer.close(); this.peer = null; }
    this.hub.pub(TOPIC.host(this.code), JSON.stringify({ t: 'relay', pid: this.pid }), this.via);
    if (this.ready) this.sendJSON(this.hello()); else this.goLive('relay');
  }
  hello() { const p = this.backend.profile; return { t: 'hello', name: p.name, cos: p.loadout, v: NETV, rk: p.rp | 0, tag: tagOf(p.owned) || undefined }; }
  goLive(how) {
    if (this.ready || this.closed) return;
    this.ready = true; this.open = true; this.how = how; clearTimeout(this.dcT); this.lastHost = now();
    this.sendJSON(this.hello());
    clearInterval(this.pingT); this.pingT = setInterval(() => this.sendJSON({ t: 'ping', c: now() }), 2000);
    this.onState('open', how);
  }
  onPeerDown() { // direct link dropped mid-show: carry on over the relay
    this.peer = null;
    if (this.ready && !this.relay && !this.closed) { this.onState('relay'); this.useRelay(); }
  }
  onRelay(topic, data, via) {
    if (topic !== TOPIC.client(this.code, this.pid) || !data.length || this.closed) return;
    if (data[0] === 0x7b) {
      let m; try { m = JSON.parse(dec.decode(data)); } catch { return; }
      const w = this.waiter; if (w && w.types.includes(m.t)) { this.waiter = null; clearTimeout(w.to); this.via = via; w.res(m); } // stick to the broker the host answered on
      return;
    }
    if (!this.relay) return;
    this.lastHost = now();
    const body = data.subarray(2 + data[1]);
    if (data[0] === FR.BIN) this.recv(body.slice());
    else if (data[0] === FR.JSON) { try { this.recv(JSON.parse(dec.decode(body))); } catch {} }
  }
  onPeerRaw(d) {
    this.lastHost = now();
    if (typeof d === 'string') { try { this.recv(JSON.parse(d)); } catch {} }
    else this.recv(new Uint8Array(d));
  }
  recv(m) {
    if (!(m instanceof Uint8Array)) {
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong') { const r = now() - m.c; if (r >= 0 && r < 10000) this.rtt = this.rtt ? this.rtt * 0.8 + r * 0.2 : r; return; }
      if (m.t === 'hostleft') { if (m.reason !== 'done') this.onState('hostleft', m.reason); this.shut(); return; }
      if (m.t === 'succ') { this.succ = Array.isArray(m.list) ? m.list.slice(0, 2) : []; return; }
      if (m.t === 'backup') { if (m.state && m.state.v === 1) this.backup = m.state; return; }
      if (m.t === 'migrate') { if (m.state && m.state.v === 1) { this.backup = m.state; this.succ = [this.pid]; } this.hostGone('moved'); return; }
      if (m.t === 'hostmove') { this.hostGone('moved'); return; }
      if (m.t === 'reward') { // the host reports how we did; our cranberries live on this device
        const res = { rounds: Math.max(0, Math.min(8, m.rounds | 0)), won: !!m.won, totalRounds: Math.max(1, Math.min(8, m.totalRounds | 0)), matchId: String(m.matchId || '').slice(0, 40), ranked: cleanRanked(m.ranked) || undefined };
        m = { t: 'reward', ...res, reward: this.backend.reward(res), profile: this.backend.profile };
      }
    } else if (this.q.length > 120) this.q = this.q.filter((x) => !(x instanceof Uint8Array)); // tab was asleep: drop stale snapshots
    this.q.push(m);
  }
  sendJSON(o) {
    if (this.peer && this.peer.open) this.peer.send(o);
    else if (this.relay) this.hub.pub(TOPIC.host(this.code), frame(FR.JSON, this.pid, enc.encode(JSON.stringify(o))), this.via);
  }
  flushInputs() {
    if (!this.inBuf.length) return;
    const u = new Uint8Array(this.inBuf.length * 9); this.inBuf.forEach((x, i) => u.set(x.subarray(0, 9), i * 9)); this.inBuf = [];
    this.hub.pub(TOPIC.host(this.code), frame(FR.BIN, this.pid, u), this.via);
  }
  // ---- interface used by the App / ClientGame ----
  send(m) {
    if (!this.open) return;
    if (m instanceof Uint8Array) {
      if (this.peer && this.peer.open) this.peer.send(m);
      else if (this.relay) { this.inBuf.push(m); if (this.inBuf.length >= 2) this.flushInputs(); } // ~15 relay messages a second
      return;
    }
    if (m.t === 'leave' || m.t === 'unqueue') { this.sendJSON({ t: 'leave' }); this.q.push({ t: 'left' }); setTimeout(() => this.shut(), 250); return; }
    if (m.t === 'queue' || m.t === 'start') return;
    this.sendJSON(m);
  }
  // ---- host migration (guest side) ----
  // The host is gone. Its first successor takes over from the latest backup; everyone else knocks on the same
  // room code until the new host answers (the second successor steps in if the first never shows up).
  async hostGone(reason) {
    if (this.moving || this.closed) return;
    this.moving = true;
    const rank = this.succ.indexOf(this.pid);
    if (rank === 0 && this.backup) return this.takeOver();
    this.onState('migrating', reason);
    this.resetLink();
    const deadline = now() + (rank === 1 && this.backup ? 9000 : 30000);
    while (!this.closed && now() < deadline) {
      try { await this.dial(); this.moving = false; return; }
      catch (e) { if (/full|already started|version/.test(e.message)) break; }
      await sleep(700);
    }
    if (this.closed) return;
    if (rank === 1 && this.backup) return this.takeOver();
    this.onState('hostlost'); this.shut();
  }
  resetLink() {
    clearInterval(this.pingT); clearTimeout(this.dcT); if (this.waiter) { clearTimeout(this.waiter.to); this.waiter = null; }
    if (this.peer) this.peer.close();
    this.peer = null; this.relay = false; this.ready = false; this.open = false; this.via = null; this.inBuf = [];
  }
  takeOver() {
    if (this.closed) return;
    const info = { state: this.backup, pid: this.pid, code: this.code };
    this.shut();
    this.onState('promote', info);
  }
  update() {
    const t = now(), gap = this.lastUpd ? t - this.lastUpd : 0; this.lastUpd = t;
    if (gap > 1000) this.lastHost += gap - 100; // our own tab was frozen: don't blame the host for it
    if (this.q.length) { const q = this.q; this.q = []; for (const m of q) this.onMsg(m); }
    if (this.open && !this.moving && t - this.lastHost > P2P.HOST_SILENT_MS) this.hostGone('silent');
  }
  shut() {
    if (this.closed) return; this.closed = true; this.open = false;
    clearInterval(this.pingT); clearTimeout(this.dcT); if (this.waiter) clearTimeout(this.waiter.to);
    if (this.peer) this.peer.close(); this.peer = null; this.hub.close();
  }
  close() { if (this.q.length) { const q = this.q; this.q = []; for (const m of q) this.onMsg(m); } this.shut(); }
}

// ---------------------------------------------------------------- public quick play
// Listen for public rooms that are still in their lobby; returns the best one or null.
function findPublicRoom(ms = 2600, kind = '', rp = 0) {
  return new Promise((resolve, reject) => {
    const rooms = new Map();
    const hub = new Hub(true, (topic, data) => {
      if (topic !== TOPIC.pub || data[0] !== 0x7b) return;
      let m; try { m = JSON.parse(dec.decode(data)); } catch { return; }
      if (m && m.t === 'room' && m.v === NETV && typeof m.code === 'string' && m.code.length === 5) rooms.set(m.code, { ...m, seen: Date.now() });
    });
    hub.sub(TOPIC.pub);
    hub.open().then(() => setTimeout(() => {
      hub.close();
      const cap = kind === 'duel' ? 2 : P2P.MAX_HUMANS;
      const ok = [...rooms.values()].filter((r) => (r.k || '') === kind && r.n < cap && r.left >= 7 && Date.now() - r.seen < 6000);
      // duels match with anyone at all (rank doesn't matter): take whoever has been waiting longest
      if (kind === 'duel') ok.sort((a, b) => (a.since || a.at || 0) - (b.since || b.at || 0) || (a.code < b.code ? -1 : 1));
      else ok.sort((a, b) => b.n - a.n || b.left - a.left);
      resolve(ok[0] || null);
    }, ms)).catch((e) => { hub.close(); reject(e); });
  });
}

// ---------------------------------------------------------------- global leaderboard (rank)
// No server, so the leaderboard lives on the same public brokers: every bean that has played ranked keeps one
// *retained* message at cranguys/v3/lb/<random id> = { n: name, rp, w: crowns, c: colour, lv, tg }. Anyone can
// read it; highest rank first. Names go through the name filter again on the way in.
const LB = (id) => `${P2P.PREFIX}/lb/${id}`;
const lbClean = (id) => String(id || '').replace(/[^a-z0-9]/g, '').slice(0, 16);
async function pubRetained(topic, payload) {
  const hub = new Hub(true, () => {});
  try { await hub.open(); await sleep(1200); hub.pub(topic, payload, null, true); await sleep(500); } // give the other brokers a moment too
  finally { hub.close(); }
}
async function lbPublish(id, entry) { // entry = null takes us off the board
  id = lbClean(id); if (!id) return;
  await pubRetained(LB(id), entry ? JSON.stringify({ v: 3, n: String(entry.n).slice(0, 16), rp: Math.max(0, Math.min(99999, entry.rp | 0)), w: Math.max(0, Math.min(100000, entry.w | 0)), lv: Math.max(1, Math.min(9999, entry.lv | 0)), c: String(entry.c || '').slice(0, 9), tg: cleanTag(entry.tg) || undefined, at: Date.now() }) : new Uint8Array(0));
}
function lbRow(id, m) {
  id = lbClean(id);
  if (!m || m.v !== 3 || !id) return null; // older (crown-sorted) entries are ignored until their owner updates
  return { id, n: safeName(m.n), rp: Math.max(0, Math.min(99999, m.rp | 0)), w: Math.max(0, Math.min(100000, m.w | 0)), lv: Math.max(1, Math.min(9999, m.lv | 0)), c: /^#[0-9a-f]{3,8}$/i.test(m.c) ? m.c : '#ff7af6', tg: cleanTag(m.tg), at: +m.at || 0 };
}
const lbSort = (a, b) => b.rp - a.rp || b.w - a.w || a.at - b.at;
// read every retained message under a prefix (leaderboard rows, map records…) for `ms` milliseconds
function collect(pre, ms, row) {
  return new Promise((resolve, reject) => {
    const rows = new Map();
    const hub = new Hub(true, (topic, data) => {
      if (!topic.startsWith(pre) || !data.length || data[0] !== 0x7b) return;
      let m; try { m = JSON.parse(dec.decode(data)); } catch { return; }
      const r = row(topic.slice(pre.length), m); if (!r) return;
      const old = rows.get(r.id); if (!old || r.at >= old.at) rows.set(r.id, r);
    });
    hub.sub(pre + '+');
    hub.open().then(() => setTimeout(() => { hub.close(); resolve(rows); }, ms)).catch((e) => { hub.close(); reject(e); });
  });
}
async function lbFetch(ms = 2600) { return [...(await collect(`${P2P.PREFIX}/lb/`, ms, lbRow)).values()].sort(lbSort).slice(0, 100); }

// ---------------------------------------------------------------- world records (fastest time on each map)
// One retained message per map at cranguys/v3/rec/<map> = { n: name, t: milliseconds, c: colour, tg, at }.
// Whoever beats it publishes the new one (after checking the latest record once more). Times faster than a
// bean could physically manage are ignored.
const REC_MAPS = { whirlway: 17, hammerhills: 12, trusttiles: 13, slimesurge: 22, jumprope: 14, redlight: 12, crownpeak: 12 }; // min seconds
const REC = (id) => `${P2P.PREFIX}/rec/${id}`;
function recRow(id, m) {
  if (!REC_MAPS[id] || !m || m.v !== 1) return null;
  const t = Math.round(+m.t); if (!(t >= REC_MAPS[id] * 1000 && t < 60 * 60 * 1000)) return null;
  return { id, n: safeName(m.n), t, c: /^#[0-9a-f]{3,8}$/i.test(m.c) ? m.c : '#ff7af6', tg: cleanTag(m.tg), at: +m.at || 0 };
}
async function recFetch(ms = 2400) { return collect(`${P2P.PREFIX}/rec/`, ms, recRow); }
async function recPublish(id, entry) {
  if (!recRow(id, { v: 1, ...entry, n: entry.n })) return false;
  await pubRetained(REC(id), JSON.stringify({ v: 1, n: String(entry.n).slice(0, 16), t: Math.round(entry.t), c: String(entry.c || '').slice(0, 9), tg: cleanTag(entry.tg) || undefined, at: Date.now() }));
  return true;
}

// ---------------------------------------------------------------- live player counts
// Every open copy of the game sends a tiny anonymous heartbeat every 15 s on cranguys/v3/here: { id, m } where
// m is what it's doing ('menu', 'online', 'duel', 'ranked'). Private (Friends) rooms are never reported.
// Counting the ids heard in the last 40 s gives "how many real people are doing X right now".
class Presence {
  constructor(onChange) { this.onChange = onChange || (() => {}); this.id = uid(); this.mode = 'menu'; this.seen = new Map(); this.hub = null; this.timer = null; this.ok = false; }
  async start() {
    if (this.hub) return;
    const topic = `${P2P.PREFIX}/here`;
    this.hub = new Hub(true, (t, data) => {
      if (t !== topic || !data.length || data[0] !== 0x7b) return;
      let m; try { m = JSON.parse(dec.decode(data)); } catch { return; }
      if (!m || typeof m.id !== 'string' || m.id.length > 24) return;
      const isNew = !this.seen.has(m.id) && m.id !== this.id;
      if (m.m === 'bye') this.seen.delete(m.id); else this.seen.set(m.id, { m: ['menu', 'online', 'duel', 'ranked'].includes(m.m) ? m.m : 'menu', at: Date.now() });
      // someone just opened the game: say hello back (after a random little wait, so a crowd doesn't all answer at
      // once) so their counts are right straight away instead of after the next 15 s heartbeat
      if (isNew && m.m !== 'bye' && !this._hi && this.timer) this._hi = setTimeout(() => { this._hi = null; this.beat(); }, 300 + Math.random() * 2200);
      this.changed();
    });
    this.hub.sub(topic);
    try { await this.hub.open(); this.ok = true; } catch (e) { this.ok = false; this.hub.close(); this.hub = null; return; }
    this.beat(); this.timer = setInterval(() => { this.beat(); this.changed(); }, 15000);
  }
  set(mode) { mode = ['online', 'duel', 'ranked'].includes(mode) ? mode : 'menu'; if (mode === this.mode) return; this.mode = mode; this.beat(); }
  beat(bye = false) {
    if (!this.hub) return;
    const msg = JSON.stringify({ id: this.id, m: bye ? 'bye' : this.mode });
    this.hub.pub(`${P2P.PREFIX}/here`, msg);
    if (!bye) { this.seen.set(this.id, { m: this.mode, at: Date.now() }); this.changed(); }
  }
  counts() {
    const now = Date.now(), c = { total: 0, menu: 0, online: 0, duel: 0, ranked: 0 };
    for (const [id, e] of this.seen) { if (now - e.at > 40000) { this.seen.delete(id); continue; } c.total++; c[e.m]++; }
    return c;
  }
  changed() { clearTimeout(this._ct); this._ct = setTimeout(() => this.onChange(this.counts()), 120); }
  pause(on) { if (on) { this.beat(true); clearInterval(this.timer); this.timer = null; clearTimeout(this._hi); this._hi = null; } else if (this.hub && !this.timer) { this.beat(); this.timer = setInterval(() => { this.beat(); this.changed(); }, 15000); } }
}


export { P2P, brokers, newCode, cleanCode, p2pSupported, MiniMQTT, P2PHost, P2PClient, findPublicRoom, lbPublish, lbRow, lbSort, lbFetch, REC_MAPS, recRow, recFetch, recPublish, Presence };
