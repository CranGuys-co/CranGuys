// CranGuys — jelly-bean character controller. Pure & deterministic: the server runs it authoritatively,
// clients run the exact same code for prediction/reconciliation, bots feed it the same inputs as humans.
import { windOn, slimeAt } from './world.js';
import { PHYS as P, MODE as M, SURF, BTN, DT, SUBSTEPS } from './config.js';
import { clamp, angTowards } from './math.js';
import { contactSeg, makeHit } from './collide.js';
function newChar(p, yaw = 0) {
  return {
    p: [p[0], p[1], p[2]], v: [0, 0, 0], yaw, mode: M.NORMAL, mt: 0, rt: 0, gr: 0, co: 0, jb: 0, db: 0, cd: 1, pb: 0,
    cp: 0, rc: 0, lx: 0, ly: 0, lz: 0, ln: 0, lc: 0, held: 0, gt: 0, gc: 0, gn: [0, 1, 0], gv: [0, 0, 0], gs: 0, air: 0, kt: 0,
  };
}

// ---- compact serialisation (authoritative own-state in snapshots, reconciliation) ----
const SCALARS = ['yaw', 'mode', 'mt', 'rt', 'gr', 'co', 'jb', 'db', 'cd', 'pb', 'cp', 'rc', 'lx', 'ly', 'lz', 'ln', 'lc', 'held', 'gt', 'gc', 'gs', 'air', 'kt'];
const NFIELDS = 12 + SCALARS.length;
function packChar(s, f, o) {
  f[o] = s.p[0]; f[o + 1] = s.p[1]; f[o + 2] = s.p[2]; f[o + 3] = s.v[0]; f[o + 4] = s.v[1]; f[o + 5] = s.v[2];
  f[o + 6] = s.gn[0]; f[o + 7] = s.gn[1]; f[o + 8] = s.gn[2]; f[o + 9] = s.gv[0]; f[o + 10] = s.gv[1]; f[o + 11] = s.gv[2];
  for (let i = 0; i < SCALARS.length; i++) f[o + 12 + i] = s[SCALARS[i]];
}
function unpackChar(f, o, s) {
  s.p[0] = f[o]; s.p[1] = f[o + 1]; s.p[2] = f[o + 2]; s.v[0] = f[o + 3]; s.v[1] = f[o + 4]; s.v[2] = f[o + 5];
  s.gn[0] = f[o + 6]; s.gn[1] = f[o + 7]; s.gn[2] = f[o + 8]; s.gv[0] = f[o + 9]; s.gv[1] = f[o + 10]; s.gv[2] = f[o + 11];
  for (let i = 0; i < SCALARS.length; i++) s[SCALARS[i]] = f[o + 12 + i];
  return s;
}
function copyChar(d, s) {
  d.p[0] = s.p[0]; d.p[1] = s.p[1]; d.p[2] = s.p[2]; d.v[0] = s.v[0]; d.v[1] = s.v[1]; d.v[2] = s.v[2];
  d.gn[0] = s.gn[0]; d.gn[1] = s.gn[1]; d.gn[2] = s.gn[2]; d.gv[0] = s.gv[0]; d.gv[1] = s.gv[1]; d.gv[2] = s.gv[2];
  for (let i = 0; i < SCALARS.length; i++) d[SCALARS[i]] = s[SCALARS[i]];
  return d;
}

const isBall = (mode) => mode === M.DIVE || mode === M.SLIDE || mode === M.RAG;
function charShape(s, a, b) {
  const ball = isBall(s.mode), hh = ball ? 0 : P.HH;
  a[0] = s.p[0]; a[1] = s.p[1] - hh; a[2] = s.p[2]; b[0] = s.p[0]; b[1] = s.p[1] + hh; b[2] = s.p[2];
  return ball ? P.RS : P.R;
}

const ev = (ctx, name, val) => { if (ctx && ctx.ev) ctx.ev.push(name, val || 0); };
const ZERO = [0, 0, 0];
const H = makeHit(), H2 = makeHit(), SV = [0, 0, 0], A = [0, 0, 0], B = [0, 0, 0], WN = [0, 0, 0], WC = [0, 0, 0];

function toRag(s) { s.mode = M.RAG; s.mt = 0; s.rt = 0; s.gr = 0; s.gt = 0; s.co = 0; }
function standUp(s) { s.p[1] += P.STAND - P.RS; }

