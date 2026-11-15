// CranGuys — collision primitives. Colliders are plain objects so levels stay data-driven.
//   shape 'box' (h:[hx,hy,hz]) | 'cyl' (r, hh — local Y axis) | 'sph' (r) | 'cap' (r, hl — local X axis)
//   p:[x,y,z], q:[x,y,z,w] base pose. kin: optional kinematic motion evaluated as a pure function of time,
//   so server, client prediction and bots all agree on where every moving obstacle is at any tick.
import { clamp, quatToMat, axisMat, matMul, mv, mtv } from './math.js';
const EPS = 1e-9;

function prepCollider(c, id) {
  c.id = id;
  c.q = c.q || [0, 0, 0, 1];
  c.m0 = quatToMat(c.q);
  c.wp = c.p.slice();
  c.wm = c.m0.slice();
  c.surf = c.surf || 0;
  if (c.dyn === undefined) c.dyn = -1;
  if (c.kin && c.kin.axis) { const a = c.kin.axis, l = Math.hypot(a[0], a[1], a[2]) || 1; c.kin.axis = [a[0] / l, a[1] / l, a[2] / l]; }
  c.br = c.shape === 'box' ? Math.hypot(c.h[0], c.h[1], c.h[2]) : c.shape === 'cyl' ? Math.hypot(c.r, c.hh) : c.shape === 'sph' ? c.r : c.hl + c.r;
  c.aabb = worldAABB(c);
  return c;
}

function worldAABB(c) {
  const m = c.wm, p = c.wp; let ex, ey, ez;
  if (c.shape === 'box') {
    const [hx, hy, hz] = c.h;
    ex = Math.abs(m[0]) * hx + Math.abs(m[1]) * hy + Math.abs(m[2]) * hz;
    ey = Math.abs(m[3]) * hx + Math.abs(m[4]) * hy + Math.abs(m[5]) * hz;
    ez = Math.abs(m[6]) * hx + Math.abs(m[7]) * hy + Math.abs(m[8]) * hz;
  } else if (c.shape === 'cyl') {
    ex = Math.abs(m[1]) * c.hh + c.r; ey = Math.abs(m[4]) * c.hh + c.r * Math.hypot(m[3], m[5]); ez = Math.abs(m[7]) * c.hh + c.r;
  } else if (c.shape === 'sph') { ex = ey = ez = c.r; }
  else { ex = Math.abs(m[0]) * c.hl + c.r; ey = Math.abs(m[3]) * c.hl + c.r; ez = Math.abs(m[6]) * c.hl + c.r; }
  return [p[0] - ex, p[1] - ey, p[2] - ez, p[0] + ex, p[1] + ey, p[2] + ez];
}

