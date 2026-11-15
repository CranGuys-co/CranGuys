// CranGuys — bot AI. Bots produce exactly the same inputs a human would (stick + buttons), so the server
// simulates them through the identical character controller. Skill controls reactions, accuracy and mistakes.
import { BTN, MODE, DT } from './config.js';
import { mulberry32, clamp, wrapPi } from './math.js';
import { crownAt } from '../levels/crownpeak.js';
import { TILE, LAYERS } from '../levels/tiletumble.js';
import { T_PLAY } from '../levels/kit.js';
import { kinAngle, kinW } from './collide.js';
import { WALL, GAP, LOW, DUCK } from '../levels/wallrush.js';
import { hoopAt, hoopLive } from '../levels/hoophunt.js';
import { cmCycle, cmPhase } from '../levels/colormatch.js';
import { ropeNextHit } from '../levels/jumprope.js';
import { rlState } from '../levels/redlight.js';
import { TICK_HZ } from './config.js';
const PI = Math.PI;

class BotBrain {
  constructor(seed, skill) {
    this.rng = mulberry32(seed);
    this.skill = skill;
    this.aggro = this.rng() < 0.12;
    this.reset();
  }
  reset() {
    const r = this.rng;
    this.node = 0; this.lane = r() * 2 - 1; this.side = r() < 0.5 ? -1 : 1;
    this.stuck = 0; this.grabT = 0; this.hes = 0; this.doorPick = {}; this.bad = new Set();
    this.target = -1; this.retarget = 0; this.rc = -1; this.wander = null; this.jumpCD = 0; this.diveCD = 0;
    this.react = 0.16 + (1 - this.skill) * 0.2 + r() * 0.06;
    this.noise = (1 - this.skill) * 0.35;
    this.lead = 0; this.tTarget = -1; this.tPrev = -1; this.tAge = 0; this.noJump = 0;
  }