// ---------- per-tick entry points ----------
function charBegin(s, inp, I) {
  const b = inp.b | 0, pressed = b & ~s.pb; s.pb = b;
  let mx = inp.mx || 0, mz = inp.mz || 0; const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  I.mx = mx; I.mz = mz; I.grab = (b & BTN.GRAB) !== 0; I.wish = mx * mx + mz * mz > 0.0025; I.b = b;
  if (pressed & BTN.JUMP) s.jb = P.JBUF;
  if (pressed & BTN.DIVE) s.db = P.DBUF;
  if (s.mode === M.GRABBING && (!I.grab || s.mt > P.GRAB_MAX)) { s.mode = M.NORMAL; s.mt = 0; s.gt = 0; s.gc = P.GRAB_CD; }
}

function charSub(s, I, W, tick, ctx) {
  const dt = DT / SUBSTEPS;
  s.mt += dt;
  if (s.jb > 0) s.jb -= dt; if (s.db > 0) s.db -= dt; if (s.lc > 0) s.lc -= dt; if (s.gc > 0) s.gc -= dt; if (s.kt > 0) s.kt -= dt;
  const mode = s.mode;
  if (mode === M.OUT) return;
  if (mode === M.RESPAWN) { if (s.mt >= P.RESPAWN_T) respawn(s, ctx); return; }
  if (mode === M.LEDGE) { ledgeStep(s, I, ctx); return; }
  if (mode === M.CLIMB) { climbStep(s); return; }

  const v = s.v, g = s.gr ? s.gv : ZERO, n = s.gn;
  let rx = v[0] - g[0], ry = v[1] - g[1], rz = v[2] - g[2];
  const ice = s.gr && s.gs === SURF.ICE;
  if (s.gr) s.air = 0; else s.air += dt;

  if (mode === M.NORMAL || mode === M.GRABBING || mode === M.GETUP) {
    if (s.gr) { s.co = P.COYOTE; s.cd = 1; } else s.co -= dt;
    const control = mode !== M.GETUP;
    let max = P.RUN; if (s.held) max *= P.HELD_SLOW; if (mode === M.GRABBING) max *= P.GRAB_SLOW;
    const wishing = control && I.wish;
    if (s.gr && wishing) { // running uphill is slower
      const h = Math.hypot(n[0], n[2]);
      if (h > 0.05) { const up = -(I.mx * n[0] + I.mz * n[2]) / h; if (up > 0) max *= 1 - 1.1 * h * up; }
    }
    const tx = wishing ? I.mx * max : 0, tz = wishing ? I.mz * max : 0;
    let rate;
    if (s.gr) rate = wishing ? (ice ? P.ICE_ACC : P.ACC) : (ice ? P.ICE_DEC : (ctx && ctx.rules && ctx.rules.brake) || P.DEC); // some maps make stopping harder
    else { rate = wishing ? P.AIR_ACC : P.AIR_DEC; if (wishing && Math.hypot(rx, rz) > max + 0.5) rate *= 0.45; }
    const dx = tx - rx, dz = tz - rz, dl = Math.hypot(dx, dz), st = rate * dt;
    if (dl <= st) { rx = tx; rz = tz; } else { rx += (dx / dl) * st; rz += (dz / dl) * st; }
    if (wishing) s.yaw = angTowards(s.yaw, Math.atan2(I.mx, I.mz), P.TURN * dt * (s.gr ? 1 : 0.75));
    if (s.gr) {
      const k = ice ? 1 : n[1] < 0.8 ? 0.7 : 0;
      if (k) { const a = P.G * n[1] * k * dt; rx += n[0] * a; rz += n[2] * a; }
      ry = -(n[0] * rx + n[2] * rz) / Math.max(0.35, n[1]) - 0.8;
    } else ry -= P.G * dt;
    if (mode === M.GETUP) { if (s.mt >= P.GETUP) { s.mode = M.NORMAL; s.mt = 0; } }
    else if (s.jb > 0 && (s.gr || s.co > 0) && mode !== M.GRABBING) {
      ry = P.JUMP; s.gr = 0; s.co = 0; s.jb = 0; ev(ctx, 'jump');
    } else if (s.db > 0 && s.cd && mode === M.NORMAL) {
      let fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      if (I.wish) { const l = Math.hypot(I.mx, I.mz); fx = I.mx / l; fz = I.mz / l; s.yaw = Math.atan2(fx, fz); }
      const hs = clamp(Math.max(P.DIVE_H, Math.hypot(rx, rz) + 1.2), 0, P.DIVE_MAX);
      rx = fx * hs; rz = fz * hs;
      ry = s.gr ? P.DIVE_GV : Math.max(ry + 1.5, P.DIVE_V);
      s.mode = M.DIVE; s.mt = 0; s.cd = 0; s.db = 0; s.gr = 0; s.co = 0; ev(ctx, 'dive');
    }
  } else if (mode === M.DIVE) {
    ry -= P.G * dt;
    if (s.mt > 3) { toRag(s); s.mt = P.RAG_MIN; }
    if (I.wish) {
      const sp = Math.hypot(rx, rz);
      if (sp > 0.5) { const a = angTowards(Math.atan2(rx, rz), Math.atan2(I.mx, I.mz), 1.2 * dt); rx = Math.sin(a) * sp; rz = Math.cos(a) * sp; s.yaw = a; }
    }
  } else if (mode === M.SLIDE) {
    if (s.gr) {
      const sp = Math.hypot(rx, rz), ns = Math.max(0, sp - (ice ? 1.0 : P.SLIDE_DEC) * dt);
      if (sp > 1e-6) { rx *= ns / sp; rz *= ns / sp; }
      const a = P.G * n[1] * (ice ? 1 : 0.6) * dt; rx += n[0] * a; rz += n[2] * a;
      ry = -(n[0] * rx + n[2] * rz) / Math.max(0.35, n[1]) - 0.8;
      if (s.jb > 0 && s.mt > 0.1) { standUp(s); s.mode = M.NORMAL; s.mt = 0; s.jb = 0; ry = P.RECOVER_HOP; s.gr = 0; s.co = 0; ev(ctx, 'hop'); }
      else if (s.mt > P.SLIDE_MIN && ns < 3.2) { standUp(s); s.mode = M.GETUP; s.mt = 0; ry = 0; }
    } else { ry -= P.G * dt; if (s.air > 0.25) s.mode = M.DIVE; }
  } else if (mode === M.RAG) {
    if (s.gr) {
      const f = Math.exp(-(ice ? 0.5 : 3.2) * dt); rx *= f; rz *= f;
      const a = P.G * n[1] * 0.7 * dt; rx += n[0] * a; rz += n[2] * a;
      if (Math.hypot(rx, ry, rz) < 2.4) s.rt += dt; else s.rt = 0;
    } else s.rt = 0;
    ry -= P.G * dt;
    if ((s.rt > P.RAG_REST && s.mt > P.RAG_MIN) || (s.mt > P.RAG_MAX && s.gr) || s.mt > P.RAG_MAX * 2) { standUp(s); s.mode = M.GETUP; s.mt = 0; ry = 0; ev(ctx, 'getup'); }
  }

  v[0] = rx + g[0]; v[1] = ry + g[1]; v[2] = rz + g[2];
  if (v[1] < -P.TERM) v[1] = -P.TERM;
  const stick = s.gr;
  s.p[0] += v[0] * dt; s.p[1] += v[1] * dt; s.p[2] += v[2] * dt;
  collide(s, I, W, tick, ctx, stick);
}