const _R = new Array(9), _d = [0, 0, 0];
const PARK = -5000;
// Evaluate a collider's world pose at time t into P (vec3) and M (3x3).
function poseAt(c, t, P, M) {
  const k = c.kin;
  if (!k) { P[0] = c.p[0]; P[1] = c.p[1]; P[2] = c.p[2]; for (let i = 0; i < 9; i++) M[i] = c.m0[i]; return; }
  if ((k.start !== undefined && t < k.start) || (k.end !== undefined && t > k.end)) { // inactive hazard: parked far away
    P[0] = c.p[0]; P[1] = PARK; P[2] = c.p[2]; for (let i = 0; i < 9; i++) M[i] = c.m0[i]; return;
  }
  let ang = 0;
  switch (k.type) {
    case 'spin': ang = (k.ph || 0) + k.w * t; break;
    case 'spinAcc': ang = kinAngle(k, t); break;
    case 'pend': ang = (k.base || 0) + k.amp * Math.sin(k.w * t + (k.ph || 0)); break;
    case 'fnA': ang = k.fa(t); break;                 // level-scripted angle about k.axis through k.c (jump rope)
    case 'osc': {
      const s = Math.sin(k.w * t + (k.ph || 0));
      P[0] = c.p[0] + k.d[0] * s; P[1] = c.p[1] + k.d[1] * s; P[2] = c.p[2] + k.d[2] * s;
      for (let i = 0; i < 9; i++) M[i] = c.m0[i]; return;
    }
    case 'fn': { // level-scripted motion: k.fn(t) -> [dx, dy, dz] offset from the base pose, or null = out of play
      const o = k.fn(t);
      if (!o) { P[0] = c.p[0]; P[1] = PARK; P[2] = c.p[2]; for (let i = 0; i < 9; i++) M[i] = c.m0[i]; return; }
      P[0] = c.p[0] + o[0]; P[1] = c.p[1] + o[1]; P[2] = c.p[2] + o[2]; for (let i = 0; i < 9; i++) M[i] = c.m0[i]; return;
    }
    case 'sweep': { // moves along d over `move` seconds every `period` seconds, parked otherwise
      const tt = t - (k.t0 || 0); const ph = ((tt % k.period) + k.period) % k.period;
      if (tt < 0 || ph > k.move) { P[0] = c.p[0]; P[1] = PARK; P[2] = c.p[2]; for (let i = 0; i < 9; i++) M[i] = c.m0[i]; return; }
      const u = ph / k.move, flip = k.alt && (Math.floor(tt / k.period) & 1) ? -1 : 1;
      const s = flip > 0 ? u : 1 - u;
      P[0] = c.p[0] + k.d[0] * s; P[1] = c.p[1] + k.d[1] * s; P[2] = c.p[2] + k.d[2] * s;
      for (let i = 0; i < 9; i++) M[i] = c.m0[i]; return;
    }
    default: ang = 0;
  }
  axisMat(k.axis, ang, _R);
  const C = k.c;
  _d[0] = c.p[0] - C[0]; _d[1] = c.p[1] - C[1]; _d[2] = c.p[2] - C[2];
  mv(_R, _d, P); P[0] += C[0]; P[1] += C[1]; P[2] += C[2];
  matMul(_R, c.m0, M);
}

// Angle / angular speed of a spinning kinematic at time t. 'spinAcc' starts at t0 with speed w and speeds up
// by acc rad/s^2 until |w| reaches wmax (used by Jump Ring's accelerating bars).
function kinAngle(k, t) {
  if (k.type === 'spin') return (k.ph || 0) + k.w * t;
  if (k.type === 'spinAcc') {
    const dt = Math.max(0, t - (k.t0 || 0)), sg = Math.sign(k.w) || 1, w0 = Math.abs(k.w), acc = Math.abs(k.acc || 0), wm = k.wmax || 99;
    const tc = acc > 0 ? Math.max(0, (wm - w0) / acc) : 1e9;
    const a = dt <= tc ? w0 * dt + 0.5 * acc * dt * dt : w0 * tc + 0.5 * acc * tc * tc + wm * (dt - tc);
    return (k.ph || 0) + sg * a;
  }
  return 0;
}
function kinW(k, t) {
  if (k.type === 'spin') return k.w;
  if (k.type === 'spinAcc') { const dt = Math.max(0, t - (k.t0 || 0)); if (t < (k.t0 || 0)) return 0; return (Math.sign(k.w) || 1) * Math.min(k.wmax || 99, Math.abs(k.w) + Math.abs(k.acc || 0) * dt); }
  return 0;
}

// ---------------- narrow phase: swept-sphere segment vs collider ----------------
function makeHit() { return { n: [0, 1, 0], cp: [0, 0, 0], d: 0, ln: [0, 0, 0], lp: [0, 0, 0] }; }
const _la = [0, 0, 0], _lb = [0, 0, 0], _t = [0, 0, 0];

