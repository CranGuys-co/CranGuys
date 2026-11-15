// CranGuys — ClientGame: everything that happens inside a show on the client.
//  * own bean: client-side prediction with the shared controller, input history, server reconciliation
//    (rewind to the authoritative state and replay unacknowledged inputs) and smoothed error correction
//  * other beans & boulders: snapshot interpolation ~133 ms in the past
//  * world events (falling tiles, breaking doors, qualifications, eliminations, crown) and round flow
import { PHASE, TICK_HZ, DT, MODE, BTN, INTERP_TICKS, TIMING } from './sim/config.js';
import { World } from './sim/world.js';
import { freshLevel } from './levels/index.js';
import { TILE } from './levels/tiletumble.js';
import { newChar, stepChar, unpackChar, copyChar, NFIELDS } from './sim/character.js';
import { encodeInput, decodeSnap, qAxis } from './sim/protocol.js';
import { clamp, angLerp } from './sim/math.js';
import { BeanVis } from './render/bean.js';
import { beanLook } from './util.js';
import { safeName } from './online/chatFilter.js';
import { cleanTag } from './economy/cosmetics.js';
import { huntStart, hoopAt, HUNT } from './levels/hoophunt.js';
const ZERO = Object.freeze({ mx: 0, mz: 0, b: 0 });
const nowTicks = () => (performance.now() / 1000) * TICK_HZ;

class ClientGame {
  constructor(app) {
    this.app = app;
    this.roster = new Map(); this.you = -1; this.phase = 0; this.phaseEnd = 0; this.round = -1; this.showN = 3;
    this.levelId = null; this.epoch = -1; this.Q = 0; this.counts = { q: 0, alive: 0, Q: 0 };
    this.me = newChar([0, 0, 0]); this.mePrev = newChar([0, 0, 0]); this.rep = newChar([0, 0, 0]); this.tmp = newChar([0, 0, 0]);
    this.meActive = false; this.predTick = null; this.hist = new Map(); this.lead = 4; this.off = null; this.inbuf = 2;
    this.err = [0, 0, 0]; this.alpha = 0; this.acc = 0;
    this.snaps = []; this.spectate = -1; this.winner = -1; this.lastInput = ZERO;
    this.ev = []; this.ctx = { rules: null, ev: this.ev, slot: 0 }; this.ctxQ = { rules: null, ev: null, slot: 0 };
    this.debris = []; this.remoteState = new Map(); this.feed = [];
    this.stats = { corrections: 0, bigCorrections: 0, replays: 0, starve: 0 };
  }

  // ---------------- messages ----------------
  onMessage(m) {
    if (m instanceof Uint8Array) return this.onSnap(m);
    switch (m.t) {
      case 'match': return this.onWelcome(m);
      case 'join': this.addRoster(m.p); this.app.ui.lobbyJoin(this.roster.get(m.p.s)); return;
      case 'leave': { const r = this.roster.get(m.s); if (r) { r.status = 'gone'; this.app.ui.lobbyLeave(m.s); } return; }
      case 'round': return this.onRound(m);
      case 'phase': return this.onPhase(m);
      case 'ev': return this.onEvents(m);
      case 'roundEnd': this.winner = m.winner; if (m.dw) this.dw = m.dw; this.app.onRoundEnd(m); return;
      case 'chat': return this.app.onChat(m);
      case 'chatx': return this.app.onChatBlocked(m);
      case 'results': if (m.dw) this.dw = m.dw; this.applyResults(m); this.app.onResults(m); return;
      case 'podium': if (m.dw) this.dw = m.dw; this.app.onPodium(m); return;
      case 'end': this.app.onShowEnd(m); return;
    }
  }

  addRoster(p) {
    const look = beanLook(p.c);
    const r = { slot: p.s, name: safeName(p.n), tag: p.b ? null : cleanTag(p.g), /* name re-checked here too, so a modified host can't show a rude name */ cos: p.c, bot: !!p.b, status: p.st || 'in', look, vis: new BeanVis(look), userId: p.u, rp: p.r == null ? null : p.r | 0 };
    this.roster.set(p.s, r);
    return r;
  }