function charEnd(s, W, tick, ctx) {
  if (s.mode === M.OUT || s.mode === M.RESPAWN) return;
  const R = ctx.rules;
  const cps = R.checkpoints;
  if (cps) for (let i = s.cp + 1; i < cps.length; i++) {
    const b = cps[i].box, p = s.p;
    if (p[0] >= b[0] && p[0] <= b[3] && p[1] >= b[1] && p[1] <= b[4] && p[2] >= b[2] && p[2] <= b[5]) { s.cp = i; ev(ctx, 'cp', i); }
  }
  if (s.p[1] < (R.rise ? slimeAt(R.rise, tick * DT) - 0.15 : R.killY)) {
    s.v[0] = s.v[1] = s.v[2] = 0; s.mt = 0; s.gr = 0; s.gt = 0;
    s.mode = R.respawn ? M.RESPAWN : M.OUT; ev(ctx, 'fall');
    return;
  }
  if (s.mode !== M.LEDGE && s.mode !== M.CLIMB && W.hasWind) {
    const r = charShape(s, A, B);
    const t = tick * DT; // fans blow beans sideways (a drift you can walk against)
    W.trigAt('wind', A, B, r, tick, (c) => { if (!windOn(c, t) || (c.air && s.gr)) return; /* air-only crosswinds only push jumpers */ s.p[0] += c.wind[0] * DT; s.p[1] += c.wind[1] * DT; s.p[2] += c.wind[2] * DT; });
  }
  if (s.kt <= 0 && s.mode !== M.LEDGE && s.mode !== M.CLIMB) {
    const r = charShape(s, A, B);
    W.trigAt('laser', A, B, r, tick, (c, h) => {
      if (s.kt > 0) return;
      W.surfVel(c, h.cp, SV);
      let dx = SV[0], dz = SV[2]; const l = Math.hypot(dx, dz);
      if (l < 0.1) { dx = h.n[0]; dz = h.n[2]; } else { dx /= l; dz /= l; }
      const k = c.knock || 9;
      s.v[0] = dx * k; s.v[2] = dz * k; s.v[1] = 4.5;
      toRag(s); s.kt = 0.35; ev(ctx, 'zap');
    });
  }
}