  // m: Match, pl: player record, returns {mx, mz, b}
  input(m, pl) {
    const s = pl.st, L = m.level, W = m.world, tick = m.tick, t = tick * DT, r = this.rng;
    const out = { mx: 0, mz: 0, b: 0 };
    if (!s || s.mode === MODE.OUT || s.mode === MODE.RESPAWN) return out;
    if (m.phase !== 4 && L.type !== 'lobby') return out; // only act during PLAY
    if (this.jumpCD > 0) this.jumpCD -= DT; if (this.diveCD > 0) this.diveCD -= DT;
    // human-like hesitation
    if (this.hes > 0) { this.hes -= DT; return out; }
    if (r() < (1 - this.skill) * 0.006) { this.hes = 0.2 + r() * 0.5; return out; }
    if (s.rc !== this.rc) { this.rc = s.rc; this.node = 0; this.target = -1; this.stuck = 0; this.tTarget = -1; this.tPrev = -1; }

    let tx, tz, throttle = 1, wantJump = false, wantDive = false, wantGrab = false, act = null, selfJump = false;
    const p = s.p;
    if (L.type === 'lobby') ({ tx, tz, throttle, wantJump } = this.lobby(p, t));
    else if (L.bot && L.bot.ring) ({ tx, tz, throttle } = this.ring(s));
    else if (L.bot && L.bot.walls) ({ tx, tz, throttle, wantJump, wantDive } = this.walls(m, s, tick));
    else if (L.bot && L.bot.hunt) ({ tx, tz, throttle, wantJump } = this.hunt(m, s, tick));
    else if (L.bot && L.bot.colors) ({ tx, tz, throttle } = this.colors(m, s, tick));
    else if (L.bot && L.bot.rlgl) ({ tx, tz, throttle, selfJump, wantGrab } = this.rlgl(m, s, tick));
    else if (L.bot && L.bot.dodge) ({ tx, tz, throttle } = this.dodge(m, s));
    else if (L.type === 'survival') { let hop; ({ tx, tz, throttle, hop } = this.survival(m, s, tick)); if (hop) wantJump = true; }
    else ({ tx, tz, wantGrab, wantJump, throttle, act, selfJump } = this.route(m, s, tick));

    // ----- hazards: sweeper arms, hammers, lasers -----
    const hz = this.hazards(m, s, t);
    if (hz === 'jump') wantJump = true; else if (hz === 'dive') wantDive = true;
    else if (hz === 'wait') { throttle = 0; this.stuck = 0; }
    if (hz === 'nojump') this.noJump = 0.2; else if (this.noJump > 0) this.noJump -= DT;

    let dx = tx - p[0], dz = tz - p[2]; const dl = Math.hypot(dx, dz);
    if (dl > 0.05) { dx /= dl; dz /= dl; } else { dx = 0; dz = 0; throttle = 0; }
    // steering noise
    if (this.noise > 0 && dl > 0.05) { const a = Math.atan2(dx, dz) + (r() - 0.5) * this.noise; dx = Math.sin(a); dz = Math.cos(a); }
    out.mx = dx * throttle; out.mz = dz * throttle;

    // ----- obstacle / gap sensing (every other tick, staggered) -----
    if (s.gr && dl > 0.3 && !selfJump && throttle > 0 && ((tick + pl.slot) & 1) === 0 && s.mode === MODE.NORMAL) {
      const sp = Math.hypot(s.v[0], s.v[2]), ahead = 0.55 + sp * 0.07;
      const g = W.groundBelow(p[0] + dx * ahead, p[1] + 0.4, p[2] + dz * ahead, 4.5, tick);
      if (!g && (L.type === 'race' || L.type === 'final')) wantJump = true;
      const hit = W.raycast([p[0], p[1] - 0.45, p[2]], [dx, 0, dz], 0.95, tick, (c) => !c.kin && c.tag !== 'door' && c.surf !== 4);
      if (hit && hit.n[1] < 0.5) { wantJump = true; this.grabT = 0.9; }
    }
    // stuck detection
    const sp2 = Math.hypot(s.v[0] - s.gv[0], s.v[2] - s.gv[2]);
    if (s.mode === MODE.NORMAL && throttle > 0.5 && dl > 1 && sp2 < 1.0) this.stuck += DT; else this.stuck = Math.max(0, this.stuck - DT * 2);
    if (this.stuck > 0.8 && (L.type === 'race' || L.type === 'final' || L.type === 'hunt') && !selfJump) {
      const nd = L.bot && L.bot.route && L.bot.route[this.node];
      if (nd && nd.act === 'doors' && this.doorPick[nd.row] !== undefined) { this.bad.add(this.doorPick[nd.row]); delete this.doorPick[nd.row]; }
      else { wantJump = true; this.grabT = 1.0; this.lane = clamp(this.lane + (r() - 0.5) * 1.2, -1, 1); }
      this.stuck = 0;
    }


    // ----- air control: extend long jumps with a dive -----
    if (!s.gr && s.mode === MODE.NORMAL && s.cd && s.v[1] < -1.5 && this.diveCD <= 0 && (L.type === 'race' || L.type === 'final') && !selfJump && ((tick + pl.slot) % 3) === 0) {
      const g = W.groundBelow(p[0] + s.v[0] * 0.25, p[1], p[2] + s.v[2] * 0.25, 7, tick);
      if (!g && r() < 0.35 + this.skill * 0.6) wantDive = true;
    }
    // ledge: keep pushing forward and holding grab to climb
    if (s.mode === MODE.LEDGE) { out.mx = Math.sin(s.ln); out.mz = Math.cos(s.ln); wantGrab = true; if (s.mt > 0.25) wantJump = true; }
    if (this.grabT > 0) { this.grabT -= DT; wantGrab = true; }
    // occasional chaos grabs
    if (this.aggro && s.mode === MODE.NORMAL && ((tick + pl.slot) % 15) === 0 && r() < 0.3) { const q = m.nearestAhead(pl, 1.2); if (q && (q.bot || r() < 0.15)) this.grabT = 1.2 + r(); }
    // random silly jumps
    if (s.gr && !selfJump && r() < 0.004 * (1.4 - this.skill)) wantJump = true;
    if (this.noJump > 0 && s.mode !== MODE.LEDGE && hz !== 'jump') wantJump = false;

    if (wantJump && this.jumpCD <= 0 && (s.gr || s.co > 0 || s.mode === MODE.LEDGE)) { out.b |= BTN.JUMP; this.jumpCD = 0.25; }
    if (wantDive && this.diveCD <= 0 && s.mode === MODE.NORMAL) { out.b |= BTN.DIVE; this.diveCD = 0.8; }
    if (wantGrab) out.b |= BTN.GRAB;
    return out;
  }

  lobby(p, t) {
    const r = this.rng;
    if (!this.wander || Math.hypot(this.wander[0] - p[0], this.wander[1] - p[2]) < 1 || r() < 0.005) {
      const a = r() * PI * 2, d = r() * 13;
      this.wander = [Math.cos(a) * d, Math.sin(a) * d];
    }
    return { tx: this.wander[0], tz: this.wander[1], throttle: 0.55 + r() * 0.1, wantJump: r() < 0.008 };
  }