// a,b = capsule segment endpoints (world), r = radius. Fills out.n (world normal, collider -> body),
// out.d (penetration depth), out.cp (closest point on collider surface, world). Returns true on overlap.
function contactSeg(c, a, b, r, out) {
  const P = c.wp, M = c.wm;
  _t[0] = a[0] - P[0]; _t[1] = a[1] - P[1]; _t[2] = a[2] - P[2]; mtv(M, _t, _la);
  _t[0] = b[0] - P[0]; _t[1] = b[1] - P[1]; _t[2] = b[2] - P[2]; mtv(M, _t, _lb);
  let hit;
  switch (c.shape) {
    case 'box': hit = segBox(_la, _lb, c.h, r, out); break;
    case 'cyl': hit = segCyl(_la, _lb, c.r, c.hh, r, out); break;
    case 'sph': hit = segSph(_la, _lb, c.r, r, out); break;
    case 'cap': hit = segCap(_la, _lb, c.hl, c.r, r, out); break;
    default: hit = false;
  }
  if (!hit) return false;
  mv(M, out.ln, out.n); mv(M, out.lp, out.cp);
  out.cp[0] += P[0]; out.cp[1] += P[1]; out.cp[2] += P[2];
  return true;
}

function finish(out, px, py, pz, cx, cy, cz, r) {
  const ex = px - cx, ey = py - cy, ez = pz - cz, d2 = ex * ex + ey * ey + ez * ez;
  if (d2 >= r * r) return false;
  const d = Math.sqrt(d2);
  out.ln[0] = ex / d; out.ln[1] = ey / d; out.ln[2] = ez / d; out.d = r - d;
  out.lp[0] = cx; out.lp[1] = cy; out.lp[2] = cz; return true;
}

function segBox(a, b, h, r, out) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = dx * dx + dy * dy + dz * dz;
  // quick reject on expanded box
  const mnx = Math.min(a[0], b[0]), mxx = Math.max(a[0], b[0]), mny = Math.min(a[1], b[1]), mxy = Math.max(a[1], b[1]), mnz = Math.min(a[2], b[2]), mxz = Math.max(a[2], b[2]);
  if (mnx > h[0] + r || mxx < -h[0] - r || mny > h[1] + r || mxy < -h[1] - r || mnz > h[2] + r || mxz < -h[2] - r) return false;
  let t = 0.5, px, py, pz, cx, cy, cz;
  for (let i = 0; i < 5; i++) {
    px = a[0] + dx * t; py = a[1] + dy * t; pz = a[2] + dz * t;
    cx = clamp(px, -h[0], h[0]); cy = clamp(py, -h[1], h[1]); cz = clamp(pz, -h[2], h[2]);
    if (L2 < EPS) break;
    const nt = clamp(((cx - a[0]) * dx + (cy - a[1]) * dy + (cz - a[2]) * dz) / L2, 0, 1);
    if (Math.abs(nt - t) < 1e-5) { t = nt; break; }
    t = nt;
  }
  px = a[0] + dx * t; py = a[1] + dy * t; pz = a[2] + dz * t;
  cx = clamp(px, -h[0], h[0]); cy = clamp(py, -h[1], h[1]); cz = clamp(pz, -h[2], h[2]);
  if (px !== cx || py !== cy || pz !== cz) return finish(out, px, py, pz, cx, cy, cz, r);
  // segment point inside the box: push out along the axis of least penetration
  const ox = h[0] - Math.abs(px), oy = h[1] - Math.abs(py), oz = h[2] - Math.abs(pz);
  out.ln[0] = out.ln[1] = out.ln[2] = 0; out.lp[0] = px; out.lp[1] = py; out.lp[2] = pz;
  if (oy <= ox && oy <= oz) { const s = py < 0 ? -1 : 1; out.ln[1] = s; out.d = r + oy; out.lp[1] = s * h[1]; }
  else if (ox <= oz) { const s = px < 0 ? -1 : 1; out.ln[0] = s; out.d = r + ox; out.lp[0] = s * h[0]; }
  else { const s = pz < 0 ? -1 : 1; out.ln[2] = s; out.d = r + oz; out.lp[2] = s * h[2]; }
  return true;
}