  onWelcome(m) {
    this.roster.clear();
    for (const p of m.players) this.addRoster(p);
    this.you = m.you; this.round = m.round; this.showN = m.show.length; this.show = m.show; this.Q = m.Q;
    this.hold = !!m.hold; this.room = m.room || null;
    this.kind = m.kind || null; this.need = m.need | 0; this.dw = m.dw || {}; this.mid = m.id || null;
    this.off = null; this.lead = 4; // a (new) host: re-learn its clock from scratch
    this.loadLevel(m.level, m.seed, m.epoch);
    for (const [id, t] of m.tiles || []) this.touchTile(id, t, true);
    for (const [id, t] of m.doors || []) this.breakDoor(id, t, -1, true);
    if (m.ms && m.ms.hg) { this.hunt = { hg: m.ms.hg.slice(), ht: m.ms.ht.slice() }; for (const [sl, sc] of m.ms.sc || []) { const r = this.roster.get(sl); if (r) r.score = sc; } }
    this.setPhase(m.phase, m.left);
    this.app.onMatch(m);
  }

  onRound(m) {
    for (const r of this.roster.values()) if (r.status === 'q' || (m.duel && r.status === 'x' && !r.bot)) r.status = 'in';
    if (m.dw) this.dw = m.dw;
    this.app.ui.realPlayers(this);
    this.round = m.i; this.showN = m.n; this.Q = m.Q; this.tp = m.tp; this.winner = -1;
    this.loadLevel(m.level, m.seed, m.epoch);
    if (m.type === 'hunt') { this.hunt = huntStart(); for (const r of this.roster.values()) r.score = 0; }
    this.introStart = performance.now();
    this.app.onRound(m);
  }

  loadLevel(id, seed, epoch) {
    this.levelId = id; this.epoch = epoch; this.levelSeed = seed; this.hunt = null;
    this.level = freshLevel(id, seed);
    this.world = new World(this.level);
    this.ctx.rules = this.ctxQ.rules = this.level.rules;
    this.ctx.slot = this.ctxQ.slot = this.you;
    this.tileTouch = this.level.tiles ? new Int32Array(this.level.tiles.length).fill(-1) : null;
    this.tileFx = this.level.tiles ? new Uint8Array(this.level.tiles.length) : null;
    this.tileDrop = this.level.tileDrop || TILE.DROP_TICKS;
    this.doorBroken = new Map();
    this.predTick = null; this.hist.clear(); this.snaps = []; this.meActive = false; this.err = [0, 0, 0];
    this.debris = []; this.remoteState.clear(); this.counts = { q: 0, alive: 0, Q: this.Q };
    for (const r of this.roster.values()) r.vis.lastV = null;
    this.app.scene.loadLevel(this.level, this.world);
  }

  setPhase(p, left) {
    this.phase = p; this.phaseEnd = performance.now() + left * 1000;
    if (p === PHASE.PLAY) this.playStart = performance.now();
  }
  get duel() { return this.kind === 'duel'; }
  // Hoop Hunt: the hoops that are out right now (for drawing), with a pop-in scale and a blink before they go
  liveHoops(tick) {
    if (!this.hunt) return [];
    const out = [], life = HUNT.life * TICK_HZ;
    for (let k = 0; k < this.hunt.hg.length; k++) {
      const t0 = this.hunt.ht[k], age = tick - t0; if (age < 0 || age >= life) continue;
      const h = hoopAt(this.levelSeed, k, this.hunt.hg[k]);
      out.push({ k, h, s: Math.min(1, age / 9) * (age > life - 60 && Math.floor(age / 4) % 2 ? 0.75 : 1) });
    }
    return out;
  }
  get isFinal() { return !this.duel && this.round >= 0 && this.round === this.showN - 1; }
  get timeLimit() { return (this.isFinal && this.level.timeLimitFinal) || this.level.timeLimit; }
  onPhase(m) {
    if (m.hold !== undefined) this.hold = !!m.hold;
    if (m.epoch !== undefined && m.epoch !== this.epoch && m.p !== PHASE.RESULTS && m.p !== PHASE.PODIUM) { /* phase for a level we haven't loaded yet: still apply timing */ }
    this.setPhase(m.p, m.left);
    this.app.onPhase(m.p, m);
  }

