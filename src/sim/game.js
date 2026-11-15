// CranGuys — Match: the authoritative show (lobby -> race -> survival -> final -> podium).
// Isomorphic: the Node server runs one Match per show; the offline mode runs the same class in the browser.
import { PHASE, TIMING, DT, TICK_HZ, SUBSTEPS, MODE, BTN, MAX_PLAYERS, SNAP_EVERY, PHYS } from './config.js';
import { World } from './world.js';
import { freshLevel, pickShow, pickDuel } from '../levels/index.js';
import { trustSecret } from '../levels/trusttiles.js';
import { crownAt } from '../levels/crownpeak.js';
import { rlState } from '../levels/redlight.js';
import { HUNT, hoopAt, huntStart } from '../levels/hoophunt.js';
import { TILE } from '../levels/tiletumble.js';
import { T_PLAY } from '../levels/kit.js';
import { newChar, charBegin, charSub, charEnd, packChar, unpackChar, NFIELDS, toRag, charShape } from './character.js';
import { contactSeg, makeHit, segSeg } from './collide.js';
import { BotBrain } from './bots.js';
import { buildSnapBody, encodeSnap } from './protocol.js';
import { mulberry32, clamp } from './math.js';
import { beanName } from '../online/names.js';
import { randomLoadout, cleanTag } from '../economy/cosmetics.js';
import { moderate } from '../online/chatFilter.js';
import { MIN_SHOW_HUMANS, DUEL_WINS } from '../online/ranks.js';
const TP = Math.round(T_PLAY * TICK_HZ);   // round tick at which PLAY starts
const NOINP = Object.freeze({ mx: 0, mz: 0, b: 0 });
const F = new Float32Array(NFIELDS);
const HB = makeHit();