const _I = { mx: 0, mz: 0, grab: false, wish: false, b: 0 };
// single-body helper (client prediction, tests)
function stepChar(s, inp, W, tick, ctx) {
  if (ctx) ctx.tick = tick;
  charBegin(s, inp, _I);
  const dts = DT / SUBSTEPS;
  for (let k = 0; k < SUBSTEPS; k++) { W.setTime((tick * SUBSTEPS + k + 1) * dts); charSub(s, _I, W, tick, ctx); }
  charEnd(s, W, tick, ctx);
}

// ---------- collision response ----------
function collide(s, I, W, tick, ctx, stick) {
  const ball = isBall(s.mode), r = ball ? P.RS : P.R, hh = ball ? 0 : P.HH;
  const p = s.p, v = s.v, preVy = v[1] - (stick ? s.gv[1] : 0);
  let grounded = false, bny = 0.62, gs = 0, gc = null, wall = null, knocked = false;
  const rest = s.mode === M.RAG ? 0.32 : 0;
  const setSeg = () => { A[0] = p[0]; A[1] = p[1] - hh; A[2] = p[2]; B[0] = p[0]; B[1] = p[1] + hh; B[2] = p[2]; };
  for (let it = 0; it < 3; it++) {
    let any = false;
    setSeg();
    W.near(p[0], p[1], p[2], hh + r + 0.05, tick, (c) => {
      if (c.ghost || !contactSeg(c, A, B, r, H)) return;
      any = true;
      const nx = H.n[0], ny = H.n[1], nz = H.n[2];
      p[0] += nx * H.d; p[1] += ny * H.d; p[2] += nz * H.d; setSeg();
      W.surfVel(c, H.cp, SV);
      const vn = (v[0] - SV[0]) * nx + (v[1] - SV[1]) * ny + (v[2] - SV[2]) * nz;
      if (c.knock && s.kt <= 0) {
        const push = SV[0] * nx + SV[1] * ny + SV[2] * nz;
        if (push > 0.8 || c.knockAny) {
          const hl = Math.hypot(nx, nz) || 1;
          const ks = c.knockSV ?? 0.85;
          v[0] = (nx / hl) * c.knock * 0.55 + SV[0] * ks; v[2] = (nz / hl) * c.knock * 0.55 + SV[2] * ks;
          v[1] = 3 + c.knock * 0.4 + Math.max(0, SV[1]);
          toRag(s); s.kt = 0.3; knocked = true; ev(ctx, 'rag'); return;
        }
      }
      if (c.surf === SURF.BUMPER && Math.abs(ny) < 0.75) {
        const hl = Math.hypot(nx, nz) || 1, k = c.bump || 11;
        v[0] = (nx / hl) * k; v[2] = (nz / hl) * k; v[1] = Math.max(v[1], 3.5); ev(ctx, 'bump'); return;
      }
      if (vn < 0) { const k = rest && vn < -2.5 ? 1 + rest : 1; v[0] -= nx * vn * k; v[1] -= ny * vn * k; v[2] -= nz * vn * k; }
      if (ny > bny) {
        bny = ny; grounded = true; gs = c.surf; gc = c;
        s.gn[0] = nx; s.gn[1] = ny; s.gn[2] = nz; s.gv[0] = SV[0]; s.gv[1] = SV[1]; s.gv[2] = SV[2];
      } else if (Math.abs(ny) < 0.35 && !c.kin && c.dyn < 0 && c.shape === 'box') {
        wall = c; WN[0] = nx; WN[1] = ny; WN[2] = nz; WC[0] = H.cp[0]; WC[1] = H.cp[1]; WC[2] = H.cp[2];
      }
      if (ctx && ctx.onContact) ctx.onContact(c, s, H.n, -vn, tick);
    });
    // dynamic boulders
    const balls = W.balls;
    for (let i = 0; i < balls.length; i++) {
      const bl = balls[i]; setSeg();
      const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L2 = dx * dx + dy * dy + dz * dz;
      const t = L2 < 1e-9 ? 0 : clamp(((bl.p[0] - A[0]) * dx + (bl.p[1] - A[1]) * dy + (bl.p[2] - A[2]) * dz) / L2, 0, 1);
      const ex = A[0] + dx * t - bl.p[0], ey = A[1] + dy * t - bl.p[1], ez = A[2] + dz * t - bl.p[2], d = Math.hypot(ex, ey, ez), rr = bl.r + r;
      if (d >= rr || d < 1e-6) continue;
      any = true;
      const nx = ex / d, ny = ey / d, nz = ez / d;
      p[0] += nx * (rr - d); p[1] += ny * (rr - d); p[2] += nz * (rr - d);
      const rel = (bl.v[0] - v[0]) * nx + (bl.v[1] - v[1]) * ny + (bl.v[2] - v[2]) * nz;
      if (rel > 2.5 && s.kt <= 0) {
        const hl = Math.hypot(nx, nz) || 1;
        v[0] = (nx / hl) * 7 + bl.v[0] * 0.8; v[2] = (nz / hl) * 7 + bl.v[2] * 0.8; v[1] = 6.5;
        toRag(s); s.kt = 0.35; knocked = true; ev(ctx, 'rag');
      } else { const vn = (v[0] - bl.v[0]) * nx + (v[1] - bl.v[1]) * ny + (v[2] - bl.v[2]) * nz; if (vn < 0) { v[0] -= nx * vn; v[1] -= ny * vn; v[2] -= nz * vn; } }
    }
    if (!any || knocked) break;
  }
  if (knocked) { s.gr = 0; s.gs = 0; return; }
  // ground snap: stay glued over small steps/slope changes while walking or sliding
  if (!grounded && stick && s.mode !== M.RAG && s.mode !== M.DIVE && v[1] - s.gv[1] < 0.6) {
    const drop = 0.24; A[1] -= drop; B[1] -= drop;
    let best = 0.62, bd = 0, bc = null;
    W.near(p[0], p[1] - drop, p[2], hh + r + 0.05, tick, (c) => {
      if (c.ghost || !contactSeg(c, A, B, r, H2)) return;
      if (H2.n[1] > best) { best = H2.n[1]; bd = H2.d; bc = c; s.gn[0] = H2.n[0]; s.gn[1] = H2.n[1]; s.gn[2] = H2.n[2]; W.surfVel(c, H2.cp, s.gv); }
    });
    if (bc) { p[1] -= Math.max(0, drop - bd); grounded = true; gs = bc.surf; gc = bc; if (v[1] - s.gv[1] < 0) v[1] = s.gv[1]; }
  }
  const was = s.gr;
  s.gr = grounded ? 1 : 0;
  if (grounded) {
    s.gs = gs;
    if (!was) ev(ctx, 'land', -preVy);
    if (gs === SURF.BOUNCY) bounce(s, gc, ctx);
    else {
      if (ctx && ctx.onGround) ctx.onGround(gc, s, tick);
      if (s.mode === M.DIVE) { s.mode = M.SLIDE; s.mt = 0; ev(ctx, 'belly'); }
    }
  } else { s.gs = 0; s.gv[0] = s.gv[1] = s.gv[2] = 0; }
  if (!grounded && wall && I.grab && s.lc <= 0 && s.mode === M.NORMAL && v[1] < 3) tryLedge(s, wall, W, tick, ctx);
}