  touchTile(id, tick, silent) {
    if (!this.tileTouch || this.tileTouch[id] >= 0) return;
    this.tileTouch[id] = tick;
    this.world.kill(this.level.tiles[id].dyn, tick + this.tileDrop);
    if (silent) this.tileFx[id] = 1; else { const t = this.level.tiles[id]; this.app.fx.near([t.x, t.y, t.z], 'tile', 0.5); }
  }
  breakDoor(id, tick, slot, silent) {
    const d = this.level.doors && this.level.doors[id]; if (!d || this.doorBroken.has(id)) return;
    this.doorBroken.set(id, tick);
    this.world.kill(d.dyn, tick);
    if (!silent) {
      const c = d.col.vis.c;
      this.debris.push({ p: [d.x, 5.5, d.z], v: [(Math.random() - 0.5) * 2, 3, 6 + Math.random() * 3], rx: 0, w: 3 + Math.random() * 2, t: 0, c });
      this.app.fx.burst([d.x, 5.5, d.z], 'door');
      this.app.fx.near([d.x, 5, d.z], 'door', 1);
      const me = this.me.p; if (Math.hypot(me[0] - d.x, me[2] - d.z) < 8) this.app.cam.shake(0.25, 0.3);
    }
  }

  onEvents(m) {
    if (m.ep !== this.epoch) return;
    for (const e of m.e) {
      const [k, a, b] = e;
      if (k === 'tile') this.touchTile(a, b);
      else if (k === 'door') this.breakDoor(a, b, e[3]);
      else if (k === 'q') { const r = this.roster.get(a); if (r) { r.status = 'q'; if (!r.bot) this.app.ui.realPlayers(this); } this.app.onQualify(a, b); if (a === this.you && e[3] >= 0) this.app.onFinishTime(this.levelId, e[3]); }
      else if (k === 'x') { const r = this.roster.get(a); if (r) { r.status = 'x'; if (!r.bot) this.app.ui.realPlayers(this); } this.app.onEliminate(a); }
      else if (k === 'crown') { this.winner = a; this.app.onCrown(a); if (a === this.you && b >= 0) this.app.onFinishTime(this.levelId, b); }
      else if (k === 'rw') this.app.onRoundWin(a);
      else if (k === 'hoop' && this.hunt) {
        const was = this.hunt.hg[a], h = hoopAt(this.levelSeed, a, was);
        this.hunt.hg[a] = b; this.hunt.ht[a] = e[3];
        if (e[4] >= 0) { const r = this.roster.get(e[4]); if (r) r.score = e[5]; this.app.onHoop(e[4], h); }
      }
      else if (k === 'boom') this.app.onBoom(a);
      else if (k === 'warn') this.app.onCannonWarn(a, b);
      else if (k === 'red') this.app.onRedLight(a, b, e[3], e[4]);
    }
  }
  applyResults(m) { for (const s of m.qualified) { const r = this.roster.get(s); if (r) r.status = 'q'; } for (const s of m.eliminated) { const r = this.roster.get(s); if (r) r.status = 'x'; } }

  // ---------------- snapshots, prediction & reconciliation ----------------
  serverTick() { return nowTicks() + (this.off || 0); }

  onSnap(buf) {
    const s = decodeSnap(buf);
    if (!s || s.epoch !== this.epoch) return;
    const off = s.tick - nowTicks();
    if (this.off === null || off > this.off || Math.abs(off - this.off) > 60) this.off = off; else this.off += (off - this.off) * 0.06;
    const players = new Map(); for (const p of s.players) players.set(p.slot, p);
    this.snaps.push({ tick: s.tick, players, balls: s.balls });
    if (this.snaps.length > 40) this.snaps.shift();
    this.counts = { q: s.q, alive: s.alive, Q: s.Q };
    if (s.inbuf > -90) {
      this.inbuf = s.inbuf; this.lead = clamp(this.lead + (2.6 - s.inbuf) * 0.035, 1, 40);
      // our clock estimate runs ahead of the server (e.g. a slow host): pull it back using the server's report
      if (s.inbuf > 9 && this.lead <= 1.5) this.off -= (s.inbuf - 5) * 0.35;
    }
    if (s.own) this.reconcile(s.tick, s.own); else this.meActive = false;
  }