  route(m, s, tick) {
    const L = m.level, route = L.bot.route, p = s.p, r = this.rng;
    while (this.node < route.length - 1 && p[2] > route[this.node].p[2] - 0.4) this.node++;
    const nd = route[this.node];
    let tx = nd.p[0] * (nd.mirror ? this.side : 1) + this.lane * nd.w, tz = nd.p[2] + 1.5, wantGrab = false, wantJump = false, throttle = nd.spd || 1, selfJump = false;
    if (nd.act === 'doors') tx = this.pickDoor(m, nd.row, s, tick);
    else if (nd.act === 'trust') { const o = this.trust(m, s, tick); if (o) { tx = o.x; tz = o.z; throttle = o.th; selfJump = true; } }
    else if (nd.act === 'plat') { const o = this.plat(m, s, tick, nd); tx = o.x; tz = o.z; throttle = o.th; wantJump = o.jump; selfJump = true; }
    else if (nd.act === 'rope') { selfJump = true; if (this.ropeJump(m, s, tick)) wantJump = true; }
    else if (nd.act === 'disc' && s.gr && nd.p[1] - (p[1] - 0.78) > 0.4 && Math.hypot(nd.p[0] - p[0], nd.p[2] - p[2]) < 4.4 && r() < 0.3 + this.skill * 0.5) wantJump = true; // step up to the next disc
    if (nd.act === 'crown' || (L.type === 'final' && p[1] > 25 && p[2] > 123)) {
      const c = crownAt((tick + 10) * DT);
      tx = c[0]; tz = c[2];
      const dh = Math.hypot(c[0] - p[0], c[2] - p[2]);
      if (dh < 2.4 + this.skill && s.gr && r() < 0.25 + this.skill * 0.35) { this.grabT = 0.9; this.jumpCD = 0; wantJump = true; }
      if (dh < 3) wantGrab = true;
    }
    // final: dodge boulders rolling at us
    if (L.type === 'final' && m.world.balls.length) {
      for (const b of m.world.balls) {
        const dz = b.p[2] - p[2], dx = b.p[0] - p[0];
        if (dz > -1 && dz < 11 && Math.abs(dx) < 2.8 && Math.abs(b.p[1] - p[1]) < 5 && b.v[2] < -1 && r() < 0.5 + this.skill * 0.5) { tx = p[0] + (dx > 0 ? -5 : 5); tz = p[2] + 1; break; }
      }
    }
    return { tx, tz, wantGrab, wantJump, throttle, act: nd.act, selfJump };
  }

  // Rope Rumble: jump just before the rope sweeps through. Bots read its rhythm with skill-based error, and
  // weaker bots get fooled by fake-outs (they jump at the normal time while the rope is still stalled).
  ropeJump(m, s, tick) {
    const L = m.level, t = tick * DT; if (!s.gr || s.p[2] < 7.5 || s.p[2] > L.rope.end + 1) return false;
    const h = ropeNextHit(L.rope.plan, t, s.p[0]); if (!h) return false;
    if (this.ropeSeg !== h.seg) {
      this.ropeSeg = h.seg; this.ropeErr = (this.rng() - 0.5) * (0.1 + (1 - this.skill) * 0.42);
      this.ropeFool = h.fast && this.rng() < 0.7 * (1 - this.skill) + 0.1;   // fake-outs catch lots of bots
      this.ropeMiss = this.rng() < 0.03 + (1 - this.skill) * 0.08;               // …and some just forget to jump
    }
    if (this.ropeMiss) return false;
    const eta = h.t - t - (this.ropeFool ? 0.55 : 0), lead = 0.32 + this.ropeErr;
    return eta > 0 && eta <= lead && eta > lead - DT * 1.6;
  }
  // Red Light Rush: run on green, stop for red. Careful bots stop a little early; the rest react to the music
  // cutting out, some too slowly. A few troublemakers grab whoever is next to them just before the scan.
  rlgl(m, s, tick) {
    const L = m.level, t = tick * DT, st = rlState(L.rl.plan, t), r = this.rng, p = s.p;
    if (st.phase === 'wait') return { tx: p[0], tz: p[2] + 5, throttle: 0, selfJump: true, wantGrab: false };
    if (this.rlK !== st.k) {
      this.rlK = st.k; const redAt = st.seg.t + st.seg.g;
      const careful = r() < 0.18 + 0.5 * this.skill;
      this.rlStop = careful ? redAt - (0.12 + r() * 0.55) : redAt + this.react * 0.8 + r() * (0.12 + (1 - this.skill) * 0.7);
      this.rlX = clamp(p[0] + (r() - 0.5) * 7, -L.rl.half + 1.5, L.rl.half - 1.5);
      this.rlSab = this.aggro && r() < 0.6;
    }
    const go = st.phase === 'green' ? t < this.rlStop : t < this.rlStop && st.phase === 'turn';
    return { tx: this.rlX, tz: p[2] + 20, throttle: go ? 1 : 0, selfJump: true, wantGrab: this.rlSab && go && this.rlStop - t < 0.45 };
  }

