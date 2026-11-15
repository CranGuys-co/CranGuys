// CranGuys — procedural bean animation: squash & stretch springs, jiggle, run cycle, flailing limbs,
// belly-flop dives, tumbling ragdolls, blinks and expressions. Produces skinning matrices for the bean shader.
import { m4 } from './gl.js';
import { BEAN_RIG } from './geo.js';
import { qt, clamp, wrapPi } from '../sim/math.js';
import { MODE } from '../sim/config.js';
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
const tmpL = new Float32Array(16), tmpB = new Float32Array(16);

class BeanVis {
  constructor(look) {
    this.look = look;
    this.sy = 1; this.syv = 0; this.wob = [0, 0]; this.wobv = [0, 0];
    this.phase = Math.random() * 6; this.blink = 1; this.blinkT = 1 + Math.random() * 3;
    this.q = qt.ident(); this.rq = qt.ident(); this.spin = [0, 0, 0];
    this.lastV = null; this.lastMode = -1; this.lastGr = true; this.yawS = null;
    this.limbs = [0, 0.15, 0, 0.15, 0, 0, 0, 0]; // [armL swing, armL spread, armR swing, armR spread, legL, legR]
    this.bones = new Float32Array(80); this.hatM = new Float32Array(16); this.root = new Float32Array(16);
    this.hitT = 0; this.expr = 0; this.seed = Math.random() * 100;
    this.params = { sq: [1, 1, 0, 0], wob: [0, 0, 0], colA: look.colA, colB: look.colB, pat: look.pat, face: look.face, expr: 0, blink: 1, rainbow: look.rainbow, metal: look.metal, fx: look.fx, hit: 0, tint: [1, 1, 1, 1] };
    this.events = [];
    this.scale = 1; // giant mascots
  }
  setLook(look) { this.look = look; Object.assign(this.params, { colA: look.colA, colB: look.colB, pat: look.pat, face: look.face, rainbow: look.rainbow, metal: look.metal, fx: look.fx }); }