function clampCyl(px, py, pz, R, hh, o) {
  const d = Math.hypot(px, pz);
  if (d > R) { o[0] = px * R / d; o[2] = pz * R / d; } else { o[0] = px; o[2] = pz; }
  o[1] = clamp(py, -hh, hh);
}
const _c = [0, 0, 0];
function segCyl(a, b, R, hh, r, out) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = dx * dx + dy * dy + dz * dz;
  if (Math.min(a[1], b[1]) > hh + r || Math.max(a[1], b[1]) < -hh - r) return false;
  let t = 0.5, px, py, pz;
  for (let i = 0; i < 5; i++) {
    px = a[0] + dx * t; py = a[1] + dy * t; pz = a[2] + dz * t;
    clampCyl(px, py, pz, R, hh, _c);
    if (L2 < EPS) break;
    const nt = clamp(((_c[0] - a[0]) * dx + (_c[1] - a[1]) * dy + (_c[2] - a[2]) * dz) / L2, 0, 1);
    if (Math.abs(nt - t) < 1e-5) { t = nt; break; }
    t = nt;
  }
  px = a[0] + dx * t; py = a[1] + dy * t; pz = a[2] + dz * t;
  clampCyl(px, py, pz, R, hh, _c);
  if (px !== _c[0] || py !== _c[1] || pz !== _c[2]) return finish(out, px, py, pz, _c[0], _c[1], _c[2], r);
  const rho = Math.hypot(px, pz), orad = R - rho, oy = hh - Math.abs(py);
  out.lp[0] = px; out.lp[1] = py; out.lp[2] = pz; out.ln[0] = out.ln[1] = out.ln[2] = 0;
  if (oy <= orad) { const s = py < 0 ? -1 : 1; out.ln[1] = s; out.d = r + oy; out.lp[1] = s * hh; }
  else { const ix = rho > 1e-6 ? px / rho : 1, iz = rho > 1e-6 ? pz / rho : 0; out.ln[0] = ix; out.ln[2] = iz; out.d = r + orad; out.lp[0] = ix * R; out.lp[2] = iz * R; }
  return true;
}

function segSph(a, b, R, r, out) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = dx * dx + dy * dy + dz * dz;
  const t = L2 < EPS ? 0 : clamp(-(a[0] * dx + a[1] * dy + a[2] * dz) / L2, 0, 1);
  const px = a[0] + dx * t, py = a[1] + dy * t, pz = a[2] + dz * t, d = Math.hypot(px, py, pz), rr = R + r;
  if (d >= rr) return false;
  const nx = d > 1e-6 ? px / d : 0, ny = d > 1e-6 ? py / d : 1, nz = d > 1e-6 ? pz / d : 0;
  out.ln[0] = nx; out.ln[1] = ny; out.ln[2] = nz; out.d = rr - d; out.lp[0] = nx * R; out.lp[1] = ny * R; out.lp[2] = nz * R;
  return true;
}

// closest points between segments p1q1 and p2q2 -> [s, t]
function segSeg(p1, q1, p2, q2) {
  const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2];
  const d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
  const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= EPS && e <= EPS) return [0, 0];
  if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const bb = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - bb * bb;
      s = den > EPS ? clamp((bb * f - c * e) / den, 0, 1) : 0;
      t = (bb * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((bb - c) / a, 0, 1); }
    }
  }
  return [s, t];
}
const _p2 = [0, 0, 0], _q2 = [0, 0, 0];
function segCap(a, b, hl, R, r, out) {
  _p2[0] = -hl; _p2[1] = 0; _p2[2] = 0; _q2[0] = hl; _q2[1] = 0; _q2[2] = 0;
  const [s, t] = segSeg(a, b, _p2, _q2);
  const px = a[0] + (b[0] - a[0]) * s, py = a[1] + (b[1] - a[1]) * s, pz = a[2] + (b[2] - a[2]) * s;
  const cx = -hl + 2 * hl * t;
  const ex = px - cx, ey = py, ez = pz, d = Math.hypot(ex, ey, ez), rr = R + r;
  if (d >= rr) return false;
  const nx = d > 1e-6 ? ex / d : 0, ny = d > 1e-6 ? ey / d : 1, nz = d > 1e-6 ? ez / d : 0;
  out.ln[0] = nx; out.ln[1] = ny; out.ln[2] = nz; out.d = rr - d;
  out.lp[0] = cx + nx * R; out.lp[1] = ny * R; out.lp[2] = nz * R;
  return true;
}