  // Trust Tiles: step tile to tile, preferring tiles others have proven solid and avoiding revealed fakes.
  trust(m, s, tick) {
    const L = m.level, T = L.trust, tiles = L.tiles, p = s.p, r = this.rng, step = T.size + T.gap;
    const fake = (id) => m.tileTouch[id] >= 0 || m.world.isDead(tiles[id].dyn, tick);
    const proven = (id) => m.proven && m.proven[id];
    const row = Math.round((p[2] - T.z0) / step), onField = p[2] > T.z0 - step / 2;
    const cRow = onField ? clamp(row, 0, T.rows - 1) : -1, cCol = clamp(Math.round(p[0] / step + (T.cols - 1) / 2), 0, T.cols - 1);
    if (cRow === T.rows - 1 && s.gr) return { x: tiles[cRow * T.cols + cCol].x, z: p[2] + 3, th: 0.8 }; // last row: straight on to the landing
    let tg = this.tTarget >= 0 ? tiles[this.tTarget] : null;
    const reached = tg && Math.abs(tg.x - p[0]) < 0.55 && Math.abs(tg.z - p[2]) < 0.55 && s.gr;
    this.tAge += DT;
    if (!tg || fake(tg.id) || reached || this.tAge > 3.5) {
      const cand = [];
      if (cRow < 0) for (let c = 0; c < T.cols; c++) cand.push([c, 0, Math.abs(c - cCol) * 0.25]);
      else {
        cand.push([cCol, cRow + 1, -1.2]);
        if (cCol > 0) cand.push([cCol - 1, cRow, 0]);
        if (cCol < T.cols - 1) cand.push([cCol + 1, cRow, 0]);
      }
      let best = -1, bs = -1e9;
      for (const [c, rw, pen] of cand) {
        const id = rw * T.cols + c; if (rw >= T.rows || fake(id)) continue;
        let sc = -pen + r() * (1.6 - this.skill);
        if (proven(id)) sc += 1.5 + this.skill * 3;
        if (id === this.tPrev) sc -= 2.5;
        if (sc > bs) { bs = sc; best = id; }
      }
      if (best < 0 && cRow > 0) best = (cRow - 1) * T.cols + cCol; // boxed in by fakes: back up a row
      if (reached || !tg || fake(tg.id)) this.tPrev = cRow >= 0 ? cRow * T.cols + cCol : -1;
      this.tTarget = best; this.tAge = 0;
      // hesitate a moment before testing an unknown tile (weaker bots dither longer)
      if (best >= 0 && !proven(best) && cRow >= -1 && r() < 0.5) this.hes = 0.1 + r() * 0.5 * (1.2 - this.skill);
      tg = best >= 0 ? tiles[best] : null;
    }
    if (!tg) return null;
    return { x: tg.x, z: tg.z, th: 0.55 + this.skill * 0.15 };
  }

  // Shuffle platforms: wait on the current support until the next row's platform slides in front, then hop.
  plat(m, s, tick, nd) {
    const L = m.level, W = m.world, p = s.p, t = tick * DT, ps = L.plats.filter((q) => q.row === nd.row);
    const posAt = (q, tt) => q.x0 + q.d * Math.sin(q.w * tt + q.ph);
    const T = 0.55;
    let best = ps[0], bd = 1e9;
    for (const q of ps) { const d = Math.abs(posAt(q, t + T) - p[0]); if (d < bd) { bd = d; best = q; } }
    const edge = best.z - best.hz, dist = edge - p[2];
    if (!s.gr) return { x: posAt(best, t + 0.2), z: best.z, th: dist > -best.hz ? 0.75 : 0.3, jump: false }; // mid-hop: steer onto it
    const g = W.groundBelow(p[0], p[1] + 0.2, p[2], 1.6, tick);
    const on = g && g.c.kin ? g.c : null;
    if (bd < 0.9 - (1 - this.skill) * 0.3 && s.gr) { // go: run to our edge and hop across
      const edgeNear = !W.groundBelow(p[0], p[1] + 0.2, p[2] + 0.6, 1.6, tick);
      return { x: posAt(best, t + T), z: best.z, th: 0.62, jump: edgeNear && dist > 0.2 };
    }
    // hold position on our support, near its front edge
    if (on) return { x: on.wp[0], z: on.wp[2] + on.h[2] - 0.9, th: 0.8, jump: false };
    return { x: clamp(posAt(best, t + 1.2), -8.5, 8.5), z: edge - 1.4, th: 0.6, jump: false };
  }