  // s: {p, v, yaw, mode, gr, mt, held, hang}; o: {celebrate, menu, wave}
  update(dt, s, t, o = {}) {
    dt = Math.min(dt, 0.05);
    const v = s.v, sp = Math.hypot(v[0], v[2]), mode = s.mode;
    if (!this.lastV) this.lastV = [v[0], v[1], v[2]];
    this.events.length = 0;
    // ---- transitions ----
    if (mode !== this.lastMode) {
      if (mode === MODE.RAG) { this.hitT = 0.18; this.rq = this.q.slice(); this.spin = [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9]; this.syv -= 4; }
      if (mode === MODE.DIVE) { this.syv += 2.5; }
      if (mode === MODE.SLIDE || mode === MODE.GETUP) this.syv -= 3;
      this.lastMode = mode;
    }
    const grounded = !!s.gr;
    if (grounded && !this.lastGr) { const imp = clamp(-this.lastV[1] / 12, 0, 1.2); this.syv -= 2 + imp * 6; }
    if (!grounded && this.lastGr && v[1] > 4) this.syv += 4;
    this.lastGr = grounded;

    // ---- facing ----
    if (this.yawS === null) this.yawS = s.yaw;
    this.yawS += wrapPi(s.yaw - this.yawS) * Math.min(1, dt * 18);

    // ---- squash & stretch spring ----
    let tgt = 1;
    if (o.menu || (grounded && sp < 0.5 && mode === MODE.NORMAL)) tgt = 1 + Math.sin(t * 2.6 + this.seed) * 0.018;
    if (grounded && sp > 0.5 && mode === MODE.NORMAL) tgt = 1 + Math.sin(this.phase * 2) * 0.045;
    if (!grounded && mode === MODE.NORMAL) tgt = 1 + clamp(v[1] * 0.012, -0.08, 0.1);
    this.syv += (-(this.sy - tgt) * 210 - this.syv * 13) * dt;
    this.sy = clamp(this.sy + this.syv * dt, 0.62, 1.38);
    const sx = 1 / Math.sqrt(this.sy);

    // ---- jiggle from acceleration (local frame) ----
    const ax = (v[0] - this.lastV[0]) / Math.max(dt, 1e-3), az = (v[2] - this.lastV[2]) / Math.max(dt, 1e-3);
    this.lastV[0] = v[0]; this.lastV[1] = v[1]; this.lastV[2] = v[2];
    const cy = Math.cos(this.yawS), sn = Math.sin(this.yawS);
    const lax = ax * cy - az * sn, laz = ax * sn + az * cy;  // world -> local (rotate by -yaw)
    const k = mode === MODE.RAG ? 0 : 0.0042;
    for (let i = 0; i < 2; i++) {
      const target = clamp(-(i === 0 ? lax : laz) * k, -0.22, 0.22);
      this.wobv[i] += (-(this.wob[i] - target) * 140 - this.wobv[i] * 9) * dt;
      this.wob[i] = clamp(this.wob[i] + this.wobv[i] * dt, -0.3, 0.3);
    }

    // ---- orientation ----
    const yawQ = qt.yaw(this.yawS);
    let target = yawQ;
    if (mode === MODE.DIVE || mode === MODE.SLIDE) target = qt.mul(yawQ, qt.axis(X, Math.PI / 2 - (mode === MODE.DIVE ? clamp(v[1] * 0.05, -0.3, 0.3) : 0)));
    else if (mode === MODE.NORMAL || mode === MODE.GRABBING) {
      const lean = clamp(sp * 0.022, 0, 0.17) + (mode === MODE.GRABBING ? -0.25 : 0);
      target = qt.mul(yawQ, qt.axis(X, lean));
    }
    if (mode === MODE.RAG) {
      // tumble: rolling with the motion plus some chaotic spin
      const wx = v[2] / 0.5, wz = -v[0] / 0.5;
      const w = [wx * 0.6 + this.spin[0], this.spin[1], wz * 0.6 + this.spin[2]];
      const wl = Math.hypot(w[0], w[1], w[2]);
      if (wl > 1e-3) this.rq = qt.norm(qt.mul(qt.axis([w[0] / wl, w[1] / wl, w[2] / wl], wl * dt), this.rq));
      if (grounded) for (let i = 0; i < 3; i++) this.spin[i] *= Math.exp(-3 * dt);
      // settle lying down when slow
      if (grounded && Math.hypot(v[0], v[1], v[2]) < 1.5) this.rq = qt.slerp(this.rq, qt.mul(yawQ, qt.axis(X, Math.PI / 2)), dt * 4);
      this.q = this.rq;
    } else this.q = qt.slerp(this.q, target, Math.min(1, dt * (mode === MODE.GETUP ? 9 : 16)));

    // ---- limbs ----
    const L = this.limbs, ease = (i, val, rate = 14) => { L[i] += (val - L[i]) * Math.min(1, dt * rate); };
    let aS = 0, aSp = 0.18, lS = 0;
    if (o.celebrate) {
      aS = 2.7 + Math.sin(t * 9 + this.seed) * 0.35; aSp = 0.5 + Math.sin(t * 7) * 0.3; lS = Math.sin(t * 9) * 0.3;
      ease(0, aS); ease(1, aSp); ease(2, 2.7 + Math.sin(t * 9 + 1.5) * 0.35); ease(3, aSp); ease(4, lS); ease(5, -lS);
    } else if (mode === MODE.RAG || s.held) {
      const f = t * 16 + this.seed;
      ease(0, Math.sin(f) * 1.6, 20); ease(1, 1.2 + Math.sin(f * 1.3) * 0.8, 20); ease(2, Math.cos(f * 1.1) * 1.6, 20); ease(3, 1.2 + Math.cos(f * 0.9) * 0.8, 20);
      ease(4, Math.sin(f * 1.2) * 0.9, 20); ease(5, Math.cos(f) * 0.9, 20);
    } else if (mode === MODE.DIVE || mode === MODE.SLIDE) {
      ease(0, 2.9); ease(1, 0.25); ease(2, 2.9); ease(3, 0.25); ease(4, -0.25); ease(5, -0.25);
    } else if (mode === MODE.LEDGE || mode === MODE.CLIMB || s.hang) {
      ease(0, 2.95, 20); ease(1, 0.2); ease(2, 2.95, 20); ease(3, 0.2); ease(4, Math.sin(t * 6) * 0.3); ease(5, -Math.sin(t * 6) * 0.3);
    } else if (mode === MODE.GRABBING) {
      ease(0, 1.55, 20); ease(1, 0.1); ease(2, 1.55, 20); ease(3, 0.1); ease(4, Math.sin(this.phase) * 0.5); ease(5, -Math.sin(this.phase) * 0.5);
    } else if (!grounded && mode === MODE.NORMAL) {
      if (v[1] > -6) { ease(0, -0.4); ease(1, 2.3); ease(2, -0.4); ease(3, 2.3); ease(4, 0.7); ease(5, 0.2); }
      else { const f = t * 18 + this.seed; ease(0, Math.sin(f) * 0.8, 18); ease(1, 2.0 + Math.sin(f * 1.3) * 0.5, 18); ease(2, Math.cos(f) * 0.8, 18); ease(3, 2.0 + Math.cos(f * 1.2) * 0.5, 18); ease(4, Math.sin(f) * 0.7, 18); ease(5, -Math.sin(f) * 0.7, 18); }
    } else {
      const run = clamp(sp / 5, 0, 1);
      this.phase += dt * (3 + sp * 1.9);
      const sw = Math.sin(this.phase);
      const wave = o.wave ? Math.max(0, Math.sin(t * 0.7 + this.seed)) : 0;
      ease(0, -sw * 1.0 * run + Math.sin(t * 1.7 + this.seed) * 0.06 * (1 - run)); ease(1, 0.18 + run * 0.12);
      ease(2, sw * 1.0 * run + Math.sin(t * 1.7 + this.seed + 2) * 0.06 * (1 - run) + wave * 2.6, 10); ease(3, 0.18 + run * 0.12 + wave * (0.6 + Math.sin(t * 12) * 0.35), 10);
      ease(4, sw * 0.85 * run); ease(5, -sw * 0.85 * run);
    }

    // scripted arm/leg poses (giant mascots cranking a rope, waving…)
    if (o.pose) for (let i = 0; i < 6; i++) L[i] += (o.pose[i] - L[i]) * Math.min(1, dt * 18);
    // ---- blink & expression ----
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0; if (this.blinkT < -0.12) { this.blink = 1; this.blinkT = 1.5 + Math.random() * 3.5; } }
    let expr = 0;
    if (mode === MODE.RAG || mode === MODE.GETUP) expr = 1;
    else if (o.celebrate) expr = 2;
    else if (!grounded && v[1] < -15) expr = 3;
    if (o.expr !== undefined) expr = o.expr;
    this.hitT = Math.max(0, this.hitT - dt);