function bounce(s, c, ctx) {
  const v = s.v, L = c.launch;
  if (L) { v[0] = v[0] * 0.35 + L[0]; v[1] = L[1]; v[2] = v[2] * 0.35 + L[2]; }
  else v[1] = c.bounce || P.BOUNCE;
  s.gr = 0; s.co = 0; s.cd = 1; s.air = 0; s.gv[0] = s.gv[1] = s.gv[2] = 0;
  // a bounce pad always pops you back upright: diving onto one used to keep you bouncing in a dive with no
  // control (stuck forever if you hit the wall above the pad and fell back onto it)
  if (s.mode === M.DIVE || s.mode === M.SLIDE || (s.mode === M.RAG && s.mt > P.RAG_MIN)) { standUp(s); s.mode = M.NORMAL; s.mt = 0; }
  else if (s.mode === M.GETUP) s.mode = M.NORMAL;
  if (ctx && ctx.onGround) ctx.onGround(c, s);
  ev(ctx, 'bounce');
}

function tryLedge(s, c, W, tick, ctx) {
  if (c.wm[4] < 0.97 || c.noLedge) return;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const hl = Math.hypot(WN[0], WN[2]) || 1, nx = WN[0] / hl, nz = WN[2] / hl;
  if (nx * fx + nz * fz > -0.55) return;
  const top = c.aabb[4], rel = top - s.p[1];
  if (rel < -0.05 || rel > 0.95) return;
  const dx = WC[0] - nx * 0.62, dz = WC[2] - nz * 0.62, dy = top + P.STAND + 0.05;
  A[0] = dx; A[1] = dy - P.HH; A[2] = dz; B[0] = dx; B[1] = dy + P.HH; B[2] = dz;
  if (W.overlaps(A, B, P.R - 0.05, tick)) return;
  const gb = W.groundBelow(dx, dy, dz, P.STAND + 0.4, tick);
  if (!gb || Math.abs(gb.y - top) > 0.2) return;
  s.mode = M.LEDGE; s.mt = 0; s.gr = 0;
  s.lx = WC[0] + nx * (P.R + 0.03); s.lz = WC[2] + nz * (P.R + 0.03); s.ly = top - 0.6;
  s.ln = Math.atan2(-nx, -nz); s.yaw = s.ln;
  s.p[0] = s.lx; s.p[1] = s.ly; s.p[2] = s.lz; s.v[0] = s.v[1] = s.v[2] = 0;
  ev(ctx, 'ledge');
}