  // Wall Rush: read the next wall coming at us, run to the gap (or line up on a low block to hop, or a raised
  // bar to dive under). Later walls are fast enough that the weaker bots misjudge them more and more.
  walls(m, s, tick) {
    const L = m.level, Wd = L.wall, p = s.p, t = tick * DT, r = this.rng, plan = Wd.plan;
    let best = null, bt = 1e9;
    let lo = 0, hi = plan.length - 1, idx = 0;
    while (lo <= hi) { const k = (lo + hi) >> 1; if (plan[k].t <= t + 3) { idx = k; lo = k + 1; } else hi = k - 1; }
    for (let w = idx; w >= 0 && w > idx - 14; w--) {
      const W = plan[w]; if (t > W.t + W.move) continue;
      const tArr = W.t + W.move * (WALL.from - (p[2] + 0.6)) / WALL.travel; // when its front face reaches us
      if (tArr < t - 0.05) continue;
      if (tArr < bt) { bt = tArr; best = W; }
    }
    const homeZ = -2 + this.lane * 3;
    const none = { wantJump: false, wantDive: false };
    if (!best) return { tx: p[0] + (this.lane * 4 - p[0]) * 0.3, tz: homeZ, throttle: 0.5, ...none };
    const dt = bt - t, n = Wd.n, half = Wd.half, bx = (j) => -half + WALL.block * (j + 0.5);
    const cur = clamp(Math.floor((p[0] + half) / WALL.block), 0, n - 1);
    const nearest = (type, noise) => { let bj = -1, bd = 1e9; for (let j = 0; j < n; j++) { if (best.pat[j] !== type) continue; const d = Math.abs(bx(j) - p[0]) + r() * noise; if (d < bd) { bd = d; bj = j; } } return bj; };
    if (this.wPlan !== best) { // decide once per wall (with a skill-based chance of misreading it — worse at speed)
      this.wPlan = best; this.wRead = 0.18 + (1 - this.skill) * 0.45 + r() * 0.2;
      this.wGoal = nearest(GAP, 1.5 * (1.2 - this.skill)); this.wLow = nearest(LOW, 0); this.wDuck = nearest(DUCK, 0);
      if (r() < (1 - this.skill) * (0.12 + 0.1 * best.stage)) this.wGoal = Math.floor(r() * n); // a bad read
    }
    if (dt > 3.2 - this.wRead) return { tx: p[0], tz: homeZ, throttle: 0.4, ...none }; // still sizing it up
    const reach = (j) => j >= 0 && Math.abs(bx(j) - p[0]) / 7.2 < dt - 0.15;
    let goal = this.wGoal;
    if (!reach(goal)) goal = reach(this.wLow) ? this.wLow : reach(this.wDuck) ? this.wDuck : best.pat[cur] !== 1 ? cur : goal;
    const here = best.pat[cur];
    const jump = here === LOW && dt < 0.2 + this.react * 0.3 && dt > 0.02;
    const dive = here === DUCK && dt < 0.75 + this.skill * 0.1 && dt > 0.38 && r() < 0.35 + this.skill * 0.6;
    const tx = goal >= 0 ? bx(goal) : p[0];
    return { tx, tz: Math.abs(tx - p[0]) > 0.5 ? p[2] : homeZ, throttle: Math.abs(tx - p[0]) > 0.35 ? 1 : 0.25, wantJump: jump, wantDive: dive };
  }

  // Hoop Hunt: head for the best-value hoop nearby; hop through ground hoops, ride a pad up into gold ones.
  hunt(m, s, tick) {
    const st = m.ms, p = s.p, r = this.rng;
    if (!st || !st.hg) return this.ring(s);
    this.retarget -= DT;
    const live = (k) => hoopLive(st, k, tick) || (st.ht[k] > tick && st.ht[k] - tick < 0.8 * TICK_HZ);
    if (this.target < 0 || !live(this.target) || this.tGen !== st.hg[this.target] || this.retarget <= 0) {
      let bk = -1, bs = -1e9;
      for (let k = 0; k < st.hg.length; k++) {
        if (!live(k)) continue;
        const h = hoopAt(m.levelSeed, k, st.hg[k]), d = Math.hypot(h.p[0] - p[0], h.p[2] - p[2]);
        let sc = h.v / (d + 4) + r() * 0.12 * (1.3 - this.skill);
        if (h.pad && this.skill < 0.35) sc *= 0.4;
        if (sc > bs) { bs = sc; bk = k; }
      }
      this.target = bk; this.tGen = bk >= 0 ? st.hg[bk] : -1; this.retarget = 0.8 + r() * 0.8;
    }
    if (this.target < 0) return { ...this.ring(s), wantJump: false };
    const h = hoopAt(m.levelSeed, this.target, st.hg[this.target]), d = Math.hypot(h.p[0] - p[0], h.p[2] - p[2]);
    const ground = p[1] - 0.78;
    const jump = !h.pad && s.gr && d < 2.0 + this.skill * 0.6 && d > 0.3 && h.p[1] - ground < 3.6 && r() < 0.5 + this.skill * 0.5;
    // overshoot slightly so we run *through* the hoop instead of stopping under it
    const ox = d > 0.1 ? (h.p[0] - p[0]) / d : 0, oz = d > 0.1 ? (h.p[2] - p[2]) / d : 0;
    return { tx: h.p[0] + (h.pad ? 0 : ox * 1.5), tz: h.p[2] + (h.pad ? 0 : oz * 1.5), throttle: h.pad && d < 0.6 ? 0.2 : 1, wantJump: jump };
  }