  reconcile(T, own) {
    const srv = unpackChar(own, 0, this.tmp);
    if (this.predTick === null || T >= this.predTick || T < this.predTick - 90) {
      copyChar(this.me, srv); copyChar(this.mePrev, srv);
      const rttTicks = ((this.app.conn && this.app.conn.rtt) || 0) / 1000 * TICK_HZ;
      if (this.predTick === null) this.lead = clamp(rttTicks + 3, 2, 30);
      this.predTick = T + 1; this.meActive = true; this.err = [0, 0, 0];
      this.app.onSpawn && this.app.onSpawn(this.me);
      return;
    }
    this.meActive = true;
    copyChar(this.rep, srv);
    for (let k = T + 1; k < this.predTick; k++) stepChar(this.rep, this.hist.get(k) || ZERO, this.world, k, this.ctxQ);
    this.stats.replays++;
    const dx = this.me.p[0] - this.rep.p[0], dy = this.me.p[1] - this.rep.p[1], dz = this.me.p[2] - this.rep.p[2], d = Math.hypot(dx, dy, dz);
    if (d > 0.02) this.stats.corrections++;
    if (d > 4) { this.err = [0, 0, 0]; this.stats.bigCorrections++; }
    else { this.err[0] += dx; this.err[1] += dy; this.err[2] += dz; }
    this.mePrev.p[0] -= dx; this.mePrev.p[1] -= dy; this.mePrev.p[2] -= dz;
    copyChar(this.me, this.rep);
  }

  // called every frame
  update(dt, inp) {
    this.lastInput = inp;
    if (this.predTick === null) return;
    const target = this.serverTick() + this.lead;
    if (target - this.predTick > 24) this.predTick = Math.floor(target); // fell way behind (tab was hidden): skip ahead
    let n = 0;
    while (this.predTick <= target && n < 12) { this.simTick(inp, n === 0); n++; }
    this.alpha = clamp(1 - (this.predTick - target), 0, 1);
    const k = Math.exp(-dt * 9); this.err[0] *= k; this.err[1] *= k; this.err[2] *= k;
    // door debris
    for (const d of this.debris) { d.t += dt; d.v[1] -= 22 * dt; d.p[0] += d.v[0] * dt; d.p[1] += d.v[1] * dt; d.p[2] += d.v[2] * dt; d.rx += d.w * dt; }
    this.debris = this.debris.filter((d) => d.t < 2.5);
  }

  simTick(inp, fx) {
    const k = this.predTick, apply = this.phase === PHASE.PLAY || this.phase === PHASE.LOBBY || (this.phase === PHASE.COUNTDOWN && this.tp && k >= this.tp);
    const q = apply ? { mx: qAxis(inp.mx) / 127, mz: qAxis(inp.mz) / 127, b: inp.b & 15 } : ZERO;
    this.hist.set(k, q);
    this.hist.delete(k - 150);
    this.app.conn.send(encodeInput(this.epoch, k, q.mx, q.mz, q.b));
    copyChar(this.mePrev, this.me);
    if (this.meActive) {
      this.ev.length = 0;
      stepChar(this.me, q, this.world, k, this.ctx);
      if (fx && this.ev.length) this.app.onLocalEvents(this.ev, this.me);
    }
    this.predTick++;
  }