function ledgeStep(s, I, ctx) {
  s.v[0] = s.v[1] = s.v[2] = 0; s.p[0] = s.lx; s.p[1] = s.ly; s.p[2] = s.lz; s.gr = 0;
  const fx = Math.sin(s.ln), fz = Math.cos(s.ln), fwd = I.mx * fx + I.mz * fz;
  if (s.jb > 0 || (fwd > 0.5 && s.mt > 0.15)) { s.mode = M.CLIMB; s.mt = 0; s.jb = 0; ev(ctx, 'climb'); }
  else if ((!I.grab && s.mt > 0.1) || fwd < -0.6 || s.mt > 8) { s.mode = M.NORMAL; s.mt = 0; s.lc = 0.45; s.v[0] = -fx * 1.5; s.v[2] = -fz * 1.5; }
}

function climbStep(s) {
  const u = Math.min(1, s.mt / P.CLIMB_T), e = u * u * (3 - 2 * u);
  const fx = Math.sin(s.ln), fz = Math.cos(s.ln), top = s.ly + 0.6;
  const up = Math.min(1, e * 1.6), fw = Math.max(0, (e - 0.35) / 0.65);
  s.p[0] = s.lx + fx * 0.82 * fw; s.p[2] = s.lz + fz * 0.82 * fw; s.p[1] = s.ly + (top + P.STAND + 0.03 - s.ly) * up;
  s.v[0] = s.v[1] = s.v[2] = 0;
  if (u >= 1) { s.mode = M.NORMAL; s.mt = 0; s.gr = 0; s.v[0] = fx * 2; s.v[2] = fz * 2; }
}

function respawn(s, ctx) {
  const R = ctx.rules, cps = R.checkpoints;
  // rising slime: if the slime has swallowed your checkpoint, it carries you up to the first dry one
  if (R.rise) { const y = slimeAt(R.rise, (ctx.tick | 0) * DT); while (s.cp < cps.length - 1 && cps[s.cp].spawn[1] < y + 0.6) s.cp++; }
  const cp = cps[Math.min(s.cp, cps.length - 1)];
  const i = (((ctx.slot | 0) * 13 + s.rc * 7) % 25 + 25) % 25, gx = (i % 5) - 2, gz = Math.floor(i / 5) - 2;
  s.p[0] = cp.spawn[0] + (gx * cp.spread[0]) / 4; s.p[1] = cp.spawn[1] + P.STAND + 0.05; s.p[2] = cp.spawn[2] + (gz * cp.spread[1]) / 4;
  s.v[0] = s.v[1] = s.v[2] = 0; s.yaw = cp.yaw || 0; s.mode = M.NORMAL; s.mt = 0; s.gr = 0; s.rc++;
  s.held = 0; s.gt = 0; s.jb = 0; s.db = 0; s.cd = 1; s.kt = 0.5;
  ev(ctx, 'respawn');
}


export { newChar, NFIELDS, packChar, unpackChar, copyChar, isBall, charShape, toRag, charBegin, charSub, charEnd, stepChar };