  // Colour Clash: once the colour is up, go stand in the middle of the nearest tile of that colour.
  colors(m, s, tick) {
    const C = m.level.cm, p = s.p, t = tick * DT, r = this.rng, P = cmCycle(C.plan, t), ph = cmPhase(P, t);
    if (P && (ph === 'show' || ph === 'drop')) {
      if (this.cmT !== P.t) {
        this.cmT = P.t; this.cmGo = P.t + P.ready + this.react * 0.6 + (1 - this.skill) * Math.min(1.1, P.show * 0.3) + r() * Math.min(0.5, P.show * 0.12);
        let bi = -1, bd = 1e9;
        const want = r() < (1 - this.skill) * 0.12 ? (P.target + 1) % 6 : P.target; // weaker bots sometimes mix up colours
        for (const c of C.cells) { if (P.col[c.i] !== want && P.col[c.i] !== P.target) continue; const d = Math.hypot(c.x - p[0], c.z - p[2]) + (P.col[c.i] === want ? 0 : 6) + r() * 2 * (1.2 - this.skill); if (d < bd) { bd = d; bi = c.i; } }
        this.cmGoal = bi;
      }
      if (t >= this.cmGo && this.cmGoal >= 0) {
        const c = C.cells[this.cmGoal], d = Math.hypot(c.x - p[0], c.z - p[2]);
        return { tx: c.x, tz: c.z, throttle: d > 0.5 ? 1 : 0 };
      }
      return { tx: p[0], tz: p[2], throttle: 0 };
    }
    if (!this.wander || Math.hypot(this.wander[0] - p[0], this.wander[1] - p[2]) < 0.8 || r() < 0.006) {
      const c = C.cells[Math.floor(r() * C.cells.length)]; this.wander = [c.x * 0.7, c.z * 0.7];
    }
    return { tx: this.wander[0], tz: this.wander[1], throttle: 0.35 + this.skill * 0.15 };
  }

  // Boulder Bash: amble around the middle and sidestep boulders that are about to roll through us.
  dodge(m, s) {
    const p = s.p, R = m.level.arena.R, r = this.rng;
    if (!this.wander || Math.hypot(this.wander[0] - p[0], this.wander[1] - p[2]) < 1 || r() < 0.004) {
      const a = r() * PI * 2, d = r() * R * 0.55; this.wander = [Math.cos(a) * d, Math.sin(a) * d];
    }
    let tx = this.wander[0], tz = this.wander[1], th = 0.4 + this.skill * 0.2;
    let worst = null, wt = 1.5 + this.skill * 0.6;
    for (const b of m.world.balls) {
      const rx = p[0] - b.p[0], rz = p[2] - b.p[2], vx = b.v[0], vz = b.v[2], vv = vx * vx + vz * vz;
      if (vv < 1 || Math.abs(b.p[1] - p[1]) > 2.5) continue;
      const tc = (rx * vx + rz * vz) / vv; if (tc < 0 || tc > wt) continue;
      const cx = rx - vx * tc, cz = rz - vz * tc, miss = Math.hypot(cx, cz); if (miss > b.r + 1.4) continue;
      wt = tc; worst = { cx, cz, vx, vz };
    }
    if (worst && (this.dodgeT === undefined || this.dodgeT > 0 || r() < 0.3 + this.skill * 0.6)) {
      let nx = worst.cx, nz = worst.cz; if (Math.hypot(nx, nz) < 0.25) { nx = -worst.vz; nz = worst.vx; }
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (Math.hypot(p[0] + nx * 3, p[2] + nz * 3) > R - 1.8) { nx = -nx; nz = -nz; }
      tx = p[0] + nx * 4; tz = p[2] + nz * 4; th = 1;
    }
    if (Math.hypot(p[0], p[2]) > R - 2.6) { tx = p[0] * 0.3; tz = p[2] * 0.3; th = 1; }
    return { tx, tz, throttle: th };
  }