  // interpolated state of the own bean for rendering
  ownRenderState() {
    const a = this.alpha, p0 = this.mePrev.p, p1 = this.me.p;
    return {
      p: [p0[0] + (p1[0] - p0[0]) * a + this.err[0], p0[1] + (p1[1] - p0[1]) * a + this.err[1], p0[2] + (p1[2] - p0[2]) * a + this.err[2]],
      v: this.me.v, yaw: angLerp(this.mePrev.yaw, this.me.yaw, a), mode: this.me.mode, gr: this.me.gr, mt: this.me.mt, held: this.me.held, hang: false, air: this.me.air,
    };
  }

  // interpolated remote players & boulders
  remotes() {
    const out = [], balls = [];
    if (this.snaps.length === 0) return { out, balls };
    const rt = this.serverTick() - INTERP_TICKS;
    let a = this.snaps[0], b = null;
    for (let i = 0; i < this.snaps.length; i++) { if (this.snaps[i].tick <= rt) a = this.snaps[i]; else { b = this.snaps[i]; break; } }
    const span = b ? b.tick - a.tick : 1;
    const t = b ? clamp((rt - a.tick) / span, 0, 1) : 0;
    const ext = b ? 0 : clamp((rt - a.tick) / TICK_HZ, 0, 0.12);
    const src = b || a;
    for (const [slot, pb] of src.players) {
      if (slot === this.you && this.meActive) continue;
      const pa = a.players.get(slot) || pb;
      const p0 = b ? pa : pb;
      const s = {
        slot, p: [p0.x + (pb.x - p0.x) * t + pb.vx * ext, p0.y + (pb.y - p0.y) * t + pb.vy * ext, p0.z + (pb.z - p0.z) * t + pb.vz * ext],
        v: [p0.vx + (pb.vx - p0.vx) * t, p0.vy + (pb.vy - p0.vy) * t, p0.vz + (pb.vz - p0.vz) * t],
        yaw: angLerp(p0.yaw, pb.yaw, t), mode: t < 0.5 ? p0.mode : pb.mode, gr: t < 0.5 ? p0.gr : pb.gr, held: pb.held, hang: pb.hang, mt: pb.mt,
      };
      out.push(s);
    }
    const ba = new Map(a.balls.map((x) => [x.id, x]));
    for (const bb of src.balls) { const b0 = (b && ba.get(bb.id)) || bb; balls.push({ id: bb.id, p: [b0.x + (bb.x - b0.x) * t, b0.y + (bb.y - b0.y) * t, b0.z + (bb.z - b0.z) * t], v: [bb.vx, bb.vy, bb.vz] }); }
    // keep the prediction world in sync with boulders so we collide with them locally too
    this.world.balls = balls.map((x) => ({ p: x.p, v: x.v, r: 1.3 }));
    return { out, balls };
  }

  // tile visual states for the GPU (shake while doomed, then drop)
  // visual state per tile: gentle wobble + glow while doomed, then a quick in-place dissolve
  tileStates(data) {
    if (!this.tileTouch) return false;
    const now = this.serverTick(), dropAt = this.tileDrop;
    for (let i = 0; i < this.tileTouch.length; i++) {
      const t0 = this.tileTouch[i], o = i * 4;
      if (t0 < 0) { data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255; continue; }
      const age = now - t0;
      if (age < dropAt) { const u = age / dropAt; data[o] = Math.min(255, 40 + u * 120); data[o + 1] = 0; data[o + 2] = Math.min(255, u * 255); data[o + 3] = 255; }
      else {
        const f = (age - dropAt) / 12; data[o] = 0; data[o + 1] = Math.min(255, f * 255); data[o + 2] = 0; data[o + 3] = f < 1 ? 255 : 0;
        if (!this.tileFx[i]) { this.tileFx[i] = 1; const t = this.level.tiles[i]; this.app.fx.dissolve([t.x, t.y, t.z]); }
      }
    }
    return true;
  }
  doorStates(data) {
    if (!this.level.doors) return false;
    for (const d of this.level.doors) { const o = d.dyn * 4; data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = this.doorBroken.has(d.id) ? 0 : 255; }
    return true;
  }

  timeLeft() { return Math.max(0, (this.phaseEnd - performance.now()) / 1000); }
}


export { ClientGame };