class Match {
  constructor(o = {}) {
    this.id = o.id || 'show-' + Math.floor(Math.random() * 1e9).toString(36);
    this.seed = (o.seed >>> 0) || (Math.floor(Math.random() * 2 ** 31) >>> 0);
    this.secret = (o.secret ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.max = Math.min(MAX_PLAYERS, o.max || MAX_PLAYERS);
    this.botFill = o.botFill !== false;
    this.send = o.send || (() => {});
    this.hooks = o.hooks || {};
    // ranked: 'duel' = two real players, first to DUEL_WINS round wins; 'ranked' = a normal show that needs 5+ real players
    this.kind = o.kind === 'duel' || o.kind === 'ranked' ? o.kind : null;
    this.duel = this.kind === 'duel';
    if (this.duel) { this.max = 2; this.botFill = false; }
    this.needHumans = this.duel ? 2 : this.kind === 'ranked' ? MIN_SHOW_HUMANS : 0;
    this.dw = {};                         // duel round wins by slot
    this.outN = 0;                        // order players went out in (for ranked placements)
    this.show = (o.show || (this.duel ? pickDuel(this.rng) : pickShow(this.rng))).slice();
    this.hold = !!o.hold || this.needHumans > 0; // private rooms wait for Start; ranked rooms wait for enough real players
    this.players = [];
    this.epoch = 0;
    this.roundIdx = -1;
    this.gt = 0;
    this.ended = false;
    this.locked = false;
    this.evq = [];
    this.testMode = !!o.testMode;
    this.createdAt = Date.now();
    this.loadLevel('lobby');
    this.setPhase(PHASE.LOBBY, o.lobbySecs ?? TIMING.lobbyOnline);
  }

  // ---------------- roster ----------------
  activeCount() { let n = 0; for (const p of this.players) if (p.status !== 'gone') n++; return n; }
  humanCount() { let n = 0; for (const p of this.players) if (!p.bot && p.status !== 'gone') n++; return n; }
  pub(pl) { return { s: pl.slot, n: pl.name, c: pl.cos, b: pl.bot ? 1 : 0, st: pl.status, u: pl.bot ? null : pl.userId, r: pl.bot || pl.rk == null ? undefined : pl.rk, g: pl.tag || undefined }; }

  addPlayer({ userId, name, cos, bot = false, skill = 0.6, rk = null, tag = null }) {
    if (this.locked || this.ended || this.activeCount() >= this.max || this.players.length >= 250) return -1;
    const slot = this.players.length;
    const pl = {
      slot, userId: userId || null, name: String(name || 'Bean').slice(0, 16), cos, bot, skill,
      brain: bot ? new BotBrain((this.seed ^ (slot * 7919)) >>> 0, skill) : null,
      st: null, status: 'in', conn: !bot, left: false, done: false, inq: new Map(), last: NOINP, newest: -1, starve: 0,
      qual: 0, place: 0, xRound: -1, inp: NOINP, I: {}, ctx: null, dcAt: 0, rk: bot || rk == null ? null : Math.max(0, Math.min(99999, rk | 0)),
      tag: bot ? null : cleanTag(tag),   // 'owner' shows an OWNER tag next to the name
    };
    pl.ctx = { rules: this.level.rules, ev: null, slot, onGround: (c, s, tick) => this.onGround(pl, c, tick), onContact: (c, s, n, vn, tick) => this.onContact(pl, c, n, vn, tick) };
    this.players.push(pl);
    const sp = this.level.spawns(slot + 1)[slot];
    pl.st = newChar([sp[0] + (this.rng() - 0.5), sp[1] + PHYS.STAND + 0.05, sp[2] + (this.rng() - 0.5)], sp[3]);
    this.send(-1, { t: 'join', p: this.pub(pl) });
    if (!bot && this.hooks.onJoin) this.hooks.onJoin(pl);
    return slot;
  }

  addBot() {
    const r = this.rng;
    const skill = clamp(0.25 + r() * 0.65 + (r() < 0.15 ? 0.15 : 0), 0.15, 1);
    return this.addPlayer({ name: beanName(r), cos: randomLoadout(r), bot: true, skill });
  }

  // full state for a (re)joining human
  welcome(slot) {
    this.send(slot, {
      t: 'match', id: this.id, you: slot, max: this.max, show: this.show, round: this.roundIdx, phase: this.phase, hold: this.hold ? 1 : 0, room: this.room || null,
      left: this.phaseT / TICK_HZ, level: this.levelId, seed: this.levelSeed, epoch: this.epoch, tick: this.tick, Q: this.Q || 0, kind: this.kind, need: this.needHumans, dw: this.dw,
      players: this.players.filter((p) => p.status !== 'gone').map((p) => this.pub(p)),
      tiles: this.tileTouch ? Array.from(this.tileTouch).map((t, i) => (t >= 0 ? [i, t] : null)).filter(Boolean) : [],
      ms: this.level.type === 'hunt' ? { hg: this.ms.hg, ht: this.ms.ht, sc: this.players.filter((p) => p.score).map((p) => [p.slot, p.score]) } : undefined,
      doors: this.level.doors ? this.level.doors.filter((d) => this.world.dead[d.dyn] < 0x7fffffff).map((d) => [d.id, this.world.dead[d.dyn]]) : [],
    });
  }

  input(slot, epoch, tick, mx, mz, b) {
    const pl = this.players[slot];
    if (!pl || pl.bot || pl.left || epoch !== this.epoch) return;
    if (tick < this.tick || tick > this.tick + 90) { pl.late = (pl.late || 0) + 1; return; }
    if (pl.inq.size > 120) pl.inq.clear();
    pl.inq.set(tick, { mx: clamp(+mx || 0, -1, 1), mz: clamp(+mz || 0, -1, 1), b: b & 15 });
    if (tick > pl.newest) pl.newest = tick;
  }

  disconnect(slot) {
    const pl = this.players[slot]; if (!pl || pl.bot) return;
    pl.conn = false; pl.dcAt = this.gt; pl.last = NOINP; pl.inq.clear();
    if (this.phase === PHASE.LOBBY) this.removeFromLobby(pl);
  }
  reconnect(slot) {
    const pl = this.players[slot]; if (!pl || pl.left) return false;
    pl.conn = true; pl.newest = -1; this.welcome(slot); return true;
  }
  leave(slot) {
    const pl = this.players[slot]; if (!pl || pl.bot || pl.left) return;
    pl.left = true; pl.conn = false;
    if (this.phase === PHASE.LOBBY) { this.removeFromLobby(pl); return; }
    if (pl.status === 'in' || pl.status === 'q') { pl.status = 'x'; pl.xRound = this.roundIdx; pl.outSeq = ++this.outN; if (pl.st) pl.st.mode = MODE.OUT; this.ev('x', pl.slot); }
    this.finishPlayer(pl, false);
    // a duel can't go on with one player: the other wins by forfeit
    if (this.duel && !this.ended && this.phase !== PHASE.PODIUM) {
      const o = this.players.find((p) => !p.bot && !p.left && p.status !== 'gone');
      if (o) { this.dw[o.slot] = Math.max(DUEL_WINS, this.dw[o.slot] | 0); this.flushEvents(); this.podium(o.slot); }
    }
  }
  removeFromLobby(pl) {
    pl.status = 'gone'; pl.st = null; pl.left = true;
    this.send(-1, { t: 'leave', s: pl.slot });
  }

  // ---------------- chat (auto-moderated; the host/server decides what gets through) ----------------
  chat(slot, text) {
    const pl = this.players[slot];
    if (!pl || pl.bot || pl.left || pl.status === 'gone') return;
    if (pl.muted) return this.send(slot, { t: 'chatx', why: 'muted' });
    pl.chatLog = (pl.chatLog || []).filter((t) => this.gt - t < 6 * TICK_HZ);
    if (pl.chatLog.length >= 3) return this.send(slot, { t: 'chatx', why: 'slow' });
    const r = moderate(text, { last: pl.lastChat });
    if (!r.ok) {
      if (r.strike) pl.strikes = (pl.strikes || 0) + 1;
      if (pl.strikes >= 3) pl.muted = true; // three strikes: muted for the rest of the show
      if (r.reason !== 'empty') this.send(slot, { t: 'chatx', why: pl.muted ? 'muted' : r.reason });
      return;
    }
    pl.chatLog.push(this.gt); pl.lastChat = r.text;
    this.send(-1, { t: 'chat', s: slot, x: r.text });
  }

  // ---------------- host migration ----------------
  // Everything needed to carry on the show on another machine. Bot brains and the RNG restart fresh, which
  // nobody can notice; characters, tiles, doors, boulders, scores and the round state are exact.
  saveState(hostSlot = -1) {
    const W = this.world, F2 = new Float32Array(NFIELDS), r3 = (x) => Math.round(x * 1000) / 1000;
    return {
      v: 1, id: this.id, seed: this.seed, secret: this.secret, show: this.show, hold: this.hold, room: this.room || null, max: this.max, botFill: this.botFill,
      epoch: this.epoch, roundIdx: this.roundIdx, gt: this.gt, locked: this.locked, createdAt: this.createdAt, phase: this.phase, phaseT: this.phaseT,
      tick: this.tick, levelId: this.levelId, levelSeed: this.levelSeed, Q: this.Q || 0, finalMode: !!this.finalMode, timeLimit: this.timeLimit || 0,
      qualCount: this.qualCount, winner: this.winner, runnersUp: this.runnersUp || null, lastHumanDone: this.lastHumanDone, elimOrder: this.elimOrder,
      ballT: this.ballT, ballId: this.ballId, ms: this.ms, hostSlot, kind: this.kind, dw: this.dw, outN: this.outN,
      dead: Array.from(W.dead), tiles: this.tileTouch ? Array.from(this.tileTouch) : null, proven: this.proven ? Array.from(this.proven) : null,
      doors: this.level.doors ? this.level.doors.map((d) => r3(d.hp)) : null,
      balls: W.balls.map((b) => ({ id: b.id, p: b.p.map(r3), v: b.v.map(r3), r: b.r, age: r3(b.age) })),
      players: this.players.map((p) => {
        let ch = null; if (p.st) { packChar(p.st, F2, 0); ch = Array.from(F2, r3); }
        return { s: p.slot, u: p.userId, n: p.name, c: p.cos, b: p.bot ? 1 : 0, k: p.skill, st: p.status, cn: p.conn ? 1 : 0, l: p.left ? 1 : 0, d: p.done ? 1 : 0, q: p.qual, pl: p.place, xr: p.xRound, dc: p.dcAt, sc: p.score || 0, mu: p.muted ? 1 : 0, sk: p.strikes || 0, rk: p.rk ?? null, os: p.outSeq || 0, tg: p.tag || null, ch };
      }),
    };
  }
  static restore(S, o = {}) {
    const m = Object.create(Match.prototype);
    Object.assign(m, {
      id: S.id, seed: S.seed >>> 0, secret: S.secret >>> 0, rng: mulberry32((S.seed ^ S.gt ^ 0x5bd1e995) >>> 0), max: S.max, botFill: S.botFill,
      send: o.send || (() => {}), hooks: o.hooks || {}, show: S.show.slice(), hold: !!S.hold, room: S.room, players: [], epoch: (S.epoch - 1) & 255,
      roundIdx: S.roundIdx, gt: S.gt, ended: false, locked: S.locked, evq: [], testMode: !!o.testMode, createdAt: S.createdAt,
      kind: S.kind || null, duel: S.kind === 'duel', needHumans: S.kind === 'duel' ? 2 : S.kind === 'ranked' ? MIN_SHOW_HUMANS : 0, dw: S.dw || {}, outN: S.outN || 0,
    });
    m.loadLevel(S.levelId); // rebuilds the level and world exactly (same epoch -> same level seed)
    Object.assign(m, {
      phase: S.phase, phaseT: S.phaseT, tick: S.tick, Q: S.Q, finalMode: S.finalMode, timeLimit: S.timeLimit, qualCount: S.qualCount, winner: S.winner,
      runnersUp: S.runnersUp, lastHumanDone: S.lastHumanDone, elimOrder: S.elimOrder || [], ballT: S.ballT, ballId: S.ballId, ms: S.ms || {},
    });
    const W = m.world;
    if (S.dead && S.dead.length === W.dead.length) W.dead.set(S.dead);
    if (S.tiles && m.tileTouch) m.tileTouch.set(S.tiles);
    if (S.proven && m.proven) m.proven.set(S.proven);
    if (S.doors && m.level.doors) m.level.doors.forEach((d, i) => { d.hp = S.doors[i]; });
    W.balls = (S.balls || []).map((b) => ({ id: b.id, p: b.p.slice(), v: b.v.slice(), r: b.r, age: b.age }));
    for (const sp of S.players) {
      const pl = {
        slot: sp.s, userId: sp.u, name: sp.n, cos: sp.c, bot: !!sp.b, skill: sp.k, brain: sp.b ? new BotBrain((m.seed ^ (sp.s * 7919) ^ m.gt) >>> 0, sp.k) : null,
        st: sp.ch ? unpackChar(Float32Array.from(sp.ch), 0, newChar([0, 0, 0])) : null, status: sp.st, conn: !!sp.cn && !!sp.b, left: !!sp.l, done: !!sp.d,
        inq: new Map(), last: NOINP, newest: -1, starve: 0, qual: sp.q, place: sp.pl, xRound: sp.xr, inp: NOINP, I: {}, ctx: null, dcAt: m.gt, score: sp.sc || 0,
        muted: !!sp.mu, strikes: sp.sk || 0, rk: sp.rk ?? null, outSeq: sp.os || 0, tag: cleanTag(sp.tg),
      };
      pl.ctx = { rules: m.level.rules, ev: null, slot: pl.slot, onGround: (c, s, tick) => m.onGround(pl, c, tick), onContact: (c, s, n, vn, tick) => m.onContact(pl, c, n, vn, tick) };
      m.players.push(pl);
    }
    return m;
  }

  // ---------------- phases ----------------
  setPhase(p, secs) {
    this.phase = p; this.phaseT = Math.max(1, Math.round(secs * TICK_HZ));
    this.send(-1, { t: 'phase', p, left: secs, round: this.roundIdx, tick: this.tick, epoch: this.epoch, hold: this.hold && p === PHASE.LOBBY ? 1 : 0 });
    if (this.hooks.onPhase) this.hooks.onPhase(p);
  }
  shortenLobby(secs) { if (this.phase === PHASE.LOBBY && !this.hold && this.phaseT > secs * TICK_HZ) this.setPhase(PHASE.LOBBY, secs); }
  // host pressed Start in a private room
  release(secs = 5) { if (this.phase !== PHASE.LOBBY || !this.hold) return false; this.hold = false; this.setPhase(PHASE.LOBBY, secs); return true; }

  loadLevel(id) {
    this.levelId = id;
    this.epoch = (this.epoch + 1) & 255;
    this.levelSeed = (this.seed + this.epoch * 7919) >>> 0;
    this.level = freshLevel(id, this.levelSeed);
    this.world = new World(this.level);
    this.tick = 0;
    this.tileTouch = this.level.tiles ? new Int32Array(this.level.tiles.length).fill(-1) : null;
    this.doorByDyn = new Map();
    if (this.level.doors) {
      const r = mulberry32((this.secret ^ this.levelSeed) >>> 0);
      for (let row = 0; row < 3; row++) {
        const ds = this.level.doors.filter((d) => d.row === row), k = 2 + Math.floor(r() * 3);
        const idx = ds.map((_, i) => i).sort(() => r() - 0.5).slice(0, k);
        ds.forEach((d, i) => { d.breakable = idx.includes(i); d.hp = 0.22; this.doorByDyn.set(d.dyn, d); });
      }
    }
    this.trustReal = null; this.proven = null;
    if (this.level.trust) {
      this.trustReal = trustSecret(mulberry32((this.secret ^ this.levelSeed ^ 0x51ed) >>> 0));
      this.proven = new Uint8Array(this.level.tiles.length);
    }
    this.elimOrder = [];
    this.ms = {};                          // map-specific runtime state (kept JSON-friendly for host migration)
    this.ballT = 0; this.ballId = 0;
    this.qualCount = 0; this.winner = -1; this.lastHumanDone = -1;
    for (const pl of this.players) if (pl.ctx) pl.ctx.rules = this.level.rules;
  }

  startRound(i) {
    this.roundIdx = i;
    if (this.duel) for (const p of this.players) if (!p.left && !p.bot && p.status !== 'gone') p.status = 'in'; // a lost round doesn't knock you out of a duel
    const inShow = this.players.filter((p) => p.status === 'in' || p.status === 'q');
    for (const p of inShow) p.status = 'in';
    for (const p of this.players) if (p.status !== 'in') p.st = null;
    this.loadLevel(this.show[i]);
    const n = inShow.length, type = this.level.type;
    // the last round always crowns exactly one bean: a final, last-bean-standing survival or first-past-the-post race
    this.finalMode = i >= this.show.length - 1;
    this.timeLimit = (this.finalMode && this.level.timeLimitFinal) || this.level.timeLimit;
    if (this.duel) { this.finalMode = false; this.Q = 1; this.timeLimit = this.level.timeLimitFinal || this.level.timeLimit; }
    else if (this.finalMode) this.Q = 1;
    else if (type === 'race') this.Q = n <= 2 ? n : clamp(Math.round(n * (i === 0 ? 0.6 : 0.55)), 1, n - 1);
    else if (type === 'survival') this.Q = n <= 2 ? 1 : clamp(Math.round(n * 0.4), 2, n - 1);
    else if (type === 'hunt') this.Q = n <= 2 ? 1 : clamp(Math.round(n * 0.55), 1, n - 1);
    else this.Q = 1;
    if (type === 'hunt') { this.ms = huntStart(); for (const p of inShow) { p.score = 0; p.lastScore = 0; } }
    const spawns = this.level.spawns(n);
    const order = inShow.slice().sort(() => this.rng() - 0.5);
    order.forEach((pl, k) => {
      const sp = spawns[k];
      pl.st = newChar([sp[0], sp[1] + PHYS.STAND + 0.03, sp[2]], sp[3]);
      pl.inq.clear(); pl.last = NOINP; pl.newest = -1; pl.place = 0;
      if (pl.brain) pl.brain.reset();
    });
    this.send(-1, { t: 'round', i, n: this.show.length, level: this.show[i], seed: this.levelSeed, epoch: this.epoch, Q: this.Q, count: n, type, tp: TP, final: this.finalMode ? 1 : 0, duel: this.duel ? 1 : 0, dw: this.dw });
    this.setPhase(PHASE.INTRO, TIMING.intro);
  }

  nextPhase() {
    switch (this.phase) {
      case PHASE.LOBBY: {
        if (this.humanCount() === 0 && !this.testMode) return this.end('empty');
        if (this.botFill) while (this.activeCount() < this.max) if (this.addBot() < 0) break;
        this.locked = true;
        return this.startRound(0);
      }
      case PHASE.INTRO: return this.setPhase(PHASE.COUNTDOWN, (TP - this.tick) / TICK_HZ);
      case PHASE.COUNTDOWN: return this.setPhase(PHASE.PLAY, this.timeLimit + 2);
      case PHASE.PLAY: return this.endRound('time');
      case PHASE.ROUND_END: return this.results();
      case PHASE.RESULTS: {
        const q = this.players.filter((p) => p.status === 'q');
        const last = this.roundIdx >= this.show.length - 1;
        if (!this.testMode && !this.anyHumanWatching()) return this.end('no-humans');
        if (this.duel) return this.duelOver() ? this.podium(this.duelLeader()) : this.startRound(this.roundIdx + 1);
        if (last || q.length <= 1) return this.podium(this.winner >= 0 ? this.winner : q.length === 1 ? q[0].slot : -1);
        return this.startRound(this.roundIdx + 1);
      }
      case PHASE.PODIUM: return this.end('done');
      default: return this.end('done');
    }
  }

  anyHumanWatching() { return this.players.some((p) => !p.bot && !p.left && (p.conn || this.gt - p.dcAt < TIMING.disconnectGrace * TICK_HZ)); }

  // ---------------- main tick ----------------
  step() {
    if (this.ended) return;
    this.gt++;
    const ph = this.phase;
    const sim = ph === PHASE.LOBBY || ph === PHASE.INTRO || ph === PHASE.COUNTDOWN || ph === PHASE.PLAY || ph === PHASE.ROUND_END;
    if (sim) this.simTick(ph === PHASE.PLAY || ph === PHASE.LOBBY);
    if (ph === PHASE.PLAY) this.rules();
    if (ph === PHASE.LOBBY) this.lobbyTick();
    this.graceCheck();
    if (sim && this.tick % SNAP_EVERY === 0) this.broadcastSnap();
    this.flushEvents();
    this.tick++;
    if (ph === PHASE.LOBBY && this.hold) return; // waiting for the host
    if (--this.phaseT <= 0 && this.phase === ph) this.nextPhase();
  }

  simTick(apply) {
    const W = this.world, tick = this.tick, act = [];
    for (const pl of this.players) {
      if (!pl.st || pl.st.mode === MODE.OUT || pl.status === 'gone') continue;
      let inp = NOINP;
      if (pl.bot) inp = apply ? pl.brain.input(this, pl) : NOINP;
      else {
        const q = pl.inq.get(tick);
        if (q) { pl.inq.delete(tick); pl.last = q; } else if (pl.conn) pl.starve++;
        if (pl.inq.size) for (const k of pl.inq.keys()) if (k < tick) pl.inq.delete(k);
        inp = apply && pl.conn ? pl.last : NOINP;
      }
      pl.inp = inp;
      charBegin(pl.st, inp, pl.I);
      act.push(pl);
    }
    this.act = act;
    const dts = DT / SUBSTEPS;
    for (let k = 0; k < SUBSTEPS; k++) {
      W.setTime((tick * SUBSTEPS + k + 1) * dts);
      for (const pl of act) charSub(pl.st, pl.I, W, tick, pl.ctx);
    }
    for (const pl of act) charEnd(pl.st, W, tick, pl.ctx);
    this.playerCollisions(act);
    this.grabs(act);
    if (this.level.boulders) this.boulderStep();
  }

  onGround(pl, c, tick) {
    if (c.tag === 'trust' && this.phase === PHASE.PLAY) {
      const id = c.vis.ti;
      if (this.trustReal[id]) this.proven[id] = 1;
      else if (this.tileTouch[id] < 0) { this.tileTouch[id] = tick; this.world.kill(c.dyn, tick + this.level.tileDrop); this.ev('tile', id, tick); }
      return;
    }
    if (c.tag === 'tile' && this.phase === PHASE.PLAY) {
      const id = c.vis.ti;
      if (this.tileTouch[id] < 0) {
        this.tileTouch[id] = tick;
        this.world.kill(c.dyn, tick + (this.level.tileDrop || TILE.DROP_TICKS));
        this.ev('tile', id, tick);
      }
    }
  }
  onContact(pl, c, n, vn, tick) {
    if (c.tag !== 'door' || this.phase !== PHASE.PLAY) return;
    const d = this.doorByDyn.get(c.dyn);
    if (!d || !d.breakable || this.world.isDead(c.dyn, tick + 1) || n[2] > -0.6) return;
    d.hp -= vn > 6 ? 1 : (DT / SUBSTEPS) * (1 + Math.max(0, vn) * 0.6);
    if (d.hp <= 0) { this.world.kill(c.dyn, tick + 1); this.ev('door', d.id, tick + 1, pl.slot); }
  }

  playerCollisions(act) {
    const list = act.filter((p) => { const m = p.st.mode; return m !== MODE.RESPAWN && m !== MODE.OUT && m !== MODE.LEDGE && m !== MODE.CLIMB; });
    const grid = new Map(), A1 = [0, 0, 0], B1 = [0, 0, 0], A2 = [0, 0, 0], B2 = [0, 0, 0];
    const key = (x, z) => ((Math.floor(x / 2) + 2048) << 12) | (Math.floor(z / 2) + 2048);
    for (const p of list) { const k = key(p.st.p[0], p.st.p[2]); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(p); }
    for (const p of list) {
      const s1 = p.st, cx = Math.floor(s1.p[0] / 2), cz = Math.floor(s1.p[2] / 2);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const arr = grid.get(((ix + 2048) << 12) | (iz + 2048)); if (!arr) continue;
        for (const q of arr) {
          if (q.slot <= p.slot) continue;
          const s2 = q.st;
          if (Math.abs(s1.p[1] - s2.p[1]) > 2.2) continue;
          const r1 = charShape(s1, A1, B1), r2 = charShape(s2, A2, B2);
          const [u, v] = segSeg(A1, B1, A2, B2);
          const px = A1[0] + (B1[0] - A1[0]) * u, py = A1[1] + (B1[1] - A1[1]) * u, pz = A1[2] + (B1[2] - A1[2]) * u;
          const qx = A2[0] + (B2[0] - A2[0]) * v, qy = A2[1] + (B2[1] - A2[1]) * v, qz = A2[2] + (B2[2] - A2[2]) * v;
          let nx = px - qx, ny = py - qy, nz = pz - qz; const d = Math.hypot(nx, ny, nz), rr = r1 + r2;
          if (d >= rr) continue;
          if (d < 1e-5) { nx = 1; ny = 0; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
          const pen = rr - d;
          s1.p[0] += nx * pen * 0.5; s1.p[1] += Math.max(0, ny) * pen * 0.5; s1.p[2] += nz * pen * 0.5;
          s2.p[0] -= nx * pen * 0.5; s2.p[1] += Math.max(0, -ny) * pen * 0.5; s2.p[2] -= nz * pen * 0.5;
          const rvx = s1.v[0] - s2.v[0], rvy = s1.v[1] - s2.v[1], rvz = s1.v[2] - s2.v[2], vn = rvx * nx + rvy * ny + rvz * nz;
          const rel = Math.hypot(rvx, rvy, rvz);
          if (vn < 0) { const j = -vn * 0.55; s1.v[0] += nx * j; s1.v[1] += ny * j; s1.v[2] += nz * j; s2.v[0] -= nx * j; s2.v[1] -= ny * j; s2.v[2] -= nz * j; }
          // standing on someone's head
          if (ny > 0.7) { s1.gr = 1; s1.gn[0] = 0; s1.gn[1] = 1; s1.gn[2] = 0; s1.gv[0] = s2.v[0]; s1.gv[1] = 0; s1.gv[2] = s2.v[2]; s1.co = PHYS.COYOTE; s1.cd = 1; if (s1.v[1] < 0) s1.v[1] = 0; }
          else if (ny < -0.7) { s2.gr = 1; s2.gn[0] = 0; s2.gn[1] = 1; s2.gn[2] = 0; s2.gv[0] = s1.v[0]; s2.gv[1] = 0; s2.gv[2] = s1.v[2]; s2.co = PHYS.COYOTE; s2.cd = 1; if (s2.v[1] < 0) s2.v[1] = 0; }
          // diving tackles knock people over
          if (rel > 8.5) {
            if (s1.mode === MODE.DIVE && s2.mode === MODE.NORMAL && s2.kt <= 0) { toRag(s2); s2.kt = 0.4; s2.v[0] = s1.v[0] * 0.55; s2.v[1] = 3.5; s2.v[2] = s1.v[2] * 0.55; }
            else if (s2.mode === MODE.DIVE && s1.mode === MODE.NORMAL && s1.kt <= 0) { toRag(s1); s1.kt = 0.4; s1.v[0] = s2.v[0] * 0.55; s1.v[1] = 3.5; s1.v[2] = s2.v[2] * 0.55; }
          }
        }
      }
    }
  }

  grabs(act) {
    for (const p of act) p.st.held = 0;
    for (const p of act) {
      const s = p.st;
      if (s.mode !== MODE.GRABBING) continue;
      const tg = this.players[s.gt - 1], ts = tg && tg.st;
      const ok = ts && ts.mode !== MODE.OUT && ts.mode !== MODE.RESPAWN && ts.mode !== MODE.RAG && ts.mode !== MODE.LEDGE && ts.mode !== MODE.CLIMB && tg.status === 'in';
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      const ax = s.p[0] + fx * 0.95, az = s.p[2] + fz * 0.95;
      const dist = ok ? Math.hypot(ts.p[0] - ax, ts.p[2] - az) : 99;
      if (!ok || dist > 2.4 || Math.abs(ts.p[1] - s.p[1]) > 1.6) { s.mode = MODE.NORMAL; s.gt = 0; s.gc = PHYS.GRAB_CD; s.mt = 0; continue; }
      ts.held = p.slot + 1;
      // tether: the grabbed bean can't get further than TETHER from our hands, and is dragged along with us
      if (dist > PHYS.TETHER) {
        const ux = (ts.p[0] - ax) / dist, uz = (ts.p[2] - az) / dist, k = dist - PHYS.TETHER;
        ts.p[0] -= ux * k; ts.p[2] -= uz * k;
        const vr = (ts.v[0] - s.v[0]) * ux + (ts.v[2] - s.v[2]) * uz;
        if (vr > 0) { ts.v[0] -= ux * vr; ts.v[2] -= uz * vr; }
      }
    }
    for (const p of act) {
      const s = p.st;
      if (s.mode !== MODE.NORMAL || !(p.inp.b & BTN.GRAB) || s.gc > 0 || s.held) continue;
      const q = this.nearestAhead(p, PHYS.GRAB_REACH);
      if (q && !q.st.held && q.st.mode !== MODE.GRABBING) { s.mode = MODE.GRABBING; s.mt = 0; s.gt = q.slot + 1; q.st.held = p.slot + 1; }
    }
  }

  nearestAhead(p, range) {
    const s = p.st, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    let best = null, bd = range;
    for (const q of this.act || []) {
      if (q === p || !q.st) continue;
      const m = q.st.mode; if (m === MODE.OUT || m === MODE.RESPAWN || m === MODE.LEDGE || m === MODE.CLIMB) continue;
      const dx = q.st.p[0] - s.p[0], dz = q.st.p[2] - s.p[2], d = Math.hypot(dx, dz);
      if (d > bd + 0.6 || Math.abs(q.st.p[1] - s.p[1]) > 1.1 || d < 1e-3) continue;
      if ((dx * fx + dz * fz) / d < 0.55) continue;
      if (d - 0.6 < bd) { bd = d - 0.6; best = q; }
    }
    return best;
  }

  boulderStep() {
    const B = this.level.boulders, W = this.world, t = this.tick * DT;
    if ((this.phase === PHASE.PLAY || this.phase === PHASE.ROUND_END) && t >= B.start) {
      this.ballT -= DT;
      if (this.ballT <= 0) {
        if (B.cannons) {
          this.ballId = (this.ballId + 1) & 255; // Boulder Bash: a random cannon fires at the middle, more and more often
          const k = Math.min(1, (t - B.start) / B.ramp), every = B.every + (B.min - B.every) * k;
          this.ballT = every * (0.7 + this.rng() * 0.6);
          const c = B.cannons[Math.floor(this.rng() * B.cannons.length)], ang = c.yaw + (this.rng() - 0.5) * B.spread, sp = B.speed[0] + (B.speed[1] - B.speed[0]) * (0.4 * k + 0.6 * this.rng() * (0.5 + k * 0.5));
          W.balls.push({ id: this.ballId, p: c.p.slice(), v: [Math.sin(ang) * sp, 0, Math.cos(ang) * sp], r: B.r, age: 0 });
          this.ev('boom', B.cannons.indexOf(c));
        } else { // Crown Peak: each shot is called out ahead of time so its cannon can flash twice first
          this.ballT = B.every * (0.75 + this.rng() * 0.5);
          const i = Math.floor(this.rng() * B.xs.length), at = this.tick + Math.round(B.lead / DT);
          (this.ms.bq || (this.ms.bq = [])).push({ i, at, x: B.xs[i] + (this.rng() - 0.5) * 0.5, vx: (this.rng() - 0.5) * 0.8 });
          this.ev('warn', i, at);
        }
      }
    }
    const bq = this.ms.bq;
    while (bq && bq.length && bq[0].at <= this.tick) {
      const s = bq.shift();
      this.ballId = (this.ballId + 1) & 255;
      W.balls.push({ id: this.ballId, p: [s.x, B.y, B.z], v: [s.vx, 0, -3.5], r: B.r, age: 0 });
    }
    const dts = DT / SUBSTEPS, SV = [0, 0, 0];
    for (let k = 0; k < SUBSTEPS; k++) {
      W.setTime((this.tick * SUBSTEPS + k + 1) * dts);
      for (const b of W.balls) {
        b.v[1] -= PHYS.G * 0.8 * dts;
        b.p[0] += b.v[0] * dts; b.p[1] += b.v[1] * dts; b.p[2] += b.v[2] * dts;
        W.near(b.p[0], b.p[1], b.p[2], b.r + 0.1, this.tick, (c) => {
          if (c.ghost || !contactSeg(c, b.p, b.p, b.r, HB)) return;
          const n = HB.n;
          b.p[0] += n[0] * HB.d; b.p[1] += n[1] * HB.d; b.p[2] += n[2] * HB.d;
          W.surfVel(c, HB.cp, SV);
          const vn = (b.v[0] - SV[0]) * n[0] + (b.v[1] - SV[1]) * n[1] + (b.v[2] - SV[2]) * n[2];
          if (vn < 0) { const k2 = vn < -3 ? 1.25 : 1; b.v[0] -= n[0] * vn * k2; b.v[1] -= n[1] * vn * k2; b.v[2] -= n[2] * vn * k2; }
          if (c.surf === 4) { b.v[0] += n[0] * 4; b.v[2] += n[2] * 4; }
        });
        const sp = Math.hypot(b.v[0], b.v[1], b.v[2]); if (sp > 15) { b.v[0] *= 15 / sp; b.v[1] *= 15 / sp; b.v[2] *= 15 / sp; }
      }
    }
    for (let i = W.balls.length - 1; i >= 0; i--) { const b = W.balls[i]; b.age += DT; if (b.p[1] < this.level.rules.killY - 6 || b.age > 45) W.balls.splice(i, 1); }
  }

  lobbyTick() {
    if (this.needHumans) { // ranked: start (after a short countdown) as soon as enough real players are in, and wait again if they leave
      const h = this.humanCount();
      if (this.hold && h >= this.needHumans) { this.hold = false; this.setPhase(PHASE.LOBBY, this.duel ? TIMING.duelStart : TIMING.rankedStart); }
      else if (!this.hold && h < this.needHumans) { this.hold = true; this.setPhase(PHASE.LOBBY, 900); return; }
    }
    const left = this.phaseT / TICK_HZ;
    if (this.botFill && left <= TIMING.botFillWindow && this.humanCount() > 0) {
      const want = Math.round(this.max * (1 - left / TIMING.botFillWindow) + 1);
      let guard = 3;
      while (this.activeCount() < Math.min(this.max, want) && guard-- > 0) this.addBot();
    }
    if (this.humanCount() >= this.max) this.shortenLobby(TIMING.lobbyFull);
  }

  graceCheck() {
    if (this.gt % TICK_HZ) return;
    for (const p of this.players) if (!p.bot && !p.conn && !p.left && this.gt - p.dcAt > TIMING.disconnectGrace * TICK_HZ) this.leave(p.slot);
  }

  // ---------------- round rules ----------------
  // Red Light Rush: while the mascot is looking, anyone who moves flashes red and goes back to the start line.
  // Movement is measured tick to tick (being bumped counts too!), so standing perfectly still is the only way.
  redLight(ins) {
    const RLc = this.level.rl, st = rlState(RLc.plan, this.tick * DT), scan = st.phase === 'scan';
    for (const p of ins) {
      const s = p.st, q = s.p, last = p.rlp || (p.rlp = [q[0], q[1], q[2]]);
      if (s.mode === MODE.RESPAWN || s.mode === MODE.OUT) { last[0] = NaN; continue; }
      const moved = Math.hypot(q[0] - last[0], q[1] - last[1], q[2] - last[2]);
      if (scan && moved > RLc.still && q[2] > RLc.z0 + 1 && q[2] < RLc.line) {
        this.ev('red', p.slot, Math.round(q[0] * 10), Math.round(q[1] * 10), Math.round(q[2] * 10));
        s.v[0] = s.v[1] = s.v[2] = 0; s.mode = MODE.RESPAWN; s.mt = PHYS.RESPAWN_T - 0.45; s.cp = 0; s.held = 0; s.gt = 0;
        last[0] = NaN; continue;
      }
      last[0] = q[0]; last[1] = q[1]; last[2] = q[2];
    }
  }

  rules() {
    const L = this.level, el = (this.tick - TP) / TICK_HZ;
    const ins = this.players.filter((p) => p.status === 'in' && p.st);
    const humansIn = ins.filter((p) => !p.bot && p.conn).length;
    if (L.type === 'race') {
      if (L.rl) this.redLight(ins);
      const f = L.finish;
      for (const p of ins) { const q = p.st.p; if (q[0] >= f[0] && q[0] <= f[3] && q[1] >= f[1] && q[1] <= f[4] && q[2] >= f[2] && q[2] <= f[5]) this.qualify(p, true); }
      if (L.rules.respawn === false) for (const p of ins) if (p.st.mode === MODE.OUT && p.status === 'in') this.eliminate(p); // Slime Surge: no second chances
      if (this.qualCount >= this.Q || el >= this.timeLimit) return this.endRound(el >= this.timeLimit ? 'time' : 'quota');
      if (!this.players.some((p) => p.status === 'in')) return this.endRound('quota');
      if (humansIn === 0 && !this.testMode) { if (this.lastHumanDone < 0) this.lastHumanDone = this.tick; if (this.tick - this.lastHumanDone > 6 * TICK_HZ) return this.endRound('fast'); }
    } else if (L.type === 'survival') {
      for (const p of ins) if (p.st.mode === MODE.OUT) this.eliminate(p);
      const alive = this.players.filter((p) => p.status === 'in').length;
      if (alive <= this.Q || el >= this.timeLimit) return this.endRound(alive <= this.Q ? 'quota' : 'time');
      if (!this.testMode && !this.anyHumanWatching()) return this.endRound('fast');
    } else if (L.type === 'hunt') {
      this.huntStep(ins);
      if (el >= this.timeLimit) return this.endRound('time');
      if (!this.testMode && !this.anyHumanWatching()) return this.endRound('fast');
    } else if (L.type === 'final') {
      const c = crownAt((this.tick + 1) * DT);
      for (const p of ins) {
        const s = p.st; if (s.mode === MODE.RESPAWN) continue;
        const d = Math.hypot(s.p[0] - c[0], s.p[1] + 0.3 - c[1], s.p[2] - c[2]);
        if (d < 1.7 && ((p.inp.b & BTN.GRAB) || s.mode === MODE.GRABBING)) { this.winner = p.slot; this.ev('crown', p.slot, this.runMs()); return this.endRound('crown'); } // grab it!
      }
      if (el >= this.timeLimit) return this.endRound('time');
      if (!this.testMode && ins.length && !this.anyHumanWatching()) return this.endRound('fast');
    }
  }

  // Hoop Hunt: hoops appear on a seeded schedule; the first bean through one scores it and it pops up elsewhere
  huntStep(ins) {
    const st = this.ms, life = HUNT.life * TICK_HZ, tick = this.tick;
    for (let k = 0; k < st.hg.length; k++) {
      const t0 = st.ht[k]; if (tick < t0) continue;
      if (tick >= t0 + life) { st.hg[k]++; st.ht[k] = tick + Math.round(0.6 * TICK_HZ); this.ev('hoop', k, st.hg[k], st.ht[k], -1, 0); continue; }
      const h = hoopAt(this.levelSeed, k, st.hg[k]), c = h.p, R2 = HUNT.reach * HUNT.reach;
      for (const p of ins) {
        const s = p.st; if (!s || s.mode === MODE.OUT || s.mode === MODE.RESPAWN) continue;
        const dx = s.p[0] - c[0], dy = s.p[1] - c[1], dz = s.p[2] - c[2];
        if (dx * dx + dy * dy + dz * dz > R2) continue;
        p.score = (p.score | 0) + h.v; p.lastScore = tick;
        st.hg[k]++; st.ht[k] = tick + Math.round(HUNT.gap * TICK_HZ);
        this.ev('hoop', k, st.hg[k], st.ht[k], p.slot, p.score);
        break;
      }
    }
  }
  huntRank(list) { return list.slice().sort((a, b) => (b.score | 0) - (a.score | 0) || (a.lastScore | 0) - (b.lastScore | 0) || a.slot - b.slot); }

  // time since GO in milliseconds (finish times, for map records)
  runMs() { return Math.round(((this.tick - TP) * 1000) / TICK_HZ); }
  qualify(p, crossed = false) {
    if (p.status !== 'in') return;
    p.status = 'q'; p.place = ++this.qualCount; p.qual++;
    if (p.st) p.st.mode = MODE.OUT;
    this.ev('q', p.slot, p.place, crossed ? this.runMs() : -1);
  }
  eliminate(p) {
    if (p.status !== 'in') return;
    p.status = 'x'; p.xRound = this.roundIdx; p.outSeq = ++this.outN;
    if (p.st) p.st.mode = MODE.OUT;
    if (this.elimOrder) this.elimOrder.push(p.slot);
    this.ev('x', p.slot);
  }

  progress(p) { // for ranking unfinished racers / final climbers
    if (!p.st) return -1e9;
    if (this.level.type === 'final') { const c = crownAt(this.tick * DT); return -Math.hypot(p.st.p[0] - c[0], p.st.p[1] - c[1], p.st.p[2] - c[2]); }
    return p.st.cp * 1000 + p.st.p[2];
  }

  endRound(reason) {
    if (this.phase !== PHASE.PLAY) return;
    if (this.duel) return this.endDuelRound(reason);
    const L = this.level, ins = this.players.filter((p) => p.status === 'in');
    if (L.type === 'race') {
      ins.sort((a, b) => this.progress(b) - this.progress(a));
      for (const p of ins) { if (reason === 'fast' && this.qualCount < this.Q) this.qualify(p); else this.eliminate(p); }
      const xs = ins.filter((p) => p.status === 'x'); xs.forEach((p, i) => { p.outSeq = this.outN + xs.length - i; }); this.outN += xs.length; // further = better
      if (this.finalMode) {
        const fin = this.players.filter((p) => p.status === 'q').sort((a, b) => a.place - b.place);
        if (fin.length) { this.winner = fin[0].slot; this.ev('crown', this.winner); }
        this.runnersUp = ins.slice(0, 2).map((p) => p.slot);
      }
    } else if (L.type === 'hunt') {
      const rank = this.huntRank(ins);
      rank.forEach((p, i) => (i < this.Q && (p.score | 0) > 0 ? this.qualify(p) : this.eliminate(p)));
      const xs = rank.filter((p) => p.status === 'x'); xs.forEach((p, i) => { p.outSeq = this.outN + xs.length - i; }); this.outN += xs.length;
    } else if (L.type === 'survival' && this.finalMode) {
      // last bean standing: a survivor wins (random pick if time ran out), else whoever fell last
      const alive = ins.slice().sort(() => this.rng() - 0.5);
      this.winner = alive.length ? alive[0].slot : this.elimOrder.length ? this.elimOrder[this.elimOrder.length - 1] : -1;
      for (const p of alive) if (p.slot !== this.winner) this.eliminate(p);
      const w = this.players[this.winner];
      if (w) { if (w.status !== 'q') { w.status = 'q'; w.qual++; } if (w.st && w.st.mode === MODE.OUT) w.st = null; this.ev('crown', this.winner); }
      this.runnersUp = this.elimOrder.filter((s) => s !== this.winner).slice(-2).reverse();
    } else if (L.type === 'survival') {
      if (reason === 'fast') { ins.sort(() => this.rng() - 0.5); ins.forEach((p, i) => (i < this.Q ? this.qualify(p) : this.eliminate(p))); }
      else for (const p of ins) this.qualify(p);
    } else if (L.type === 'final') {
      if (this.winner < 0 && ins.length) { ins.sort((a, b) => this.progress(b) - this.progress(a)); this.winner = ins[0].slot; this.ev('crown', this.winner); }
      const rank = ins.slice().sort((a, b) => this.progress(b) - this.progress(a));
      this.runnersUp = rank.filter((p) => p.slot !== this.winner).slice(0, 2).map((p) => p.slot);
      for (const p of ins) { if (p.slot === this.winner) { p.status = 'q'; p.qual++; } else this.eliminate(p); }
    }
    this.flushEvents();
    this.send(-1, { t: 'roundEnd', reason, winner: this.winner });
    this.setPhase(PHASE.ROUND_END, TIMING.roundEnd);
  }

  // ---------------- duels ----------------
  duelists() { return this.players.filter((p) => !p.bot && p.status !== 'gone'); }
  duelOver() {
    const live = this.duelists().filter((p) => !p.left);
    return live.length < 2 || this.roundIdx >= this.show.length - 1 || Object.values(this.dw).some((w) => w >= DUEL_WINS);
  }
  duelLeader() {
    const ds = this.duelists(); if (!ds.length) return -1;
    const live = ds.filter((p) => !p.left); if (live.length === 1) return live[0].slot;
    ds.sort((a, b) => (this.dw[b.slot] | 0) - (this.dw[a.slot] | 0));
    return ds.length > 1 && (this.dw[ds[0].slot] | 0) === (this.dw[ds[1].slot] | 0) ? -1 : ds[0].slot; // level -> a draw
  }
  endDuelRound(reason) {
    const L = this.level, ins = this.players.filter((p) => p.status === 'in');
    const best = () => { const r = ins.slice().sort((a, b) => this.progress(b) - this.progress(a)); return r.length && (r.length < 2 || this.progress(r[0]) - this.progress(r[1]) > 0.5) ? r[0].slot : -1; };
    let w = -1;
    if (L.type === 'race') { const fin = this.players.filter((p) => p.status === 'q').sort((a, b) => a.place - b.place); w = fin.length ? fin[0].slot : best(); }
    else if (L.type === 'final') w = this.winner >= 0 ? this.winner : best();
    else if (L.type === 'hunt') { const r = ins.slice().sort((a, b) => (b.score | 0) - (a.score | 0)); w = r.length && (r.length < 2 || (r[0].score | 0) > (r[1].score | 0)) ? r[0].slot : -1; }
    else w = ins.length === 1 ? ins[0].slot : ins.length === 0 && this.elimOrder.length ? this.elimOrder[this.elimOrder.length - 1] : -1; // both still up when time runs out: a draw
    for (const p of this.duelists()) {
      if (p.slot === w) { if (p.status !== 'q') { p.status = 'q'; p.qual++; } if (p.st && p.st.mode === MODE.OUT) p.st = null; }
      else if (p.status === 'in' || p.status === 'q') this.eliminate(p);
    }
    this.winner = w;
    if (w >= 0) this.dw[w] = (this.dw[w] | 0) + 1;
    this.ev('rw', w);
    this.flushEvents();
    this.send(-1, { t: 'roundEnd', reason, winner: w, dw: this.dw });
    this.setPhase(PHASE.ROUND_END, TIMING.roundEnd);
  }

  results() {
    const qualified = this.players.filter((p) => p.status === 'q').map((p) => p.slot);
    const eliminated = this.players.filter((p) => p.status === 'x' && p.xRound === this.roundIdx).map((p) => p.slot);
    const last = this.duel ? this.duelOver() : this.roundIdx >= this.show.length - 1;
    const next = last || (!this.duel && qualified.length <= 1) ? null : this.show[this.roundIdx + 1];
    this.send(-1, { t: 'results', round: this.roundIdx, qualified, eliminated, next, winner: this.winner, dw: this.duel ? this.dw : undefined });
    if (!this.duel) for (const p of this.players) if (!p.bot && !p.done && p.status === 'x') this.finishPlayer(p, false);
    this.setPhase(PHASE.RESULTS, TIMING.results);
  }

  podium(winnerSlot) {
    const w = this.players[winnerSlot];
    this.winner = w ? winnerSlot : -1;
    if (this.duel) this.runnersUp = this.duelists().filter((p) => p.slot !== winnerSlot).map((p) => p.slot);
    const top = w ? [winnerSlot, ...(this.runnersUp || [])] : [];
    for (const p of this.players) if (!p.bot && !p.done && (this.duel ? !p.left && p.status !== 'gone' : p.status === 'q' || p.status === 'in')) this.finishPlayer(p, p.slot === winnerSlot);
    this.send(-1, { t: 'podium', top, winner: w ? this.pub(w) : null, dw: this.duel ? this.dw : undefined });
    this.setPhase(PHASE.PODIUM, TIMING.podium);
  }

  finishPlayer(p, won) {
    if (p.done || p.bot) return;
    p.done = true;
    // a duel win is not a show win: it moves your rank and pays berries/XP, but never a crown
    const res = { rounds: p.qual, won: won && !this.duel, totalRounds: this.duel ? DUEL_WINS + 1 : this.show.length, matchId: this.id };
    if (this.duel) { res.duel = true; res.duelWon = !!won; }
    if (this.kind) res.ranked = this.rankedResult(p, won);
    if (this.hooks.onPlayerDone) this.hooks.onPlayerDone(p, res);
  }
  // what happened to this player, for their own device to turn into RP (see src/online/ranks.js)
  rankedResult(p, won) {
    const hs = this.players.filter((q) => !q.bot && q.status !== 'gone' && q !== p);
    if (this.duel) {
      const o = hs[0], mine = this.dw[p.slot] | 0, theirs = o ? this.dw[o.slot] | 0 : 0;
      const res = won ? 1 : !p.left && this.winner < 0 ? 0.5 : 0; // level at the end (or the show broke off): a draw
      return { kind: 'duel', opp: o ? o.rk | 0 : p.rk | 0, oppName: o ? o.name : '', res, score: [mine, theirs] };
    }
    // a ranked show: your place among the real players (bots don't count)
    const ru = this.runnersUp || [];
    const score = (q) => (q.slot === this.winner ? 1e12 : q.status === 'x' || q.left ? q.outSeq | 0 : 1e9 - (ru.includes(q.slot) ? ru.indexOf(q.slot) : 5));
    const me = won ? 1e12 : score(p);
    const place = won ? 1 : 1 + hs.filter((q) => score(q) > me).length;
    const avg = hs.length ? Math.round(hs.reduce((a, q) => a + (q.rk | 0), 0) / hs.length) : p.rk | 0;
    return { kind: 'show', place: Math.min(place, hs.length + 1), of: hs.length + 1, avg, w: won ? 1 : 0 };
  }

  end(reason) {
    if (this.ended) return;
    for (const p of this.players) if (!p.bot && !p.done && p.status !== 'gone') this.finishPlayer(p, p.slot === this.winner);
    this.ended = true;
    this.send(-1, { t: 'end', reason, winner: this.winner >= 0 ? this.pub(this.players[this.winner]) : null });
    if (this.hooks.onEnd) this.hooks.onEnd(this.summary(reason));
  }

  summary(reason) {
    return {
      id: this.id, reason, startedAt: this.createdAt, endedAt: Date.now(), rounds: this.roundIdx + 1,
      winner: this.winner >= 0 ? { name: this.players[this.winner].name, userId: this.players[this.winner].userId, bot: this.players[this.winner].bot } : null,
      players: this.players.filter((p) => p.status !== 'gone').map((p) => ({ slot: p.slot, userId: p.userId, name: p.name, bot: p.bot, rounds: p.qual, won: p.slot === this.winner })),
    };
  }

  // ---------------- networking helpers ----------------
  ev(...e) { this.evq.push(e); }
  flushEvents() { if (this.evq.length) { this.send(-1, { t: 'ev', k: this.tick, ep: this.epoch, e: this.evq }); this.evq = []; } }

  broadcastSnap() {
    const vis = [];
    const showQ = (p) => p.status === 'in' || this.phase === PHASE.LOBBY || (p.slot === this.winner && this.phase === PHASE.ROUND_END);
    for (const p of this.players) if (p.st && p.st.mode !== MODE.OUT && p.status !== 'gone' && showQ(p)) vis.push(p);
    const body = buildSnapBody(vis, this.world.balls);
    let alive = 0; for (const p of this.players) if (p.status === 'in') alive++;
    for (const p of this.players) {
      if (p.bot || !p.conn || p.left) continue;
      let own = null;
      if (p.st && p.st.mode !== MODE.OUT && showQ(p)) { packChar(p.st, F, 0); own = F; }
      const inbuf = p.newest >= 0 ? p.newest - this.tick : -99;
      this.send(p.slot, encodeSnap({ epoch: this.epoch, tick: this.tick, inbuf, q: this.qualCount, alive, Q: this.Q || 0 }, own, body));
    }
  }
}


export { TP, Match };