  // Jump Ring: amble around the middle of the stage, keep off the rim.
  ring(s) {
    const p = s.p, r = this.rng;
    if (!this.wander || Math.hypot(this.wander[0] - p[0], this.wander[1] - p[2]) < 0.8 || r() < 0.004) {
      const a = r() * PI * 2, d = 3 + r() * 6;
      this.wander = [Math.cos(a) * d, Math.sin(a) * d];
    }
    if (Math.hypot(p[0], p[2]) > 10.2) return { tx: p[0] * 0.4, tz: p[2] * 0.4, throttle: 1 };
    return { tx: this.wander[0], tz: this.wander[1], throttle: 0.35 + this.skill * 0.2 };
  }

  pickDoor(m, row, s, tick) {
    const doors = m.level.doors.filter((d) => d.row === row), W = m.world, r = this.rng;
    const open = doors.filter((d) => W.isDead(d.dyn, tick));
    let cur = this.doorPick[row];
    const curOpen = cur !== undefined && W.isDead(doors.find((d) => d.id === cur).dyn, tick);
    if (cur === undefined || this.bad.has(cur) || (!curOpen && open.length && r() < 0.06)) {
      let c = open.length ? open : doors.filter((d) => !this.bad.has(d.id));
      if (!c.length) { c = doors; this.bad.clear(); }
      let best = null, bs = 1e9;
      for (const d of c) { const sc = Math.abs(d.x - s.p[0]) + r() * 5; if (sc < bs) { bs = sc; best = d; } }
      cur = this.doorPick[row] = best.id;
    }
    return doors.find((d) => d.id === cur).x + (r() - 0.5) * 0.4;
  }

  survival(m, s, tick) {
    const p = s.p, r = this.rng, tiles = m.level.tiles, touch = m.tileTouch, W = m.world;
    // tile currently under us (or the nearest one below while airborne)
    let cur = -1;
    const g = W.groundBelow(p[0], p[1] + 0.2, p[2], s.gr ? 1.5 : 12, tick);
    if (g && g.c.tag === 'tile') cur = g.c.vis.ti;
    const free = (id) => touch[id] < 0;
    const tt = this.target >= 0 ? tiles[this.target] : null;
    const reached = tt && Math.hypot(tt.x - p[0], tt.z - p[2]) < 0.8;
    this.retarget -= DT;
    if (!tt || !free(tt.id) || reached || this.retarget <= 0 || (cur >= 0 && tiles[cur].layer !== tt.layer)) {
      let best = -1, bs = -1e9;
      const pool = cur >= 0 ? tiles[cur].nb : [];
      for (const id of pool) {
        if (!free(id)) continue;
        const t = tiles[id], d = Math.hypot(t.x - p[0], t.z - p[2]);
        let freeN = 0; for (const k of t.nb) if (free(k)) freeN++;
        const sc = -Math.abs(d - 2.4) * 0.6 + freeN * 0.15 - t.ring * 0.05 + r() * 1.2 * (1.3 - this.skill);
        if (sc > bs) { bs = sc; best = id; }
      }
      if (best < 0) { // nothing adjacent: head for the nearest free tile on this layer
        const layer = cur >= 0 ? tiles[cur].layer : 2; let bd = 1e9;
        for (const t of tiles) if (t.layer === layer && free(t.id)) { const d = Math.hypot(t.x - p[0], t.z - p[2]); if (d < bd) { bd = d; best = t.id; } }
      }
      this.target = best; this.retarget = 0.5 + r() * 0.6;
    }
    const T = this.target >= 0 ? tiles[this.target] : { x: p[0] + s.v[0], z: p[2] + s.v[2] };
    const dT = Math.hypot(T.x - p[0], T.z - p[2]);
    let hop = false, throttle = 0.45 + this.skill * 0.15;
    if (s.gr && s.mode === MODE.NORMAL) {
      const dx = (T.x - p[0]) / (dT || 1), dz = (T.z - p[2]) / (dT || 1);
      const vToward = (s.v[0] - s.gv[0]) * dx + (s.v[2] - s.gv[2]) * dz;
      const age = cur >= 0 && touch[cur] >= 0 ? tick - touch[cur] : -1;
      if (dT > 2.7) { throttle = 1; if (vToward > 3.4 + (1 - this.skill)) hop = r() < 0.5 + this.skill * 0.5; }
      else if (age >= 0 && age < 8 + this.skill * 8 && dT > 0.8) throttle = 0;   // patience: use the whole tile before moving on
      if (age > 17 + (1 - this.skill) * 6) hop = true;               // about to drop: jump now!
    } else if (!s.gr) throttle = clamp(dT / 0.45 / 7.6, 0.2, 1);
    if (dT < 0.8) throttle = 0.25;
    return { tx: T.x, tz: T.z, throttle, hop };
  }