    // ---- matrices ----
    const sc = this.scale; m4.trs(s.p, this.q, [sc, sc, sc], this.root);
    this.bones.set(this.root, 0);
    const wob = this.wob, sq = this.sy;
    const limb = (i, side, pivot, swing, spread, slot) => {
      const hgt = pivot[1] + 0.66;
      const px = side * pivot[0] * sx + wob[0] * hgt * hgt * 0.55, py = pivot[1] * sq, pz = pivot[2] * sx + wob[1] * hgt * hgt * 0.55;
      const lq = qt.mul(qt.axis(Z, side * spread), qt.axis(X, -swing));
      m4.trs([px, py, pz], lq, [1, 1, 1], tmpL);
      m4.mul(this.root, tmpL, tmpB);
      this.bones.set(tmpB, slot * 16);
    };
    const R = BEAN_RIG;
    limb(0, -1, R.shoulder, L[0], L[1], 1); limb(0, 1, R.shoulder, L[2], L[3], 2);
    limb(0, -1, R.hip, L[4], 0.05, 3); limb(0, 1, R.hip, L[5], 0.05, 4);
    const ht = R.top + 0.66;
    m4.trs([wob[0] * ht * ht * 0.55, R.top * sq - 0.02, wob[1] * ht * ht * 0.55], qt.axis(X, -wob[1] * 0.6), this.look.wrap ? [sx, sq, sx] : [1, 1, 1], tmpL); // wrap-round hats squash with the body
    m4.mul(this.root, tmpL, this.hatM);
    const P = this.params;
    P.sq[0] = sq; P.sq[1] = sx; P.wob[0] = wob[0]; P.wob[2] = wob[1]; P.expr = expr; P.blink = this.blink; P.hit = this.hitT > 0 ? 1 : 0;
    return this;
  }
}


export { BeanVis };