// ---------------- ray casts (bots, camera, ground probes) ----------------
const _ro = [0, 0, 0], _rd = [0, 0, 0];
// returns distance along unit dir d, or Infinity. out.n gets the world normal.
function rayCollider(c, o, d, maxT, n) {
  const P = c.wp, M = c.wm;
  _t[0] = o[0] - P[0]; _t[1] = o[1] - P[1]; _t[2] = o[2] - P[2]; mtv(M, _t, _ro); mtv(M, d, _rd);
  let t = Infinity; const ln = [0, 0, 0];
  if (c.shape === 'box') t = rayBox(_ro, _rd, c.h, ln);
  else if (c.shape === 'cyl') t = rayCyl(_ro, _rd, c.r, c.hh, ln);
  else if (c.shape === 'sph') t = raySph(_ro, _rd, c.r, ln);
  else if (c.shape === 'cap') t = raySph(_ro, _rd, c.r, ln, true, c.hl); // approximate capsule by its swept spheres
  if (t > maxT) return Infinity;
  if (n) mv(M, ln, n);
  return t;
}
function rayBox(o, d, h, n) {
  let tmin = -Infinity, tmax = Infinity, ax = -1, sg = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < -h[i] || o[i] > h[i]) return Infinity; continue; }
    let t1 = (-h[i] - o[i]) / d[i], t2 = (h[i] - o[i]) / d[i], s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = i; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (tmin < 0 || ax < 0) return Infinity; // origin inside: ignore
  n[0] = n[1] = n[2] = 0; n[ax] = sg; return tmin;
}
function rayCyl(o, d, R, hh, n) {
  let best = Infinity;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a > 1e-9) {
    const b = 2 * (o[0] * d[0] + o[2] * d[2]), cc = o[0] * o[0] + o[2] * o[2] - R * R, disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0) { const y = o[1] + d[1] * t; if (y >= -hh && y <= hh) { best = t; const x = o[0] + d[0] * t, z = o[2] + d[2] * t; n[0] = x / R; n[1] = 0; n[2] = z / R; } }
    }
  }
  if (Math.abs(d[1]) > 1e-9) for (const s of [1, -1]) {
    const t = (s * hh - o[1]) / d[1];
    if (t >= 0 && t < best) { const x = o[0] + d[0] * t, z = o[2] + d[2] * t; if (x * x + z * z <= R * R) { best = t; n[0] = 0; n[1] = s; n[2] = 0; } }
  }
  return best;
}
function raySph(o, d, R, n, cap, hl) {
  let ox = o[0];
  if (cap) ox = o[0] - clamp(o[0], -hl, hl); // crude: nearest axis point
  const b = ox * d[0] + o[1] * d[1] + o[2] * d[2], cc = ox * ox + o[1] * o[1] + o[2] * o[2] - R * R, disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return Infinity;
  n[0] = (ox + d[0] * t) / R; n[1] = (o[1] + d[1] * t) / R; n[2] = (o[2] + d[2] * t) / R;
  return t;
}


export { prepCollider, worldAABB, poseAt, kinAngle, kinW, makeHit, contactSeg, segSeg, rayCollider };