  hazards(m, s, t) {
    const p = s.p, L = m.level, r = this.rng;
    if (s.mode !== MODE.NORMAL || !s.gr) return null;
    const look = this.react + (r() - 0.5) * 0.1 * (1.5 - this.skill);
    let act = null, over = false, easy = 0;
    for (const h of L.hazards) {
      if (h.type === 'arm') {
        let ang, w;
        if (h.k) { if (h.k.start !== undefined && t < h.k.start) continue; ang = kinAngle(h.k, t); w = kinW(h.k, t); if (!w) continue; }
        else { ang = h.ph + h.w * t; w = h.w; }
        const res = armThreat(h.c, h.hl, ang, w, p, h.high);
        if (res === null) continue;
        if (h.over) { if (res < 0.8 && res > 0) over = true; continue; }
        if (res < (h.high ? 0.55 : 0.24 + look * 0.4) && res > (h.high ? 0 : 0.06)) { act = act || (h.high ? 'dive' : 'jump'); if (h.k) easy = 0.3; }
      } else if (h.type === 'pend' && !act && pendThreat(h, p, t, look)) act = 'wait';
    }
    if (act === 'wait') return this.rng() < 0.15 * (1 - this.skill) ? null : 'wait';
    if (act) return succeed(this, act, easy);
    if (over) return 'nojump';
    if (L.lasers) for (const lz of L.lasers) {
      if (Math.abs(p[1] - lz.y) > 1.6) continue;
      if (lz.type === 'beam') {
        if (t < lz.start) continue;
        const res = armThreat(lz.c, lz.hl, lz.w * t, lz.w, p, false);
        if (res !== null && res < 0.22 + look * 0.4 && res > 0.05) return succeed(this, 'jump');
      } else {
        const tt = t - lz.t0; if (tt < 0) continue;
        const ph = tt % lz.period; if (ph > lz.move + 0.1) continue;
        const flip = lz.alt && Math.floor(tt / lz.period) & 1;
        const u = ph / lz.move, pos = lz.from + lz.travel * (flip ? 1 - u : u), vel = (lz.travel / lz.move) * (flip ? -1 : 1);
        const me = p[lz.axis], dt = (me - pos) / vel;
        if (lz.low && dt > 0.04 && dt < 0.2 + look * 0.4) return succeed(this, 'jump');
        if (!lz.low && dt > 0 && dt < 0.5 + look * 0.3) return succeed(this, 'dive');
      }
    }
    return null;
  }
}

function succeed(b, act, easy = 0) {
  // skilled bots nail the timing; weaker ones sometimes freeze
  if (b.rng() < 0.55 + easy + b.skill * (0.45 - easy)) return act;
  b.hes = 0.15; return null;
}

// Is a swinging hammer about to cross our path? (only while approaching its swing band)
function pendThreat(h, p, t, look) {
  const dz = h.z - p[2];
  if (dz < 0.7 || dz > 3.6 || Math.abs(p[1] - h.ground - 0.78) > 2) return false;
  const cross = (dz + 1.7) / 6.5 + look * 0.4;
  for (let k = 0; k <= 6; k++) {
    const th = h.amp * Math.sin(h.w * (t + (cross * k) / 6) + h.ph);
    if (Math.abs(th) > 0.8) continue;               // head swung high: we can run underneath
    if (Math.abs(h.x + h.len * Math.sin(th) - p[0]) < 2.2) return true;
  }
  return false;
}

// time (s) until a spinning arm line (current angle `armAng`, angular speed w) sweeps over point p, or null
function armThreat(c, hl, armAng, w, p, high) {
  const dx = p[0] - c[0], dz = p[2] - c[2], dist = Math.hypot(dx, dz);
  if (dist > hl + 0.7 || dist < 0.9 || Math.abs(p[1] - c[1]) > (high ? 2.4 : 1.6)) return null;
  const botAng = Math.atan2(-dz, dx);
  let d = wrapPi((botAng - armAng) * Math.sign(w));
  d = ((d % PI) + PI) % PI;                 // arm is a full line through the pivot
  const arc = 0.9 / dist;                   // angular half-width of the arm+bean contact
  return Math.max(0, d - arc) / Math.abs(w);
}


export { BotBrain };
