// CranGuys — procedural geometry: soft rounded primitives for the candy-plastic look, the skinned
// jelly-bean body, 43 hats, and whole-level meshes generated straight from the shared collider data.
import { MAT } from './gl.js';
import { hex2rgb } from '../util.js';
import { quatToMat } from '../sim/math.js';
const MATID = (m) => (m in MAT ? MAT[m] : 0);

// ---------------- world mesh builder (16 floats / vertex) ----------------
class MB {
  constructor() { this.v = []; this.i = []; this.n = 0; this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.P = [0, 0, 0]; this.S = [1, 1, 1]; }
  xf(R, P, S = [1, 1, 1]) { this.R = R; this.P = P; this.S = S; return this; }
  reset() { return this.xf([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]); }
  vert(p, n, c, c2, uv, mat, aux) {
    const R = this.R, S = this.S, x = p[0] * S[0], y = p[1] * S[1], z = p[2] * S[2];
    const nx = n[0] / S[0], ny = n[1] / S[1], nz = n[2] / S[2];
    let wx = R[0] * nx + R[1] * ny + R[2] * nz, wy = R[3] * nx + R[4] * ny + R[5] * nz, wz = R[6] * nx + R[7] * ny + R[8] * nz;
    const l = Math.hypot(wx, wy, wz) || 1;
    this.v.push(R[0] * x + R[1] * y + R[2] * z + this.P[0], R[3] * x + R[4] * y + R[5] * z + this.P[1], R[6] * x + R[7] * y + R[8] * z + this.P[2],
      wx / l, wy / l, wz / l, c[0], c[1], c[2], c2[0], c2[1], c2[2], uv[0], uv[1], mat, aux);
    return this.n++;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  get empty() { return this.n === 0; }
  build(R) { return R.mesh(new Float32Array(this.v), new Uint32Array(this.i)); }
}

// style: {c, c2, mat, aux, uv: fn(local, normal) -> [u,v]}
const st = (o) => ({ c: o.c || [1, 1, 1], c2: o.c2 || o.c || [1, 1, 1], mat: o.mat || 0, aux: o.aux || 0, uv: o.uv || ((p) => [p[0], p[2]]) });

// Rounded box: smooth bevels make everything look like soft injection-moulded plastic.
function roundBox(mb, h, r, s) {
  s = st(s);
  r = Math.min(r, h[0] * 0.98, h[1] * 0.98, h[2] * 0.98);
  const arc = r > 0.05 ? [Math.sin(Math.PI / 2), Math.sin(Math.PI / 3), Math.sin(Math.PI / 6)] : [1];
  const axisVals = (hh) => { const a = []; for (const k of arc) a.push(-(hh - r) - r * k); a.push(-(hh - r)); a.push(hh - r); for (let i = arc.length - 1; i >= 0; i--) a.push(hh - r + r * arc[i]); return a; };
  const V = [axisVals(h[0]), axisVals(h[1]), axisVals(h[2])];
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]]; // [u-axis, v-axis, normal-axis, sign]
  for (const [ua, va, na, sg] of faces) {
    const us = V[ua], vs = V[va], base = mb.n;
    for (let j = 0; j < vs.length; j++) for (let i = 0; i < us.length; i++) {
      const sp = [0, 0, 0]; sp[ua] = us[i]; sp[va] = vs[j]; sp[na] = sg * h[na];
      const inner = [Math.max(-(h[0] - r), Math.min(h[0] - r, sp[0])), Math.max(-(h[1] - r), Math.min(h[1] - r, sp[1])), Math.max(-(h[2] - r), Math.min(h[2] - r, sp[2]))];
      let nx = sp[0] - inner[0], ny = sp[1] - inner[1], nz = sp[2] - inner[2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const p = r > 0 ? [inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r] : sp;
      mb.vert(p, [nx, ny, nz], s.c, s.c2, s.uv(p, [nx, ny, nz], h), s.mat, s.aux);
    }
    const W = us.length;
    for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
      const a = base + j * W + i, b = a + 1, c = a + W + 1, d = a + W;
      // winding: outward normal
      if ((sg > 0) === ((na === 0 && ua === 1) || (na === 1 && ua === 2) || (na === 2 && ua === 0))) mb.quad(a, b, c, d); else mb.quad(a, d, c, b);
    }
  }
}

// Vertical cylinder with rounded rims (bumpers, discs, poles, platforms).
function cylinder(mb, R, hh, s, seg = 0, bevel = 0.12) {
  s = st(s); seg = seg || Math.max(14, Math.min(56, Math.round(R * 12)));
  bevel = Math.min(bevel, R * 0.45, hh * 0.9);
  const prof = []; // [radius, y, nr, ny]
  prof.push([0, -hh, 0, -1], [R - bevel, -hh, 0, -1]);
  for (let k = 1; k <= 3; k++) { const a = (k / 3) * (Math.PI / 2); prof.push([R - bevel + Math.sin(a) * bevel, -hh + bevel - Math.cos(a) * bevel, Math.sin(a), -Math.cos(a)]); }
  prof.push([R, hh - bevel, 1, 0]);
  for (let k = 1; k <= 3; k++) { const a = (k / 3) * (Math.PI / 2); prof.push([R - bevel + Math.cos(a) * bevel, hh - bevel + Math.sin(a) * bevel, Math.cos(a), Math.sin(a)]); }
  prof.push([R - bevel, hh, 0, 1], [0, hh, 0, 1]);
  lathe(mb, prof, seg, s);
}

// generic lathe around local Y. prof: [r, y, nr, ny]; flat profile segments duplicate verts for crisp normals
function lathe(mb, prof, seg, s) {
  s = st(s);
  const base = mb.n;
  for (let j = 0; j < prof.length; j++) {
    const [r, y, nr, ny] = prof[j];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const p = [ca * r, y, sa * r], n = [ca * nr, ny, sa * nr];
      mb.vert(p, n, s.c, s.c2, s.uv(p, n), s.mat, s.aux);
    }
  }
  const W = seg + 1;
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) { const a = base + j * W + i; mb.quad(a, a + W, a + W + 1, a + 1); }
}

function sphere(mb, r, s, seg = 18, ry = r) {
  const prof = [];
  for (let j = 0; j <= seg / 2; j++) { const a = -Math.PI / 2 + (j / (seg / 2)) * Math.PI; prof.push([Math.cos(a) * r, Math.sin(a) * ry, Math.cos(a), Math.sin(a)]); }
  lathe(mb, prof, seg, s);
}

// capsule along local X (sweeper arms)
function capsuleX(mb, r, hl, s, seg = 14) {
  const prof = [];
  for (let j = 0; j <= 5; j++) { const a = -Math.PI / 2 + (j / 5) * (Math.PI / 2); prof.push([Math.cos(a) * r, -hl + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
  for (let j = 0; j <= 5; j++) { const a = (j / 5) * (Math.PI / 2); prof.push([Math.cos(a) * r, hl + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
  const save = [mb.R, mb.P, mb.S];
  // rotate local Y->X by composing: x' = y, y' = -x
  const R = mb.R, rot = [R[1], -R[0], R[2], R[4], -R[3], R[5], R[7], -R[6], R[8]];
  mb.R = rot;
  s = { ...s, uv: (p) => [p[1], Math.atan2(p[2], p[0])] };
  lathe(mb, prof, seg, s);
  [mb.R, mb.P, mb.S] = save;
}

function cone(mb, r, h, s, seg = 20, r2 = 0) {
  const sl = Math.atan2(r - r2, h), nr = Math.cos(sl), ny = Math.sin(sl);
  lathe(mb, [[0, 0, 0, -1], [r, 0, 0, -1], [r, 0, nr, ny], [r2, h, nr, ny], [r2, h, 0, 1], [0, h, 0, 1]], seg, s);
}

function torus(mb, R, r, s, seg = 32, tseg = 10) {
  s = st(s); const base = mb.n;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= tseg; j++) {
      const b = (j / tseg) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
      const p = [(R + r * cb) * ca, r * sb, (R + r * cb) * sa], n = [cb * ca, sb, cb * sa];
      mb.vert(p, n, s.c, s.c2, [i / seg, j / tseg], s.mat, s.aux);
    }
  }
  const W = tseg + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) { const a = base + i * W + j; mb.quad(a, a + 1, a + W + 1, a + W); }
}

// flat-top hexagonal tile with a chamfered top edge
function hexTile(mb, R, hh, s) {
  s = st(s);
  const ch = 0.12, top = hh, base = -hh;
  const C = (rad, k) => [Math.cos((k * Math.PI) / 3) * rad, Math.sin((k * Math.PI) / 3) * rad];
  const v = (p, n) => mb.vert(p, n, s.c, s.c2, [p[0] / R, p[2] / R], s.mat, s.aux);
  const c0 = v([0, top, 0], [0, 1, 0]);
  const inner = []; for (let k = 0; k < 6; k++) { const [x, z] = C(R - ch, k); inner.push(v([x, top, z], [0, 1, 0])); }
  for (let k = 0; k < 6; k++) mb.tri(c0, inner[(k + 1) % 6], inner[k]);
  for (let k = 0; k < 6; k++) {
    const am = ((k + 0.5) * Math.PI) / 3, nx = Math.cos(am), nz = Math.sin(am), k2 = (k + 1) % 6;
    const [x0, z0] = C(R - ch, k), [x1, z1] = C(R - ch, k2), [X0, Z0] = C(R, k), [X1, Z1] = C(R, k2);
    const n45 = [nx * 0.7071, 0.7071, nz * 0.7071];
    const a = v([x0, top, z0], n45), b = v([x1, top, z1], n45), c = v([X1, top - ch, Z1], n45), d = v([X0, top - ch, Z0], n45);
    mb.quad(a, b, c, d);
    const e = v([X0, top - ch, Z0], [nx, 0, nz]), f = v([X1, top - ch, Z1], [nx, 0, nz]), g = v([X1, base, Z1], [nx, 0, nz]), h = v([X0, base, Z0], [nx, 0, nz]);
    mb.quad(e, f, g, h);
  }
}

// ---------------- the jelly bean (11 floats / vertex: pos3 nrm3 lp3 bone region) ----------------
function buildBean(R) {
  const v = [], idx = []; let n = 0;
  const add = (p, nn, lp, bone, reg) => { v.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], lp[0], lp[1], lp[2], bone, reg); return n++; };
  const latheB = (prof, seg, bone, reg, off = [0, 0, 0]) => {
    const base = n;
    for (const [r, y, nr, ny] of prof) for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const p = [sa * r + off[0], y + off[1], ca * r + off[2]];
      add(p, [sa * nr, ny, ca * nr], bone === 0 ? p : [p[0] + (bone === 1 ? -0.4 : bone === 2 ? 0.4 : 0), p[1], p[2]], bone, reg);
    }
    const W = seg + 1;
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) { const a = base + j * W + i; idx.push(a, a + 1, a + W + 1, a, a + W + 1, a + W); }
  };
  // body: bean-capsule, a touch wider at the bottom
  const prof = [], RB = 0.42;
  for (let j = 0; j <= 10; j++) { const a = -Math.PI / 2 + (j / 10) * (Math.PI / 2); prof.push([Math.cos(a) * RB * 1.04, -0.24 + Math.sin(a) * RB, Math.cos(a), Math.sin(a)]); }
  for (let j = 1; j <= 6; j++) { const y = -0.24 + (j / 6) * 0.6; prof.push([RB * (1.04 - 0.06 * (j / 6)), y, 1, 0.04]); }
  for (let j = 1; j <= 12; j++) { const a = (j / 12) * (Math.PI / 2); prof.push([Math.cos(a) * RB * 0.98, 0.36 + Math.sin(a) * RB, Math.cos(a), Math.sin(a)]); }
  latheB(prof, 32, 0, 0);
  // little limbs (capsules hanging from their pivots)
  const limb = (r, len) => { const p = []; for (let j = 0; j <= 4; j++) { const a = -Math.PI / 2 + (j / 4) * (Math.PI / 2); p.push([Math.cos(a) * r, -len + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } for (let j = 0; j <= 4; j++) { const a = (j / 4) * (Math.PI / 2); p.push([Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } return p; };
  latheB(limb(0.095, 0.27), 12, 1, 1); latheB(limb(0.095, 0.27), 12, 2, 1);
  latheB(limb(0.125, 0.15), 12, 3, 2); latheB(limb(0.125, 0.15), 12, 4, 2);
  return R.mesh(new Float32Array(v), new Uint32Array(idx), 'bean');
}
const BEAN_RIG = { shoulder: [0.41, 0.02, 0.03], hip: [0.17, -0.6, 0.02], top: 0.78 };

// Tube along a polyline (horns, stems, springs, headbands). rad: number or per-point radii.
function tube(mb, pts, rad, s, seg = 10) {
  s = st(s); const base = mb.n, n = pts.length;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let N = null;
  for (let i = 0; i < n; i++) {
    const t = nrm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    N = N ? nrm(sub(N, t.map((x) => x * dot(N, t)))) : nrm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const B = cross(t, N), r = Array.isArray(rad) ? rad[i] : rad, p = pts[i];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), nn = [N[0] * c + B[0] * sn, N[1] * c + B[1] * sn, N[2] * c + B[2] * sn];
      mb.vert([p[0] + nn[0] * r, p[1] + nn[1] * r, p[2] + nn[2] * r], nn, s.c, s.c2, [i / Math.max(1, n - 1), j / seg], s.mat, s.aux);
    }
  }
  const W = seg + 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = base + i * W + j; mb.quad(a, a + 1, a + W + 1, a + W); }
}
const curve = (fn, k) => Array.from({ length: k + 1 }, (_, i) => fn(i / k));

// ---------------- hats (world meshes in head space: origin = top of head, +z = the way the bean faces) ----------------
// how much each hat glows (index = hat k)
const HAT_EMIT = [0, 0, 0.05, 0, 0, 0.32, 0, 0.04, 0, 0, 0, 0.12, 0, 0, 0, 0.06, 0.03, 0, 0, 0.04, 0, 0, 0.3, 0, 0, 0, 0, 0.05, 0, 0, 0, 0, 0.22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.02];
function buildHats(R) {
  const H = [null];
  const C = (h) => hex2rgb(h);
  const mk = (fn) => { const mb = new MB(); fn(mb); return mb.build(R); };
  const at = (mb, p, q = [0, 0, 0, 1], sc) => mb.xf(quatToMat(q), p, sc);
  const ax = (a, ang) => { const s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; };
  const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const gold = (h = '#ffc83d') => ({ c: C(h), mat: MAT.gold });
  const spiral = (p) => [0, p[1] * 4.2 + Math.atan2(p[2], p[0]) / Math.PI];
  // 1 party cone — spiral stripes, frilly trim and a fluffy pom-pom, worn at a jaunty angle
  H.push(mk((mb) => {
    const tilt = ax([0, 0, 1], -0.16);
    at(mb, [0.02, -0.07, 0], tilt); cone(mb, 0.21, 0.52, { c: C('#ff5fa2'), c2: C('#ffe066'), mat: MAT.flagcloth, uv: spiral }, 28, 0.012);
    at(mb, [0.02, -0.06, 0], tilt); torus(mb, 0.205, 0.03, { c: C('#40e0a8') }, 28, 8);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; at(mb, [0.105 + Math.cos(a) * 0.04, 0.46 + Math.sin(a * 2) * 0.012, Math.sin(a) * 0.04]); sphere(mb, 0.045, { c: C(k % 2 ? '#fff4fb' : '#ffd23f') }, 10); }
    at(mb, [0.105, 0.48, 0]); sphere(mb, 0.05, { c: C('#ffffff') }, 12);
  }));
  // 2 royal crown — gold band set with gems, five leaf points tipped with pearls, red velvet cap, orb & cross
  H.push(mk((mb) => {
    at(mb, [0, -0.03, 0]); sphere(mb, 0.215, { c: C('#c8143f'), c2: C('#e8335d'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 3.8] }, 24, 0.17);
    at(mb, [0, -0.05, 0]); cylinder(mb, 0.25, 0.075, gold(), 32, 0.03);
    at(mb, [0, -0.115, 0]); torus(mb, 0.25, 0.022, gold('#ffd85a'), 32, 8);
    at(mb, [0, 0.02, 0]); torus(mb, 0.25, 0.018, gold('#ffd85a'), 32, 8);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 2, x = Math.cos(a), z = Math.sin(a);
      at(mb, [x * 0.235, 0.0, z * 0.235], ax([0, 1, 0], -a + Math.PI / 2), [1, 1, 0.45]); cone(mb, 0.08, 0.22, gold(), 10);
      at(mb, [x * 0.235, 0.235, z * 0.235]); sphere(mb, 0.034, { c: C('#fffaf0'), mat: MAT.gold }, 10);
      const g = (k / 5) * Math.PI * 2 + Math.PI / 2 + Math.PI / 5;
      at(mb, [Math.cos(g) * 0.255, -0.05, Math.sin(g) * 0.255], ax([0, 1, 0], -g + Math.PI / 2), [1, 1, 0.6]); sphere(mb, 0.036, { c: C(['#ff2e6a', '#2e8bff', '#20d68a', '#b45cff', '#ff8a2e'][k]), mat: MAT.gold }, 10);
    }
    at(mb, [0, 0.16, 0]); sphere(mb, 0.045, gold(), 12);
    at(mb, [0, 0.225, 0]); roundBox(mb, [0.012, 0.035, 0.012], 0.006, gold()); at(mb, [0, 0.235, 0]); roundBox(mb, [0.03, 0.011, 0.012], 0.006, gold());
  }));
  // 3 bunny ears — soft flattened ears with pink insides (one flops over) on a headband
  H.push(mk((mb) => {
    tube(mb, curve((t) => { const a = Math.PI * (0.14 + t * 0.72); return [Math.cos(a) * 0.43, Math.sin(a) * 0.43 - 0.41, 0]; }, 16), 0.026, { c: C('#ff9cc9') }, 8);
    for (const s of [-1, 1]) {
      const flop = s > 0, x0 = s * 0.14;
      const pts = curve((t) => flop ? [x0 + s * t * 0.08, -0.02 + Math.sin(Math.min(t, 0.62) / 0.62 * Math.PI / 2) * 0.34 - Math.max(0, t - 0.62) * 0.18, Math.max(0, t - 0.55) * 0.45] : [x0 + s * t * 0.1, -0.02 + t * 0.5, -t * 0.04], 12);
      const rad = pts.map((_, i) => { const t = i / 12; return 0.035 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.045 + (t > 0.95 ? -0.02 : 0); });
      at(mb, [0, 0, 0], [0, 0, 0, 1], [1, 1, 0.55]); tube(mb, pts, rad, { c: C('#fff4fb') }, 12);
      at(mb, [0, 0, 0.022], [0, 0, 0, 1], [0.62, 0.96, 0.3]); tube(mb, pts.map((p) => [p[0] / 0.62, p[1] / 0.96, p[2] / 0.3 + 0.02]), rad.map((r) => r * 0.75), { c: C('#ffb3d4') }, 10);
      const tip = pts[12]; at(mb, tip, [0, 0, 0, 1], [1, 1, 0.55]); sphere(mb, 0.03, { c: C('#fff4fb') }, 10);
    }
  }));
  // 4 propeller cap — panelled dome, a peak, and a three-blade propeller
  H.push(mk((mb) => {
    at(mb, [0, -0.12, 0]); sphere(mb, 0.33, { c: C('#36b9ff'), c2: C('#ffd23f'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 1.91] }, 24, 0.24);
    at(mb, [0, -0.12, 0.27], ax([1, 0, 0], 0.22), [1, 1, 1.25]); cylinder(mb, 0.19, 0.014, { c: C('#ff4757') }, 24, 0.012);
    at(mb, [0, 0.12, 0]); sphere(mb, 0.035, { c: C('#ff4757') }, 10);
    at(mb, [0, 0.17, 0]); cylinder(mb, 0.016, 0.05, { c: C('#ffffff') }, 8, 0.008);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; at(mb, [Math.cos(a) * 0.13, 0.215, Math.sin(a) * 0.13], qm(ax([0, 1, 0], -a), ax([1, 0, 0], 0.35)), [1, 1, 1]); roundBox(mb, [0.13, 0.008, 0.035], 0.008, { c: C(['#ff4757', '#ffd23f', '#40e0a8'][k]) }); }
    at(mb, [0, 0.225, 0]); sphere(mb, 0.03, { c: C('#ffd23f') }, 10);
  }));
  // 5 halo — a glowing double ring with orbiting sparkles
  H.push(mk((mb) => {
    at(mb, [0, 0.25, 0], ax([1, 0, 0], 0.12)); torus(mb, 0.215, 0.04, { c: C('#ffd84a'), mat: MAT.gold }, 40, 12);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + 0.4; at(mb, [Math.cos(a) * 0.31, 0.3 + Math.sin(a * 2) * 0.04, Math.sin(a) * 0.31]); sphere(mb, 0.022, { c: C('#fff6c0') }, 8); }
  }));
  // 6 top hat — curled brim, satin band and bow, a little flower
  H.push(mk((mb) => {
    const ink = { c: C('#2b2350'), c2: C('#3a3070'), mat: MAT.flagcloth, uv: (p) => [0, p[1] * 0.2] };
    at(mb, [0, -0.005, 0]); cylinder(mb, 0.345, 0.016, ink, 40, 0.012);
    at(mb, [0, 0.012, 0]); torus(mb, 0.345, 0.024, { c: C('#2b2350') }, 40, 8);
    at(mb, [0, 0.215, 0]); lathe(mb, [[0.2, -0.2, 1, 0], [0.214, 0.17, 1, 0.05], [0.205, 0.2, 0.5, 0.86], [0.17, 0.215, 0, 1], [0, 0.215, 0, 1]], 32, ink);
    at(mb, [0, 0.06, 0]); cylinder(mb, 0.207, 0.045, { c: C('#ff2e88'), c2: C('#ff6fb0'), mat: MAT.flagcloth, uv: (p) => [0, p[1] * 9] }, 32, 0.01);
    for (const s of [-1, 1]) { at(mb, [0.2 + 0.005, 0.06, s * 0.055], ax([1, 0, 0], s * 0.5), [0.35, 1, 1]); sphere(mb, 0.055, { c: C('#ff2e88') }, 12, 0.035); }
    at(mb, [0.215, 0.06, 0]); sphere(mb, 0.025, { c: C('#ffd23f') }, 10);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; at(mb, [0.155 + Math.cos(a) * 0.02, 0.1, 0.12 + Math.sin(a) * 0.02]); sphere(mb, 0.018, { c: C('#ffffff') }, 8); }
  }));
  // 7 traffic cone — square rubber base, reflective bands
  H.push(mk((mb) => {
    at(mb, [0, -0.025, 0]); roundBox(mb, [0.25, 0.028, 0.25], 0.03, { c: C('#3a3346') });
    at(mb, [0, -0.0, 0]); cone(mb, 0.18, 0.5, { c: C('#ff7a1f'), c2: C('#f7f7ff'), mat: MAT.flagcloth, uv: (p) => [0, p[1] * 3.0 + 0.32] }, 24, 0.035);
    at(mb, [0, 0.5, 0]); sphere(mb, 0.036, { c: C('#ff7a1f') }, 10);
  }));
  // 8 viking helmet — riveted metal dome, centre ridge, big curved horns
  H.push(mk((mb) => {
    at(mb, [0, -0.13, 0]); sphere(mb, 0.37, { c: C('#a9b2c6'), mat: MAT.gold }, 24, 0.29);
    at(mb, [0, -0.13, 0]); torus(mb, 0.368, 0.035, { c: C('#c98a3a'), mat: MAT.gold }, 36, 8);
    at(mb, [0, 0.0, 0], ax([0, 0, 1], 0)); tube(mb, curve((t) => { const a = Math.PI * (0.12 + t * 0.76); return [0, Math.sin(a) * 0.31 - 0.14, Math.cos(a) * 0.31]; }, 14), 0.028, { c: C('#c98a3a'), mat: MAT.gold }, 8);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; at(mb, [Math.cos(a) * 0.39, -0.13, Math.sin(a) * 0.39]); sphere(mb, 0.02, { c: C('#ffd85a'), mat: MAT.gold }, 6); }
    for (const s of [-1, 1]) {
      const pts = curve((t) => [s * (0.3 + t * 0.2), -0.06 + Math.sin(t * Math.PI * 0.85) * 0.2 + t * 0.12, -t * 0.06], 12);
      at(mb, [0, 0, 0]); tube(mb, pts, pts.map((_, i) => 0.075 * (1 - i / 12) + 0.008), { c: C('#fff1d6'), c2: C('#e6d3ad'), mat: MAT.flagcloth, uv: (p) => [0, Math.abs(p[0]) * 9] }, 12);
      at(mb, [s * 0.3, -0.06, 0], ax([0, 0, 1], s * Math.PI / 2)); torus(mb, 0.075, 0.018, { c: C('#c98a3a'), mat: MAT.gold }, 16, 6);
    }
  }));
  // 9 chef hat — pleated band and a big puffy top
  H.push(mk((mb) => {
    at(mb, [0, 0.03, 0]); cylinder(mb, 0.225, 0.1, { c: C('#ffffff'), c2: C('#e9e6f2'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 5] }, 32, 0.02);
    const puffs = [[0, 0.27, 0, 0.17], ...Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2; return [Math.cos(a) * 0.13, 0.2, Math.sin(a) * 0.13, 0.13]; }), ...Array.from({ length: 4 }, (_, k) => { const a = (k / 4) * Math.PI * 2 + 0.6; return [Math.cos(a) * 0.08, 0.33, Math.sin(a) * 0.08, 0.11]; })];
    for (const [x, y, z, r] of puffs) { at(mb, [x, y, z]); sphere(mb, r, { c: C('#ffffff') }, 14); }
  }));
  // 10 cranberry sprig (CranGuys signature!) — curling stem, veined leaves, glossy berries
  H.push(mk((mb) => {
    at(mb, [0, 0, 0]); tube(mb, curve((t) => [Math.sin(t * 2.4) * 0.05, t * 0.22, -t * 0.03], 10), 0.014, { c: C('#4a8f2e') }, 6);
    for (const s of [-1, 1]) {
      const q = qm(ax([0, 1, 0], s * 0.4), ax([0, 0, 1], s * 1.0));
      at(mb, [s * 0.1, 0.16, -0.02], q, [1, 1, 1]); sphere(mb, 0.055, { c: C('#46c45a') }, 14, 0.14);
      at(mb, [s * 0.1, 0.16, -0.0], q, [0.2, 1, 1.4]); sphere(mb, 0.012, { c: C('#2f8a3d') }, 6, 0.12);
    }
    for (const [x, y, z, r] of [[0.0, 0.25, 0.04, 0.06], [0.065, 0.21, -0.03, 0.055], [-0.07, 0.2, -0.02, 0.052]]) {
      at(mb, [x, y, z]); sphere(mb, r, { c: C('#d6195a'), mat: MAT.gold }, 16);
      at(mb, [x, y - r * 0.9, z]); sphere(mb, r * 0.22, { c: C('#5a1030') }, 6);
    }
  }));
  // 11 antennae — springy coils with glowing bobbles on a headband
  H.push(mk((mb) => {
    tube(mb, curve((t) => { const a = Math.PI * (0.14 + t * 0.72); return [Math.cos(a) * 0.43, Math.sin(a) * 0.43 - 0.41, 0]; }, 16), 0.024, { c: C('#2b2350') }, 8);
    for (const s of [-1, 1]) {
      at(mb, [0, 0, 0]); tube(mb, curve((t) => [s * (0.12 + t * 0.1) + Math.cos(t * 18) * 0.025, 0.02 + t * 0.3, Math.sin(t * 18) * 0.025], 40), 0.012, { c: C('#2b2350') }, 6);
      at(mb, [s * 0.22, 0.34, 0]); sphere(mb, 0.065, { c: C(s < 0 ? '#ffd23f' : '#ff5fa2') }, 14);
      at(mb, [s * 0.22 - 0.02, 0.36, 0.045]); sphere(mb, 0.016, { c: C('#ffffff') }, 6);
    }
  }));
  // 12 daisy — two layers of petals, a seedy centre and a leaf
  H.push(mk((mb) => {
    const atS = (p, q = [0, 0, 0, 1], sc = [1, 1, 1]) => at(mb, [p[0] * 1.35, p[1] * 1.35 - 0.01, p[2] * 1.35], q, sc.map((v) => v * 1.35)); // a big daisy
    for (let L = 0; L < 2; L++) for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + L * 0.29;
      atS([Math.cos(a) * (0.12 - L * 0.025), 0.04 + L * 0.02, Math.sin(a) * (0.12 - L * 0.025)], qm(ax([0, 1, 0], -a), ax([0, 0, 1], 0.18 + L * 0.15)), [1, 1, 1]); sphere(mb, 0.1 - L * 0.02, { c: C(L ? '#ffe3f0' : '#ffffff') }, 10, 0.025);
    }
    atS([0, 0.075, 0]); sphere(mb, 0.07, { c: C('#ffc21f') }, 16, 0.04);
    for (let k = 0; k < 9; k++) { const a = k * 2.39996, r = 0.018 * Math.sqrt(k + 0.5); atS([Math.cos(a) * r, 0.11, Math.sin(a) * r]); sphere(mb, 0.011, { c: C('#e08a00') }, 6); }
    atS([-0.17, 0.02, -0.06], ax([0, 1, 0], 0.6)); sphere(mb, 0.07, { c: C('#46c45a') }, 12, 0.02);
  }));
  // 13 bobble beanie — knitted rows, a thick ribbed cuff and a big fluffy pom-pom
  H.push(mk((mb) => {
    at(mb, [0, -0.12, 0]); sphere(mb, 0.37, { c: C('#ff4757'), c2: C('#fff4fb'), mat: MAT.flagcloth, uv: (p) => [0, p[1] * 7 + 0.5] }, 26, 0.33);
    at(mb, [0, -0.13, 0]); torus(mb, 0.36, 0.075, { c: C('#e8384a'), c2: C('#ff6a77'), mat: MAT.flagcloth, uv: (p) => [0, p[0] * 4] }, 40, 10);
    for (let k = 0; k < 14; k++) { const u = k / 14, a = k * 2.39996, y = 0.22 + (u - 0.5) * 0.12, r = 0.06 * Math.sqrt(1 - Math.pow((u - 0.5) * 2, 2)); at(mb, [Math.cos(a) * r, y, Math.sin(a) * r]); sphere(mb, 0.055, { c: C(k % 3 ? '#ffffff' : '#ffe8ee') }, 10); }
  }));
  // 14 pirate bicorne — upturned brim, gold trim, skull & crossbones
  H.push(mk((mb) => {
    const blk = { c: C('#1f1a33') }, trim = { c: C('#ffc83d'), mat: MAT.gold };
    at(mb, [0, 0.0, 0], [0, 0, 0, 1], [1.12, 0.7, 0.72]); sphere(mb, 0.33, blk, 24);
    for (const s of [-1, 1]) {
      at(mb, [0, 0.06, s * 0.12], ax([1, 0, 0], -s * 0.9), [1.2, 0.62, 0.2]); sphere(mb, 0.34, blk, 24);
      at(mb, [0, 0.06, s * 0.12], ax([1, 0, 0], -s * 0.9), [1.2, 0.62, 0.2]); torus(mb, 0.335, 0.03, trim, 40, 6);
    }
    const fz = 0.29, fy = 0.2;
    at(mb, [0, fy, fz]); sphere(mb, 0.055, { c: C('#ffffff') }, 14, 0.05);
    at(mb, [0, fy - 0.035, fz + 0.005]); roundBox(mb, [0.03, 0.018, 0.02], 0.012, { c: C('#ffffff') });
    for (const s of [-1, 1]) { at(mb, [s * 0.021, fy + 0.006, fz + 0.045]); sphere(mb, 0.014, { c: C('#1f1a33') }, 6); at(mb, [0, fy, fz + 0.01], ax([0, 0, 1], s * 0.75)); capsuleX(mb, 0.012, 0.075, { c: C('#ffffff') }, 6); }
  }));
  // 15 headphones — padded band, big cups with cushions and a glowing ring
  H.push(mk((mb) => {
    at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = Math.PI * (0.08 + t * 0.84); return [Math.cos(a) * 0.45, Math.sin(a) * 0.45 - 0.38, 0]; }, 20), 0.035, { c: C('#2b2350') }, 10);
    at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = Math.PI * (0.3 + t * 0.4); return [Math.cos(a) * 0.43, Math.sin(a) * 0.43 - 0.38, 0]; }, 10), 0.048, { c: C('#ff5fa2') }, 10);
    for (const s of [-1, 1]) {
      const q = ax([0, 0, 1], Math.PI / 2);
      at(mb, [s * 0.44, -0.33, 0], q); cylinder(mb, 0.13, 0.055, { c: C('#ff2e88') }, 24, 0.03);
      at(mb, [s * 0.395, -0.33, 0], q); torus(mb, 0.1, 0.035, { c: C('#3a3070') }, 24, 8);
      at(mb, [s * 0.5, -0.33, 0], q); torus(mb, 0.085, 0.016, { c: C('#7ef0ff') }, 24, 6);
    }
  }));
  // 16 builder's hat (EXCLUSIVE, promo code) — safety-yellow hard hat: ribbed shell, peak, hazard band, headlamp
  H.push(mk((mb) => {
    const yel = { c: C('#ffc21a') };
    at(mb, [0, -0.11, 0]); sphere(mb, 0.345, yel, 28, 0.275);
    for (const [x, rr] of [[0, 0.036], [-0.12, 0.024], [0.12, 0.024]]) {
      const R0 = Math.sqrt(0.352 * 0.352 - x * x), Ry = 0.282 * (R0 / 0.352);
      at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = Math.PI * (0.1 + t * 0.8); return [x, -0.11 + Math.sin(a) * Ry, Math.cos(a) * R0]; }, 18), rr, { c: C('#ffd23f') }, 8);
    }
    at(mb, [0, -0.095, 0]); cylinder(mb, 0.352, 0.028, { c: C('#ffd23f'), c2: C('#2b2350'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 4.2 + p[1] * 6] }, 48, 0.01);
    at(mb, [0, -0.13, 0]); torus(mb, 0.36, 0.03, { c: C('#f0ab00') }, 44, 8);
    at(mb, [0, -0.135, 0.2], ax([1, 0, 0], -0.08), [1, 0.1, 0.62]); sphere(mb, 0.33, { c: C('#f5b400') }, 28);
    // headlamp on the front of the shell
    at(mb, [0, 0.02, 0.315], ax([1, 0, 0], 0.55)); roundBox(mb, [0.075, 0.05, 0.03], 0.02, { c: C('#3a3346') });
    at(mb, [0, 0.03, 0.35], ax([1, 0, 0], Math.PI / 2 + 0.55)); cylinder(mb, 0.058, 0.035, { c: C('#5a5470') }, 20, 0.015);
    at(mb, [0, 0.058, 0.392], ax([1, 0, 0], 0.55), [1, 1, 0.5]); sphere(mb, 0.05, { c: C('#ffffff') }, 14);
    // gold "exclusive" badges on each side with a little cranberry
    for (const sx of [-1, 1]) {
      at(mb, [sx * 0.322, -0.03, 0.02], ax([0, 0, 1], sx * Math.PI / 2 * 0.86)); cylinder(mb, 0.062, 0.012, { c: C('#ffd85a'), mat: MAT.gold }, 20, 0.008);
      at(mb, [sx * 0.338, -0.025, 0.02]); sphere(mb, 0.03, { c: C('#d6195a'), mat: MAT.gold }, 10);
    }
  }));
  // a knitted shell round the head (hat space: the bean's head is a sphere of r≈0.41 centred at y -0.40, the face
  // visor an ellipse 0.285×0.205 centred at y -0.34 on the front). keep(x, y, z) decides which bits are kept.
  const shell = (mb, s0, keep, R0 = 0.455, bottom = -0.74, NS = 14, SEG = 56) => {
    const s = st(s0), cy = -0.40, rows = [], NC = Math.max(6, Math.round(NS * 0.45));
    for (let j = 0; j <= NS; j++) { const th = (j / NS) * Math.PI / 2; rows.push([R0 * Math.sin(th), cy + R0 * Math.cos(th), Math.sin(th), Math.cos(th)]); }
    for (let j = 1; j <= NC; j++) rows.push([R0, cy + (bottom - cy) * (j / NC), 1, 0]);
    const W = SEG + 1, base = mb.n;
    for (const [r, y, nr, ny] of rows) for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2, p = [Math.sin(a) * r, y, Math.cos(a) * r], n = [Math.sin(a) * nr, ny, Math.cos(a) * nr];
      mb.vert(p, n, s.c, s.c2, s.uv(p, n), s.mat, s.aux);
    }
    const V = (k) => { const o = (base + k) * 16; return [mb.v[o], mb.v[o + 1], mb.v[o + 2]]; }; // (built at the origin, so these are hat-space)
    for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < SEG; i++) {
      const a = j * W + i, q = [V(a), V(a + 1), V(a + W + 1), V(a + W)], c = [0, 1, 2].map((d) => (q[0][d] + q[1][d] + q[2][d] + q[3][d]) / 4);
      if (keep(c[0], c[1], c[2])) mb.quad(base + a, base + a + W, base + a + W + 1, base + a + 1);
    }
  };
  const onShell = (x, y, R0 = 0.455) => { const dy = Math.max(0, y + 0.40); return [x, y, Math.sqrt(Math.max(0, R0 * R0 - x * x - dy * dy))]; };
  // a knitted ski mask covering the whole face: two eye holes and a mouth hole, each with a ribbed rim, plus a
  // ribbed hem; deco() adds the trimmings (top knot, badge, stripes…)
  const SKI_HOLES = [[-0.105, -0.322, 0.074, 0.062], [0.105, -0.322, 0.074, 0.062], [0, -0.472, 0.088, 0.046]]; // eyes, mouth: x, y, rx, ry
  const inHole = (x, y, z, holes = SKI_HOLES) => z > 0 && holes.some(([hx, hy, rx, ry]) => ((x - hx) / rx) ** 2 + ((y - hy) / ry) ** 2 < 1);
  const skiMask = (mb, k1, k2, rim, hem1, hem2, mouth, deco) => {
    at(mb, [0, 0, 0]);
    shell(mb, { c: C(k1), c2: C(k2), mat: MAT.flagcloth, uv: (p) => [0, p[1] * 15] }, (x, y, z) => !inHole(x, y, z), 0.455, -0.74, 30, 110);
    for (const [hx, hy, rx, ry] of SKI_HOLES) { at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = t * Math.PI * 2; return onShell(hx + Math.sin(a) * rx, hy + Math.cos(a) * ry); }, 36), 0.021, { c: C(rim) }, 6); }
    at(mb, [0, -0.472, 0.418], [0, 0, 0, 1], [1, 1, 0.3]); sphere(mb, 0.072, { c: C(mouth) }, 16, 0.036); // inside of the mouth
    at(mb, [0, -0.74, 0]); torus(mb, 0.455, 0.045, { c: C(hem1), c2: C(hem2), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 9] }, 48, 10);
    deco(mb);
  };
  // 17 pink balaclava (EXCLUSIVE, codes "190812" and "PINKMASK-6620") — pink knit, a little top knot and a gold heart
  H.push(mk((mb) => skiMask(mb, '#ff4fa0', '#ff8cc6', '#e8358a', '#e8358a', '#ff6fb2', '#5a0f2a', (mb) => {
    at(mb, [0, 0.05, 0]); sphere(mb, 0.07, { c: C('#ff6fb2') }, 12, 0.05);
    at(mb, [0.36, -0.36, -0.24], ax([0, 1, 0], 2.15)); roundBox(mb, [0.05, 0.05, 0.012], 0.012, { c: C('#ffd85a'), mat: MAT.gold });
  })));
  // 18 dino hood (EXCLUSIVE, promo code "Jaylum") — a green hoodie-hood shaped like a dino's open mouth: teeth round the
  // face opening, a spiky crest from the forehead down the back and googly eyes on top
  H.push(mk((mb) => {
    const green = { c: C('#3fc45e'), c2: C('#57d873'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 3 + p[1] * 2] };
    const ox = 0.37, oy = 0.29, oc = -0.33, R0 = 0.47;
    at(mb, [0, 0, 0]);
    shell(mb, green, (x, y, z) => !(z > 0 && (x / ox) ** 2 + ((y - oc) / oy) ** 2 < 1), R0, -0.72);
    const lip = curve((t) => { const a = t * Math.PI * 2; return onShell(Math.sin(a) * ox, oc + Math.cos(a) * oy, R0); }, 48);
    at(mb, [0, 0, 0]); tube(mb, lip, 0.045, { c: C('#2fae4f') }, 8);
    // teeth: a row hanging from the top of the mouth and a few smaller ones poking up from the bottom
    for (let k = -3; k <= 3; k++) { const a = k * 0.27, p = onShell(Math.sin(a) * ox, oc + Math.cos(a) * oy, R0); at(mb, [p[0], p[1] - 0.025, p[2] + 0.01], ax([1, 0, 0], Math.PI)); cone(mb, 0.034, 0.075, { c: C('#ffffff') }, 10); }
    for (let k = -2; k <= 2; k++) { if (!k) continue; const a = Math.PI + k * 0.3, p = onShell(Math.sin(a) * ox, oc + Math.cos(a) * oy, R0); at(mb, [p[0], p[1] + 0.02, p[2] + 0.01]); cone(mb, 0.028, 0.055, { c: C('#ffffff') }, 10); }
    // crest of spikes from the forehead over the top and down the back
    for (let k = 0; k < 7; k++) {
      const th = 0.3 - k * 0.36, y = -0.40 + 0.455 * Math.cos(th), z = 0.455 * Math.sin(th), big = 1 - Math.abs(k - 2) * 0.12;
      at(mb, [0, y, z], ax([1, 0, 0], th), [0.5, 1, 1]); cone(mb, 0.09 * big, 0.19 * big, { c: C(k % 2 ? '#ffb31f' : '#ff8a3d') }, 12);
    }
    at(mb, [0, -0.72, 0]); torus(mb, R0, 0.045, { c: C('#2fae4f'), c2: C('#3fc45e'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 9] }, 48, 8);
    // googly dino eyes on top of the hood
    for (const sx of [-1, 1]) {
      at(mb, [sx * 0.16, 0.0, 0.2]); sphere(mb, 0.085, { c: C('#ffffff') }, 14);
      at(mb, [sx * 0.165, 0.015, 0.275]); sphere(mb, 0.04, { c: C('#1f1a33') }, 10);
      at(mb, [sx * 0.155, 0.035, 0.305]); sphere(mb, 0.012, { c: C('#ffffff') }, 6);
    }
  }));
  // ---------- helpers for the hats below ----------
  const dbl = (mb, rows, s0, back) => { // a double-sided sheet: rows[j][i] = [p, n]
    const s = st(s0), sb = st(back || s0);
    for (const [side, sty] of [[1, s], [-1, sb]]) {
      const base = mb.n, W = rows[0].length;
      for (const row of rows) for (const [p, n] of row) mb.vert(p, [n[0] * side, n[1] * side, n[2] * side], sty.c, sty.c2, sty.uv(p, n), sty.mat, sty.aux);
      for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < W - 1; i++) { const a = base + j * W + i; if (side > 0) mb.quad(a, a + W, a + W + 1, a + 1); else mb.quad(a, a + 1, a + W + 1, a + W); }
    }
  };
  const arc = (th, R0 = 0.465) => [0, -0.40 + R0 * Math.cos(th), R0 * Math.sin(th)]; // over the top, front (+th) to back (-th)
  const flower = (mb, p, q, col, r = 0.05) => { // five petals and a yellow middle, facing along q's +y
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; at(mb, p, qm(q, ax([0, 1, 0], a)), [1, 1, 1]); mb.P = [p[0], p[1], p[2]]; const R = mb.R; const off = [R[0] * r * 0.9, R[3] * r * 0.9, R[6] * r * 0.9]; at(mb, [p[0] + off[0], p[1] + off[1], p[2] + off[2]], qm(q, ax([0, 1, 0], a)), [1, 0.45, 0.75]); sphere(mb, r * 0.75, { c: C(col) }, 10); }
    at(mb, p, q, [1, 0.6, 1]); sphere(mb, r * 0.5, { c: C('#ffd23f') }, 10);
  };
  // 19 golden knight helmet (EXCLUSIVE, code "jaylumjaylum") — a full gold helm with an eye slit, a nasal ridge,
  // a crest over the top, rivets, breathing holes and a red plume
  H.push(mk((mb) => {
    const g = { c: C('#ffcf4a'), c2: C('#ffe58a'), mat: MAT.gold, uv: (p) => [p[0], p[1]] }, dk = { c: C('#c8961e'), mat: MAT.gold };
    at(mb, [0, 0, 0]);
    shell(mb, g, (x, y, z) => !(z > 0.06 && Math.abs(y + 0.322) < 0.042 && Math.abs(x) < 0.25), 0.468, -0.80, 26, 96);
    for (const yy of [-0.278, -0.366]) { at(mb, [0, 0, 0]); tube(mb, curve((t) => onShell(-0.26 + 0.52 * t, yy, 0.468), 20), 0.017, dk, 6); }
    at(mb, [0, 0, 0]); tube(mb, curve((t) => onShell(0, -0.08 - t * 0.2, 0.478), 8), 0.026, dk, 8);       // forehead ridge
    at(mb, [0, 0, 0]); tube(mb, curve((t) => onShell(0, -0.37 - t * 0.28, 0.478), 8), 0.026, dk, 8);      // nasal guard below the slit
    at(mb, [0, 0, 0]); tube(mb, curve((t) => arc(0.75 - t * 2.6, 0.478), 26), 0.03, dk, 8);                // crest
    for (const sx of [-1, 1]) for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { const p = onShell(sx * (0.1 + c * 0.055), -0.48 - r * 0.05, 0.47); at(mb, p); sphere(mb, 0.012, { c: C('#5a3d08') }, 6); }
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; at(mb, [Math.sin(a) * 0.47, -0.74, Math.cos(a) * 0.47]); sphere(mb, 0.02, dk, 8); }
    at(mb, [0, -0.8, 0]); torus(mb, 0.468, 0.03, dk, 48, 8);
    for (let k = 0; k < 6; k++) { const th = 0.5 - k * 0.24, p = arc(th, 0.49); at(mb, p, ax([1, 0, 0], th - 1.0 + k * 0.1), [0.55, 1, 1]); cone(mb, 0.075, 0.26 - Math.abs(k - 2) * 0.025, { c: C(k % 2 ? '#e8202f' : '#ff4040') }, 12, 0.012); }
  }));
  // 20 white ski mask (EXCLUSIVE, code "redbull") — like the pink balaclava but snowy white, with two ice-blue
  // stripes round the forehead and a little snowflake badge on the side. (Its item id is still h_bikehelmet, so
  // anyone who redeemed the old bike helmet now has this.)
  H.push(mk((mb) => skiMask(mb, '#f7f9fd', '#e2e8f3', '#c4d0e4', '#9fc4ee', '#d7e8fb', '#3a2c4a', (mb) => {
    for (const y of [-0.155, -0.2]) { at(mb, [0, y, 0]); torus(mb, Math.sqrt(0.455 ** 2 - (y + 0.4) ** 2) + 0.006, 0.014, { c: C('#7fb6f0') }, 64, 6); }
    // snowflake: three crossed bars and a dot, on the side of the head
    const sp = [0.395, -0.42, -0.2], face = qm(ax([0, 1, 0], 2.05), [0, 0, 0, 1]);
    for (let k = 0; k < 3; k++) { at(mb, sp, qm(face, ax([0, 0, 1], k * Math.PI / 3))); roundBox(mb, [0.055, 0.009, 0.008], 0.006, { c: C('#5aa2ea') }); }
    at(mb, sp); sphere(mb, 0.016, { c: C('#ffffff') }, 8);
  })));
  // 21 royal red cape (EXCLUSIVE, code "royalavey") — a velvet cape tied round the neck with a gold-trimmed collar
  // and a bow at the front, flaring out down the back
  H.push(mk((mb) => {
    const top = -0.64, bot = -1.42, rows = [];
    for (let j = 0; j <= 10; j++) {
      const v = j / 10, y = top + (bot - top) * v, row = [];
      for (let i = 0; i <= 24; i++) {
        const u = (i / 24 - 0.5) * 2, a = Math.PI + u * (1.1 + 0.25 * v), r = 0.458 + 0.2 * v * v + 0.025 * Math.sin(u * 9) * v;
        row.push([[Math.sin(a) * r, y, Math.cos(a) * r], [Math.sin(a), 0.15 * v, Math.cos(a)]]);
      }
      rows.push(row);
    }
    at(mb, [0, 0, 0]); dbl(mb, rows, { c: C('#c8102e'), c2: C('#e0283f'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[0], -p[2]) * 6] }, { c: C('#7d0a1c') });
    const edge = rows[rows.length - 1].map(([p]) => [p[0] * 1.01, p[1], p[2] * 1.01]);
    at(mb, [0, 0, 0]); tube(mb, edge, 0.018, { c: C('#ffc83d'), mat: MAT.gold }, 6);
    at(mb, [0, top + 0.01, 0]); torus(mb, 0.462, 0.04, { c: C('#c8102e'), c2: C('#e0283f') }, 40, 8);
    at(mb, [0, top + 0.03, 0]); torus(mb, 0.47, 0.014, { c: C('#ffc83d'), mat: MAT.gold }, 40, 6);
    // the bow at the front
    for (const sx of [-1, 1]) { at(mb, [sx * 0.06, top + 0.01, 0.47], qm(ax([0, 0, 1], sx * 0.35), ax([1, 0, 0], Math.PI / 2)), [1, 1, 0.55]); torus(mb, 0.05, 0.018, { c: C('#c8102e') }, 16, 6); }
    at(mb, [0, top + 0.01, 0.48]); sphere(mb, 0.028, { c: C('#ffc83d'), mat: MAT.gold }, 10);
    for (const sx of [-1, 1]) { at(mb, [0, 0, 0]); tube(mb, [[sx * 0.01, top, 0.48], [sx * 0.04, top - 0.08, 0.48], [sx * 0.06, top - 0.15, 0.47]], 0.016, { c: C('#c8102e') }, 6); }
  }));
  // 22 champion wings (CRANPASS level 100 only) — big pearly angel wings with gold-tipped feathers, spread out
  // behind you (they glow softly)
  H.push(mk((mb) => {
    const angs = [-0.42, -0.18, 0.06, 0.3, 0.55, 0.8, 1.05], lens = [0.4, 0.5, 0.6, 0.7, 0.78, 0.72, 0.56];
    for (const sx of [-1, 1]) {
      const root = [sx * 0.12, -0.6, -0.4], sweep = ax([0, 1, 0], sx * 0.38);
      const dirOf = (a) => { const x = Math.cos(a) * sx, y = Math.sin(a), c = Math.cos(sx * 0.38), s = Math.sin(sx * 0.38); return [x * c, y, -x * s]; };
      angs.forEach((a, k) => {
        const len = lens[k], d = dirOf(a), roll = ax([0, 0, 1], sx > 0 ? a : Math.PI - a);
        // long feathers, then a row of short covert feathers over their roots
        at(mb, root.map((v, n) => v + d[n] * len * 0.52 - (n === 2 ? 0.02 * k : 0)), qm(sweep, roll), [len * 0.54, 0.075 + len * 0.07, 0.035]);
        sphere(mb, 1, { c: C(k % 2 ? '#fffaf0' : '#fff2cf') }, 16);
        at(mb, root.map((v, n) => v + d[n] * len * 1.02 - (n === 2 ? 0.02 * k : 0))); sphere(mb, 0.03, { c: C('#ffd23f'), mat: MAT.gold }, 8);
        if (k > 0 && k < 6) { at(mb, root.map((v, n) => v + d[n] * 0.17 - (n === 2 ? 0.02 * k - 0.03 : 0)), qm(sweep, roll), [0.19, 0.075, 0.04]); sphere(mb, 1, { c: C('#ffe7a8'), mat: MAT.gold }, 12); }
      });
      at(mb, root); sphere(mb, 0.075, { c: C('#ffd23f'), mat: MAT.gold }, 12);
    }
  }));
  // 23 frog hat (EXCLUSIVE) — a squashy green dome with big googly eyes and a smile
  H.push(mk((mb) => {
    at(mb, [0, -0.1, 0]); sphere(mb, 0.37, { c: C('#5ed35a'), c2: C('#7be06f') }, 22, 0.2);
    at(mb, [0, -0.115, 0]); torus(mb, 0.36, 0.035, { c: C('#3fae44') }, 36, 8);
    for (const sx of [-1, 1]) {
      at(mb, [sx * 0.16, 0.06, 0.13]); sphere(mb, 0.1, { c: C('#5ed35a') }, 14);
      at(mb, [sx * 0.16, 0.085, 0.185]); sphere(mb, 0.07, { c: C('#ffffff') }, 14);
      at(mb, [sx * 0.165, 0.09, 0.245]); sphere(mb, 0.035, { c: C('#1f1a33') }, 10);
    }
    at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = (t - 0.5) * 1.4; return [Math.sin(a) * 0.3, -0.06 - Math.cos(a * 1.2) * 0.03, Math.cos(a) * 0.3]; }, 14), 0.014, { c: C('#1f5a24') }, 6);
  }));
  // 24 witch hat (EXCLUSIVE) — a wide brim and a tall, crooked cone with a purple band and gold buckle
  H.push(mk((mb) => {
    const hat = { c: C('#2e1a52'), c2: C('#3d2470') };
    at(mb, [0, -0.06, 0]); cylinder(mb, 0.5, 0.016, hat, 40, 0.012);
    let p = [0, -0.05, 0], q = [0, 0, 0, 1], r = 0.26;
    for (let k = 0; k < 4; k++) {
      const h = 0.16, r2 = r * 0.62; at(mb, p, q); cone(mb, r, h + 0.01, hat, 22, r2);
      const R = quatToMat(q); p = [p[0] + R[1] * h, p[1] + R[4] * h, p[2] + R[7] * h]; q = qm(q, ax([1, 0, 0], -0.32)); r = r2;
    }
    at(mb, p, q); cone(mb, r, 0.08, hat, 12, 0.005);
    at(mb, [0, -0.03, 0]); torus(mb, 0.24, 0.035, { c: C('#9b5cff') }, 30, 8);
    at(mb, [0, -0.03, 0.26]); roundBox(mb, [0.05, 0.04, 0.012], 0.01, { c: C('#ffc83d'), mat: MAT.gold });
  }));
  // 25 sundae scoop (EXCLUSIVE) — a melting strawberry scoop with drips, a cream swirl, sprinkles and a cherry
  H.push(mk((mb) => {
    at(mb, [0, -0.08, 0]); sphere(mb, 0.36, { c: C('#ff8fb8'), c2: C('#ffa9c8') }, 22, 0.24);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + 0.3, len = 0.06 + ((k * 37) % 5) * 0.025; at(mb, [Math.sin(a) * 0.335, -0.12 - len / 2, Math.cos(a) * 0.335]); sphere(mb, 0.045, { c: C('#ff8fb8') }, 10, len / 2 + 0.03); }
    at(mb, [0, 0.13, 0]); torus(mb, 0.1, 0.05, { c: C('#fff7ee') }, 22, 8);
    at(mb, [0, 0.19, 0]); sphere(mb, 0.07, { c: C('#fff7ee') }, 12);
    at(mb, [0, 0.29, 0.01]); sphere(mb, 0.06, { c: C('#e0103e') }, 14);
    at(mb, [0, 0, 0]); tube(mb, [[0, 0.33, 0.01], [0.03, 0.4, -0.01], [0.07, 0.44, -0.04]], 0.008, { c: C('#3f8a2b') }, 5);
    const cols = ['#ffd23f', '#36b9ff', '#40e0a8', '#9b5cff', '#ff6f61'];
    for (let k = 0; k < 22; k++) { const a = k * 2.4, el = 0.25 + (k % 4) * 0.22; const p = [Math.sin(a) * Math.cos(el) * 0.36, -0.08 + Math.sin(el) * 0.24, Math.cos(a) * Math.cos(el) * 0.36]; at(mb, p, ax([Math.cos(a), 0.3, Math.sin(a)].map((x) => x / Math.hypot(Math.cos(a), 0.3, Math.sin(a))), k)); capsuleX(mb, 0.009, 0.018, { c: C(cols[k % 5]) }, 6); }
  }));
  // 26 jester hat (EXCLUSIVE) — three floppy prongs in clashing colours, each with a gold bell
  H.push(mk((mb) => {
    const cols = ['#e8202f', '#ffd23f', '#2d6bff'];
    at(mb, [0, -0.08, 0]); sphere(mb, 0.33, { c: C('#e8202f'), c2: C('#2d6bff'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 1.9] }, 22, 0.17);
    at(mb, [0, -0.1, 0]); torus(mb, 0.33, 0.04, { c: C('#ffd23f'), mat: MAT.gold }, 36, 8);
    [[-1, 0], [1, 0], [0, -1]].forEach(([sx, sz], k) => {
      const pts = curve((t) => [sx * (0.1 + t * 0.34), 0.02 + Math.sin(t * Math.PI) * 0.24 - t * 0.12, sz * (0.08 + t * 0.32)], 12);
      at(mb, [0, 0, 0]); tube(mb, pts, 0.055, { c: C(cols[k]) }, 10);
      const e = pts[pts.length - 1]; at(mb, [e[0], e[1] - 0.05, e[2]]); sphere(mb, 0.045, { c: C('#ffc83d'), mat: MAT.gold }, 10);
    });
  }));
  // 27 unicorn horn (EXCLUSIVE) — a pearly spiral horn, little ears and a rainbow mane down the back
  H.push(mk((mb) => {
    at(mb, [0, -0.04, 0.12], ax([1, 0, 0], 0.32)); cone(mb, 0.075, 0.38, { c: C('#fff4fb'), c2: C('#ffd86b'), mat: MAT.flagcloth, uv: spiral }, 18, 0.006);
    for (const sx of [-1, 1]) { at(mb, [sx * 0.2, -0.07, 0.02], ax([0, 0, 1], -sx * 0.35)); cone(mb, 0.06, 0.13, { c: C('#ffffff') }, 10, 0.01); at(mb, [sx * 0.2, -0.06, 0.035], ax([0, 0, 1], -sx * 0.35)); cone(mb, 0.035, 0.09, { c: C('#ffb3d1') }, 8, 0.008); }
    const mane = ['#ff5fa2', '#ffb03a', '#ffe066', '#5fe08a', '#5cc8ff', '#b07bff'];
    for (let k = 0; k < 9; k++) { const p = arc(-0.15 - k * 0.2, 0.44); at(mb, p); sphere(mb, 0.075 - k * 0.003, { c: C(mane[k % 6]) }, 12); }
  }));
  // 28 toadstool cap (EXCLUSIVE) — a big red mushroom cap with white spots
  H.push(mk((mb) => {
    at(mb, [0, -0.1, 0]); sphere(mb, 0.44, { c: C('#e8202f'), c2: C('#ff3b4d') }, 26, 0.27);
    at(mb, [0, -0.11, 0]); torus(mb, 0.42, 0.035, { c: C('#fff4e6') }, 40, 8);
    const spots = [[0, 1.2], [0.9, 0.7], [2.1, 0.9], [3.1, 0.65], [4.2, 0.85], [5.2, 0.7], [1.5, 0.35], [3.8, 0.35], [5.8, 0.4]];
    for (const [a, el] of spots) { const n = [Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)], p = [n[0] * 0.44, -0.1 + n[1] * 0.27, n[2] * 0.44]; at(mb, p, ax([n[2], 0, -n[0]].map((x) => x / (Math.hypot(n[2], n[0]) || 1)), Math.PI / 2 - el), [1, 0.25, 1]); sphere(mb, 0.065, { c: C('#ffffff') }, 12); }
  }));
  // 29 pumpkin head (EXCLUSIVE) — a whole jack-o'-lantern over your head: triangle eyes, a toothy grin, a stem and leaf
  H.push(mk((mb) => {
    const tri = (x, y, cx, cy, s) => { const u = (x - cx) / s, v = (y - cy) / s; return v > -0.55 && v < 0.6 - Math.abs(u) * 1.7; };
    const mouth = (x, y) => Math.abs(x) < 0.21 && y < -0.44 + 0.03 * Math.cos(x * 30) + 0.02 && y > -0.52 - 0.025 * Math.cos(x * 30) - 0.02 * (1 - Math.abs(x) / 0.21);
    at(mb, [0, 0, 0]);
    shell(mb, { c: C('#ff8a1f'), c2: C('#ffa448'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 2.6] }, (x, y, z) => !(z > 0 && (tri(x, y, -0.105, -0.322, 0.11) || tri(x, y, 0.105, -0.322, 0.11) || mouth(x, y))), 0.49, -0.82, 30, 110);
    // candle-lit inside behind the grin (the eye holes stay open so your own eyes peek out)
    at(mb, [0, 0, 0]); shell(mb, { c: C('#ffe24a') }, (x, y, z) => z > 0.2 && Math.abs(x) < 0.25 && y < -0.40 && y > -0.58, 0.468, -0.82, 30, 110);
    at(mb, [0, -0.82, 0]); torus(mb, 0.49, 0.035, { c: C('#e06d0a') }, 48, 8);
    at(mb, [0, 0.07, 0], ax([0, 0, 1], 0.18)); cylinder(mb, 0.05, 0.09, { c: C('#6b4a1f') }, 10, 0.02);
    at(mb, [0.09, 0.1, 0.02], qm(ax([0, 1, 0], 0.6), ax([0, 0, 1], -0.5)), [1, 0.25, 0.6]); sphere(mb, 0.09, { c: C('#3f9a3b') }, 12);
  }));
  // 30 graduation cap (EXCLUSIVE) — a mortarboard with a gold tassel
  H.push(mk((mb) => {
    const blk = { c: C('#22203a') };
    at(mb, [0, -0.07, 0]); cylinder(mb, 0.29, 0.09, blk, 30, 0.03);
    at(mb, [0, 0.03, 0], ax([0, 1, 0], Math.PI / 4)); roundBox(mb, [0.34, 0.014, 0.34], 0.01, blk);
    at(mb, [0, 0.05, 0]); cylinder(mb, 0.03, 0.012, { c: C('#ffc83d'), mat: MAT.gold }, 12, 0.006);
    at(mb, [0, 0, 0]); tube(mb, [[0, 0.055, 0], [0.18, 0.05, 0.05], [0.33, 0.04, 0.1], [0.36, -0.06, 0.11]], 0.009, { c: C('#ffc83d'), mat: MAT.gold }, 5);
    at(mb, [0.36, -0.12, 0.11]); cone(mb, 0.03, 0.08, { c: C('#ffc83d'), mat: MAT.gold }, 10, 0.012);
  }));
  // 31 rubber duck (EXCLUSIVE) — a little yellow duck having a sit on your head
  H.push(mk((mb) => {
    const y = { c: C('#ffd84a'), c2: C('#ffe27a') };
    at(mb, [0, -0.01, -0.03]); sphere(mb, 0.19, y, 18, 0.13);
    at(mb, [0, 0.13, 0.09]); sphere(mb, 0.11, y, 16);
    at(mb, [0, 0.12, 0.2], [0, 0, 0, 1], [1.2, 0.45, 1]); sphere(mb, 0.055, { c: C('#ff8a1f') }, 12);
    for (const sx of [-1, 1]) { at(mb, [sx * 0.05, 0.17, 0.18]); sphere(mb, 0.018, { c: C('#1f1a33') }, 8); }
    at(mb, [0, 0.05, -0.2], ax([1, 0, 0], -0.7)); cone(mb, 0.07, 0.1, y, 12, 0.01);
    for (const sx of [-1, 1]) { at(mb, [sx * 0.17, 0.0, -0.04], ax([0, 0, 1], sx * 0.4), [0.35, 0.5, 1]); sphere(mb, 0.09, y, 10); }
  }));
  // 32 mini UFO (EXCLUSIVE) — a little saucer hovering above your head with glowing lights
  H.push(mk((mb) => {
    at(mb, [0, 0.16, 0]); sphere(mb, 0.3, { c: C('#c9d3e6'), c2: C('#eef2fa'), mat: MAT.gold }, 26, 0.06);
    at(mb, [0, 0.2, 0]); sphere(mb, 0.13, { c: C('#8ff3ff'), c2: C('#c6fbff') }, 18, 0.1);
    const cols = ['#ff5fa2', '#ffe066', '#5fe08a', '#5cc8ff', '#b07bff', '#ff8a3d'];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; at(mb, [Math.sin(a) * 0.255, 0.155, Math.cos(a) * 0.255]); sphere(mb, 0.024, { c: C(cols[k % 6]) }, 8); }
    at(mb, [0, 0.09, 0]); cone(mb, 0.07, 0.04, { c: C('#8a94a8') }, 14, 0.04);
  }));
  // 33 beret — a soft, slouchy beret worn at an angle
  H.push(mk((mb) => {
    at(mb, [0.05, -0.04, 0], ax([0, 0, 1], -0.22)); sphere(mb, 0.33, { c: C('#d6195a'), c2: C('#e8336f') }, 22, 0.08);
    at(mb, [0.02, -0.07, 0], ax([0, 0, 1], -0.22)); torus(mb, 0.27, 0.025, { c: C('#a8124a') }, 30, 6);
    at(mb, [0.07, 0.04, 0], ax([0, 0, 1], -0.22)); cylinder(mb, 0.015, 0.03, { c: C('#a8124a') }, 8, 0.005);
  }));
  // 34 cowboy hat — dented crown, curled brim and a stitched band
  H.push(mk((mb) => {
    const tan = { c: C('#c8894a'), c2: C('#d89a5a') };
    at(mb, [0, -0.05, 0]); lathe(mb, [[0.26, 0, 0, -1], [0.34, 0.0, 0, -1], [0.46, 0.06, 0.3, 0.95], [0.48, 0.09, 1, 0], [0.46, 0.1, -0.3, 0.95], [0.34, 0.025, 0, 1], [0.26, 0.025, 0, 1]], 40, tan);
    at(mb, [0, -0.04, 0], [0, 0, 0, 1], [1, 1, 1.12]); lathe(mb, [[0.25, 0, 1, 0], [0.24, 0.18, 1, 0.2], [0.18, 0.24, 0.3, 1], [0.06, 0.2, 0, 1], [0, 0.22, 0, 1]], 32, tan);
    at(mb, [0, 0.0, 0], [0, 0, 0, 1], [1, 1, 1.12]); torus(mb, 0.25, 0.022, { c: C('#5a3416') }, 32, 6);
  }));
  // 35 bucket hat — a floppy fisherman's hat
  H.push(mk((mb) => {
    const c = { c: C('#14b8b0'), c2: C('#3fd0c8'), mat: MAT.flagcloth, uv: (p) => [0, p[1] * 18] };
    at(mb, [0, -0.08, 0]); lathe(mb, [[0.43, -0.1, 0.3, -0.95], [0.27, 0, 0.5, 0.86], [0.26, 0.17, 1, 0.1], [0.2, 0.22, 0.4, 1], [0, 0.23, 0, 1]], 36, c);
    at(mb, [0, -0.08, 0]); lathe(mb, [[0, 0.0, 0, -1], [0.27, 0.0, 0, -1], [0.43, -0.1, -0.3, -0.95]], 36, { c: C('#0e8a84') });
    at(mb, [0, -0.07, 0]); torus(mb, 0.27, 0.02, { c: C('#0e8a84') }, 32, 6);
  }));
  // 36 santa hat — a floppy red hat with fluffy white trim and a pom-pom
  H.push(mk((mb) => {
    const red = { c: C('#e8202f'), c2: C('#ff3b4d') };
    let p = [0, -0.07, 0], q = [0, 0, 0, 1], r = 0.3;
    for (let k = 0; k < 4; k++) { const h = 0.13, r2 = r * 0.66; at(mb, p, q); cone(mb, r, h + 0.01, red, 22, r2); const R = quatToMat(q); p = [p[0] + R[1] * h, p[1] + R[4] * h, p[2] + R[7] * h]; q = qm(q, ax([0, 0, 1], -0.45)); r = r2; }
    at(mb, p); sphere(mb, 0.065, { c: C('#ffffff') }, 12);
    at(mb, [0, -0.07, 0]); torus(mb, 0.3, 0.06, { c: C('#ffffff') }, 32, 10);
  }));
  // 37 antlers — branching reindeer antlers
  H.push(mk((mb) => {
    const br = { c: C('#8a5a2b'), c2: C('#a06a35') };
    for (const sx of [-1, 1]) {
      const main = curve((t) => [sx * (0.12 + t * 0.3), -0.05 + t * 0.38 - t * t * 0.08, -0.02 - t * 0.06], 10);
      at(mb, [0, 0, 0]); tube(mb, main, 0.03, br, 8);
      for (const [t0, dx, dy] of [[0.35, 0.02, 0.16], [0.65, 0.06, 0.14], [0.9, 0.1, 0.06]]) { const b = main[Math.round(t0 * 10)]; at(mb, [0, 0, 0]); tube(mb, [b, [b[0] + sx * dx * 0.5, b[1] + dy * 0.6, b[2] + 0.03], [b[0] + sx * dx, b[1] + dy, b[2] + 0.05]], 0.022, br, 6); }
    }
  }));
  // 38 punk mohawk — a row of bright spikes from forehead to back
  H.push(mk((mb) => {
    const cols = ['#ff2e88', '#ff4fa0', '#d94dff', '#9b5cff', '#7a5cff', '#5c6bff', '#3c8cff'];
    for (let k = 0; k < 7; k++) { const th = 0.45 - k * 0.3, p = arc(th, 0.4); at(mb, p, ax([1, 0, 0], th), [0.4, 1, 1]); cone(mb, 0.08, 0.2 - Math.abs(k - 2.5) * 0.015, { c: C(cols[k]) }, 12, 0.01); }
  }));
  // 39 big bow — a giant ribbon bow on top
  H.push(mk((mb) => {
    const pk = { c: C('#ff5fa2'), c2: C('#ff86bd'), mat: MAT.flagcloth, uv: (p) => [0, p[0] * 12] };
    for (const sx of [-1, 1]) { at(mb, [sx * 0.15, 0.02, 0], ax([0, 0, 1], sx * 0.3), [1, 0.75, 0.45]); sphere(mb, 0.15, pk, 16); }
    at(mb, [0, 0.02, 0]); sphere(mb, 0.065, { c: C('#e8358a') }, 12);
    for (const sx of [-1, 1]) { at(mb, [0, 0, 0]); tube(mb, [[sx * 0.02, 0.0, 0.02], [sx * 0.08, -0.08, 0.04], [sx * 0.12, -0.15, 0.03]], 0.03, { c: C('#ff5fa2') }, 6); }
  }));
  // 40 flower crown — a ring of little flowers on a leafy vine
  H.push(mk((mb) => {
    at(mb, [0, -0.11, 0]); torus(mb, 0.33, 0.025, { c: C('#3f9a3b') }, 36, 6);
    const cols = ['#ff7ab8', '#ffffff', '#ffd23f', '#c9a6ff', '#ff8a3d', '#5cc8ff', '#ff7ab8', '#ffffff'];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, n = [Math.sin(a), 0.4, Math.cos(a)], L = Math.hypot(...n); flower(mb, [Math.sin(a) * 0.335, -0.09, Math.cos(a) * 0.335], qm(ax([0, 1, 0], a), ax([1, 0, 0], 1.1)), cols[k], 0.06); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.4; at(mb, [Math.sin(a) * 0.34, -0.12, Math.cos(a) * 0.34], ax([0, 1, 0], a), [0.5, 0.2, 1]); sphere(mb, 0.05, { c: C('#5fbf4a') }, 8); }
  }));
  // 41 cat ears — two pointy ears with pink insides
  H.push(mk((mb) => {
    for (const sx of [-1, 1]) {
      at(mb, [sx * 0.2, -0.06, 0.02], qm(ax([0, 0, 1], -sx * 0.32), ax([0, 1, 0], Math.PI / 4)), [1, 1, 0.6]); cone(mb, 0.11, 0.2, { c: C('#2b2350') }, 4, 0.005);
      at(mb, [sx * 0.2, -0.05, 0.05], qm(ax([0, 0, 1], -sx * 0.32), ax([0, 1, 0], Math.PI / 4)), [0.7, 0.75, 0.3]); cone(mb, 0.1, 0.18, { c: C('#ff9ec4') }, 4, 0.005);
    }
  }));
  // 42 foot face (EXCLUSIVE, code "FOOTFACE-3317") — your whole head is a big bare foot standing on end: five toes
  // across the top with shiny toenails (big toe on the left, a few hairs on it), knuckle creases, a pink sole down
  // the back, a plaster on the side and a stripy ankle sock round the bottom. Your eyes peek out of the front.
  H.push(mk((mb) => {
    const skin = { c: C('#f4c4a0'), c2: C('#f8d2b4'), uv: (p) => [p[0], p[1]] }, crease = { c: C('#d99b78') }, nail = { c: C('#fff1ea') };
    const eyes = SKI_HOLES.slice(0, 2).map(([x, y, rx, ry]) => [x, y, rx * 0.95, ry * 0.95]);
    at(mb, [0, 0, 0]); shell(mb, skin, (x, y, z) => !inHole(x, y, z, eyes), 0.455, -0.7, 28, 100);
    for (const [hx, hy, rx, ry] of eyes) { at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = t * Math.PI * 2; return onShell(hx + Math.sin(a) * rx, hy + Math.cos(a) * ry); }, 30), 0.016, crease, 6); }
    // the sole: a pinker oval down the back, and a rounded heel low at the back
    at(mb, [0, 0, 0]); shell(mb, { c: C('#f5b1a2') }, (x, y, z) => z < -0.12 && (x / 0.28) ** 2 + ((y + 0.4) / 0.27) ** 2 < 1, 0.459, -0.7, 28, 100);
    at(mb, [0, -0.6, -0.31], [0, 0, 0, 1], [1.1, 0.75, 0.62]); sphere(mb, 0.21, { c: C('#f4c4a0') }, 22);
    // five toes in a row over the front of the top (big toe on the left), leaning forward, each with a shiny nail
    const TH = 0.35, rot = (v) => [v[0], v[1] * Math.cos(TH) - v[2] * Math.sin(TH), v[1] * Math.sin(TH) + v[2] * Math.cos(TH)];
    const toes = [[-0.2, 0.13], [-0.045, 0.105], [0.085, 0.095], [0.2, 0.084], [0.3, 0.07]]; // x, radius
    toes.forEach(([x, r], k) => {
      const z = 0.16 - k * 0.015, c = [x, -0.4 + Math.sqrt(Math.max(0, 0.455 ** 2 - x * x - z * z)) + r * 0.15, z];
      const on = (lx, ly, lz) => { const v = rot([lx * r, ly * 1.35 * r, lz * 1.05 * r]); return [c[0] + v[0], c[1] + v[1], c[2] + v[2]]; };
      at(mb, c, ax([1, 0, 0], TH), [1, 1.35, 1.05]); sphere(mb, r, skin, 18);
      at(mb, on(0, 0.8, 0.66), ax([1, 0, 0], -0.42), [1, 0.85, 0.28]); sphere(mb, r * 0.62, nail, 14);
      at(mb, on(0, -0.25, 1.0)); capsuleX(mb, 0.007, r * 0.42, crease, 5); // knuckle crease
      if (k === 0) for (const [dx, a] of [[-0.35, 0.5], [0, -0.25], [0.32, 0.25]]) { at(mb, on(dx, 0.2, 1.0), ax([0, 0, 1], Math.PI / 2 + a)); capsuleX(mb, 0.005, 0.045, { c: C('#5b3a28') }, 4); } // big-toe hairs
    });
    // knuckle creases across the top of the foot (the forehead) and the ball of the foot
    for (const y of [-0.13, -0.17]) { at(mb, [0, 0, 0]); tube(mb, curve((t) => onShell(-0.16 + t * 0.32, y + Math.sin(t * Math.PI) * 0.012, 0.458), 12), 0.007, crease, 5); }
    // a plaster on the side
    at(mb, [-0.405, -0.47, 0.13], ax([0, 1, 0], -1.27)); roundBox(mb, [0.07, 0.03, 0.01], 0.012, { c: C('#e8b98d') });
    at(mb, [-0.412, -0.47, 0.135], ax([0, 1, 0], -1.27)); roundBox(mb, [0.026, 0.024, 0.008], 0.008, { c: C('#f5dcc0') });
    // stripy ankle sock
    at(mb, [0, -0.7, 0]); cylinder(mb, 0.47, 0.11, { c: C('#ffffff'), c2: C('#ff5a5a'), mat: MAT.flagcloth, uv: (p) => [0, p[1] * 28] }, 48, 0.02);
    at(mb, [0, -0.645, 0]); torus(mb, 0.47, 0.03, { c: C('#ffffff'), c2: C('#e6e6ef'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 14] }, 48, 8);
  }));
  // 43 heist mask (EXCLUSIVE, code "BIGHEIST-5082") — a glossy white face mask with sly slanted eye holes, a painted
  // grin with one gold tooth and red cheek stripes, held on by a strap, under a black knitted cap with a gold coin
  H.push(mk((mb) => {
    const white = { c: C('#fbf8f2') }, ink = { c: C('#241a33') }, red = { c: C('#e8333f') };
    const eyes = [[-0.11, -0.32, 0.36], [0.11, -0.32, -0.36]]; // x, y, slant
    const inEye = (x, y) => eyes.some(([ex, ey, sl]) => { const dx = x - ex, dy = y - ey, c = Math.cos(sl), s = Math.sin(sl), u = dx * c + dy * s, v = -dx * s + dy * c; return (u / 0.078) ** 2 + (v / 0.04) ** 2 < 1; });
    const inMask = (x, y, z) => z > 0.1 && (x / 0.335) ** 2 + ((y + 0.4) / 0.25) ** 2 < 1;
    at(mb, [0, 0, 0]); shell(mb, white, (x, y, z) => inMask(x, y, z) && !inEye(x, y), 0.47, -0.74, 30, 110);
    at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = t * Math.PI * 2; return onShell(Math.sin(a) * 0.335, -0.4 + Math.cos(a) * 0.25, 0.47); }, 48), 0.014, { c: C('#d9d2c4') }, 6);
    for (const [ex, ey, sl] of eyes) { at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = t * Math.PI * 2, u = Math.sin(a) * 0.078, v = Math.cos(a) * 0.04, c = Math.cos(sl), s = Math.sin(sl); return onShell(ex + u * c - v * s, ey + u * s + v * c, 0.472); }, 30), 0.011, ink, 6); }
    // painted grin with tooth lines and one gold tooth
    const grin = (t) => { const x = -0.14 + t * 0.28; return onShell(x, -0.5 + (x / 0.14) ** 2 * 0.045, 0.474); };
    at(mb, [0, 0, 0]); tube(mb, curve(grin, 20), 0.012, ink, 6);
    at(mb, [0, 0, 0]); tube(mb, curve((t) => { const p = grin(0.12 + t * 0.76); return [p[0], p[1] - 0.035 + Math.sin(t * Math.PI) * 0.0, p[2] - 0.004]; }, 16), 0.009, ink, 6);
    for (let k = 1; k < 6; k++) { const p = grin(0.12 + (k / 6) * 0.76); at(mb, [p[0], p[1] - 0.018, p[2] + 0.002]); roundBox(mb, [0.003, 0.016, 0.004], 0.002, ink); }
    { const p = grin(0.62); at(mb, [p[0] + 0.012, p[1] - 0.018, p[2] + 0.004]); roundBox(mb, [0.016, 0.014, 0.006], 0.004, { c: C('#ffd23f'), mat: MAT.gold }); }
    for (const sx of [-1, 1]) for (const dy of [0, -0.035]) { const p = onShell(sx * 0.22, -0.43 + dy, 0.473); at(mb, p, qm(ax([0, 1, 0], Math.atan2(p[0], p[2])), ax([0, 0, 1], sx * 0.25))); roundBox(mb, [0.045, 0.008, 0.006], 0.005, red); }
    // strap round the back
    at(mb, [0, 0, 0]); tube(mb, curve((t) => { const a = Math.PI * (0.34 + t * 1.32); return [Math.sin(a) * 0.42, -0.4, Math.cos(a) * 0.42]; }, 30), 0.022, ink, 6);
    // black knitted beanie (snug, a bit slouchy) with a rolled cuff over the top of the mask and a gold coin badge
    at(mb, [0, 0.051, 0], [0, 0, 0, 1], [1, 1.3, 1]); shell(mb, { c: C('#2a2338'), c2: C('#3b3350'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 10] }, (x, y) => y > -0.147, 0.43, -0.74, 26, 80);
    at(mb, [0, -0.14, 0]); torus(mb, 0.363, 0.042, { c: C('#3b3350'), c2: C('#4a4163'), mat: MAT.flagcloth, uv: (p) => [0, Math.atan2(p[2], p[0]) * 18] }, 56, 10);
    const n = [0, 0.656, 0.755];
    at(mb, [0, -0.05 + n[1] * 0.012, 0.285 + n[2] * 0.012], ax([1, 0, 0], 0.855)); cylinder(mb, 0.05, 0.014, { c: C('#ffd23f'), mat: MAT.gold }, 22, 0.006);
    at(mb, [0, -0.05 + n[1] * 0.024, 0.285 + n[2] * 0.024], ax([1, 0, 0], -0.715)); roundBox(mb, [0.008, 0.028, 0.004], 0.004, { c: C('#c79a10'), mat: MAT.gold });
  }));
  return H;
}

// ---------------- level meshes ----------------
const rgb = (h) => (typeof h === 'string' ? hex2rgb(h) : h || [1, 1, 1]);
function colliderStyle(c) {
  const vis = c.vis || {}, m = vis.m || 'plain', mat = MATID(m);
  const s = { c: rgb(vis.c || '#ffffff'), c2: rgb(vis.c2 || vis.c || '#ffffff'), mat, aux: 0 };
  if (c.shape === 'box') {
    if (m === 'conveyor') { s.aux = vis.spd || 0; s.uv = (p) => [p[0] / c.h[0], p[2]]; }
    else if (m === 'door' || m === 'slab') s.uv = (p) => [p[0] / c.h[0], p[1] / c.h[1]];
  }
  if (c.shape === 'cyl') { s.uv = (p) => [p[0], p[2]]; s.aux = c.r; }
  if (c.shape === 'cap') s.uv = (p) => [p[1], 0];
  return s;
}
function emitShape(mb, c, s) {
  if (c.shape === 'box') roundBox(mb, c.h, Math.min(0.24, Math.min(c.h[0], c.h[1], c.h[2]) * 0.5), s);
  else if (c.shape === 'cyl') cylinder(mb, c.r, c.hh, s, 0, Math.min(0.2, c.hh * 0.6));
  else if (c.shape === 'sph') sphere(mb, c.r, s, 20);
  else if (c.shape === 'cap') capsuleX(mb, c.r, c.hl, s, 14);
}

function buildLevelMeshes(R, level, world) {
  const out = { chunks: [], kin: [], dyn: null, lasers: [], decor: null, text: [], props: null };
  const groups = new Map();
  const dyn = new MB();
  for (const c of world.cols) {
    const s = colliderStyle(c);
    if (c.kin) { const mb = new MB(); emitShape(mb, c, s); out.kin.push({ c, mesh: mb.build(R) }); continue; }
    if (c.dyn >= 0) {
      s.aux = c.dyn; dyn.xf(c.m0, c.p);
      if (c.tag === 'tile') { s.mat = MAT.tile; s.uv = null; hexTile(dyn, 1.3, c.hh, { ...s, uv: null }); }
      else emitShape(dyn, c, s);
      continue;
    }
    const key = level.type === 'survival' || level.type === 'lobby' ? 0 : Math.floor(c.p[2] / 32);
    let g = groups.get(key); if (!g) groups.set(key, (g = { mb: new MB(), mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }));
    g.mb.xf(c.m0, c.p); emitShape(g.mb, c, s);
    for (let i = 0; i < 3; i++) { g.mn[i] = Math.min(g.mn[i], c.aabb[i]); g.mx[i] = Math.max(g.mx[i], c.aabb[i + 3]); }
  }
  // decor (static, merged into a chunk of its own)
  const dec = new MB(); const dmn = [1e9, 1e9, 1e9], dmx = [-1e9, -1e9, -1e9];
  for (const d of level.decor || []) decorShape(dec, d, out, dmn, dmx);
  for (const [, g] of groups) if (!g.mb.empty) out.chunks.push({ mesh: g.mb.build(R), mn: g.mn, mx: g.mx });
  if (!dec.empty) out.chunks.push({ mesh: dec.build(R), mn: dmn, mx: dmx });
  if (!dyn.empty) out.dyn = dyn.build(R);
  // lasers: emissive kinematic triggers
  for (const t of world.trigs) {
    if (t.kind !== 'laser') continue;
    const mb = new MB(), low = t.vis && t.vis.low, hi = t.vis && t.vis.high;
    const col = hi ? [1, 0.35, 0.9] : low ? [1, 0.25, 0.3] : [1, 0.2, 0.45];
    if (t.shape === 'cap') capsuleX(mb, t.r * 0.9, t.hl, { c: col, mat: MAT.laser }, 10);
    else roundBox(mb, [t.h[0], t.h[1], t.h[2] * 0.6], 0.05, { c: col, mat: MAT.laser });
    out.lasers.push({ c: t, mesh: mb.build(R), col });
  }
  out.props = buildBackdrop(R, level);
  return out;
}

function decorShape(mb, d, out, mn, mx) {
  const v = d.vis || {}, c = rgb(v.c), c2 = rgb(v.c2 || v.c);
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1], p = d.p;
  const grow = (x0, y0, z0, x1, y1, z1) => { mn[0] = Math.min(mn[0], x0); mn[1] = Math.min(mn[1], y0); mn[2] = Math.min(mn[2], z0); mx[0] = Math.max(mx[0], x1); mx[1] = Math.max(mx[1], y1); mx[2] = Math.max(mx[2], z1); };
  if (d.shape === 'sph') { mb.xf(I, p); sphere(mb, d.r, { c, mat: MAT.plain }, 18); grow(p[0] - d.r, p[1] - d.r, p[2] - d.r, p[0] + d.r, p[1] + d.r, p[2] + d.r); }
  else if (d.shape === 'box') { mb.xf(I, p); roundBox(mb, d.h, Math.min(0.02, d.h[1] * 0.5), { c, mat: MAT.plain }); grow(p[0] - d.h[0], p[1] - d.h[1], p[2] - d.h[2], p[0] + d.h[0], p[1] + d.h[1], p[2] + d.h[2]); } // painted lines
  else if (d.shape === 'gate' || d.shape === 'arch') {
    const w = d.w / 2, h = d.h;
    for (const s of [-1, 1]) { mb.xf(I, [p[0] + s * (w + 0.6), p[1] + h / 2, p[2]]); roundBox(mb, [0.6, h / 2, 0.6], 0.25, { c, c2, mat: MAT.stripes }); }
    mb.xf(I, [p[0], p[1] + h + 0.7, p[2]]); roundBox(mb, [w + 1.2, 0.8, 0.6], 0.3, { c: d.shape === 'arch' ? [1, 1, 1] : c2, c2: [0.12, 0.08, 0.2], mat: d.shape === 'arch' ? MAT.checker : MAT.plain });
    for (const s of [-1, 1]) { mb.xf(I, [p[0] + s * (w + 0.6), p[1] + h + 1.9, p[2]]); sphere(mb, 0.55, { c: c2 }, 14); }
    if (v.text) out.text.push({ text: v.text, p: [p[0], p[1] + h + 0.72, p[2] - 0.62], w: Math.min(d.w * 0.6, v.text.length * 1.4), h: 1.2 }, { text: v.text, p: [p[0], p[1] + h + 0.72, p[2] + 0.62], w: Math.min(d.w * 0.6, v.text.length * 1.4), h: 1.2, back: true });
    grow(p[0] - w - 1.5, p[1], p[2] - 1, p[0] + w + 1.5, p[1] + h + 2.5, p[2] + 1);
  } else if (d.shape === 'flag') {
    mb.xf(I, [p[0], p[1] + 2.2, p[2]]); cylinder(mb, 0.07, 2.2, { c: [1, 1, 1] }, 8, 0.03);
    mb.xf(I, [p[0] + (p[0] < 0 ? 0.6 : -0.6), p[1] + 3.8, p[2]]); roundBox(mb, [0.6, 0.4, 0.04], 0.03, { c, c2: [1, 1, 1], mat: MAT.flagcloth, uv: (q) => [q[0], q[1] * 1.2] });
    mb.xf(I, [p[0], p[1] + 4.5, p[2]]); sphere(mb, 0.13, { c: [1, 0.85, 0.2] }, 10);
    grow(p[0] - 1.3, p[1], p[2] - 0.2, p[0] + 1.3, p[1] + 4.7, p[2] + 0.2);
  } else if (d.shape === 'ring') {
    mb.xf(I, p); torus(mb, d.r, 0.35, { c, mat: MAT.plain }, Math.max(32, Math.round(d.r * 4)), 10);
    grow(p[0] - d.r - 0.4, p[1] - 0.4, p[2] - d.r - 0.4, p[0] + d.r + 0.4, p[1] + 0.4, p[2] + d.r + 0.4);
  } else if (d.shape === 'pillar') {
    mb.xf(I, [p[0], p[1] + d.h / 2, p[2]]); cylinder(mb, d.r, d.h / 2, { c, c2, mat: MAT.stripes }, 28, 0.3);
    grow(p[0] - d.r, p[1], p[2] - d.r, p[0] + d.r, p[1] + d.h, p[2] + d.r);
  } else if (d.shape === 'fan') { // wind fan housing facing along x (blades are separate spinning ghost colliders)
    const R = quatToMat([0, 0, Math.SQRT1_2, Math.SQRT1_2]), dir = d.dir || 1;
    mb.xf(R, p); torus(mb, d.r, 0.3, { c, mat: MAT.plain }, 32, 10);
    mb.xf(R, [p[0] - dir * 0.45, p[1], p[2]]); cylinder(mb, 0.5, 0.42, { c: c2, mat: MAT.plain }, 16, 0.12);
    for (const a of [0, 1, 2, 3]) { const an = (a / 4) * Math.PI * 2; mb.xf(R, [p[0] - dir * 0.6, p[1] + Math.cos(an) * d.r * 0.55, p[2] + Math.sin(an) * d.r * 0.55]); cylinder(mb, 0.07, d.r * 0.5, { c, mat: MAT.plain }, 6, 0.02); }
    grow(p[0] - 1, p[1] - d.r - 0.4, p[2] - d.r - 0.4, p[0] + 1, p[1] + d.r + 0.4, p[2] + d.r + 0.4);
  } else if (d.shape === 'cannon') { // barrel pointing toward -z, or toward `yaw` when given
    if (d.yaw === undefined) {
      mb.xf(I, [p[0], p[1] + 0.5, p[2]]); roundBox(mb, [0.8, 0.5, 0.8], 0.25, { c: c2 });
      const q = [Math.sin(-0.6), 0, 0, Math.cos(-0.6)];
      mb.xf(quatToMat(q), [p[0], p[1] + 1.25, p[2] - 0.2]); cylinder(mb, 0.55, 0.9, { c, c2, mat: MAT.stripes }, 18, 0.15);
    } else {
      const cy = Math.cos(d.yaw / 2), sy = Math.sin(d.yaw / 2), sx = Math.sin(0.6), cx = Math.cos(0.6); // yaw, then tip the barrel 1.2 rad forward
      mb.xf(quatToMat([0, sy, 0, cy]), [p[0], p[1] + 0.5, p[2]]); roundBox(mb, [0.8, 0.5, 0.8], 0.25, { c: c2 });
      mb.xf(quatToMat([cy * sx, sy * cx, -sy * sx, cy * cx]), [p[0] + Math.sin(d.yaw) * 0.2, p[1] + 1.25, p[2] + Math.cos(d.yaw) * 0.2]); cylinder(mb, 0.55, 0.9, { c, c2, mat: MAT.stripes }, 18, 0.15);
    }
    grow(p[0] - 1.5, p[1], p[2] - 1.5, p[0] + 1.5, p[1] + 2.4, p[2] + 1.5);
  }
}

// floating candy props around the course (purely visual, deterministic per level)
function buildBackdrop(R, level) {
  const mb = new MB();
  let seed = 1234567 + level.id.length * 999;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cols = ['#ff5fa2', '#8b4dff', '#ffd23f', '#36b9ff', '#40e0a8', '#ff8a3d', '#b07bff', '#9be15d'].map(hex2rgb);
  let zMin = -20, zMax = 40, xR = 30;
  for (const c of level.colliders) { zMin = Math.min(zMin, c.p[2]); zMax = Math.max(zMax, c.p[2]); xR = Math.max(xR, Math.abs(c.p[0]) + 10); }
  const cx = 0, cz = (zMin + zMax) / 2, span = (zMax - zMin) / 2 + 60;
  for (let k = 0; k < 46; k++) {
    const a = rnd() * Math.PI * 2, r = Math.max(xR + 25, 55) + rnd() * 90;
    const x = cx + Math.cos(a) * r * 1.1, z = cz + Math.sin(a) * Math.max(r, span * (0.55 + rnd() * 0.6));
    const y = -6 + rnd() * 50, col = cols[k % cols.length], col2 = cols[(k + 3) % cols.length];
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const kind = k % 6;
    if (kind === 0) { mb.xf(I, [x, y, z]); sphere(mb, 3 + rnd() * 6, { c: col, c2: col2, mat: MAT.stripes }, 20); }
    else if (kind === 1) { mb.xf(quatToMat([Math.sin(rnd()), 0, 0, Math.cos(rnd())]), [x, y, z]); torus(mb, 5 + rnd() * 6, 1 + rnd(), { c: col }, 36, 10); }
    else if (kind === 2) { mb.xf(I, [x, y - 20, z]); cylinder(mb, 2 + rnd() * 2, 20 + rnd() * 10, { c: col, c2: col2, mat: MAT.stripes }, 24, 1); mb.xf(I, [x, y + 10, z]); sphere(mb, 4, { c: col2 }, 16); }
    else if (kind === 3) { mb.xf(quatToMat([0, Math.sin(rnd() * 3), 0, Math.cos(rnd() * 3)]), [x, y, z]); roundBox(mb, [3 + rnd() * 4, 3 + rnd() * 4, 3 + rnd() * 4], 1.2, { c: col, c2: col2, mat: MAT.checker }); }
    else if (kind === 4) { for (let j = 0; j < 4; j++) { mb.xf(I, [x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 6, z + (rnd() - 0.5) * 10]); sphere(mb, 2.5 + rnd() * 3, { c: [1, 1, 1], mat: MAT.cloud }, 14); } }
    else { mb.xf(I, [x, y, z]); cone(mb, 3 + rnd() * 2, 8 + rnd() * 8, { c: col, c2: col2, mat: MAT.flagcloth, uv: (p) => [0, p[1] * 0.4] }, 20); }
  }
  return mb.build(R);
}

// Hoop Hunt hoop: a chunky candy ring with a soft inner glow band (built in the XZ plane; drawn upright)
function buildHoop(R, gold) {
  const mb = new MB();
  torus(mb, 1.22, 0.16, gold ? { c: hex2rgb('#ffc83d'), mat: MAT.gold } : { c: hex2rgb('#36d6ff'), c2: hex2rgb('#ffffff'), mat: MAT.stripes }, 40, 12);
  torus(mb, 1.02, 0.05, { c: hex2rgb(gold ? '#fff6b0' : '#c8fbff') }, 40, 6);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; mb.xf([1, 0, 0, 0, 1, 0, 0, 0, 1], [Math.cos(a) * 1.22, 0, Math.sin(a) * 1.22]); sphere(mb, 0.2, { c: hex2rgb(gold ? '#ff5fa2' : '#ffd23f') }, 10); }
  return mb.build(R);
}

// crown objective mesh
function buildCrown(R) {
  const mb = new MB(); const gold = { c: hex2rgb('#ffc83d'), mat: MAT.gold };
  mb.xf([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, -0.15, 0]); cylinder(mb, 0.55, 0.14, gold, 32, 0.06);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    mb.xf([1, 0, 0, 0, 1, 0, 0, 0, 1], [Math.cos(a) * 0.48, -0.02, Math.sin(a) * 0.48]); cone(mb, 0.16, 0.5, gold, 10);
    mb.xf([1, 0, 0, 0, 1, 0, 0, 0, 1], [Math.cos(a) * 0.48, 0.52, Math.sin(a) * 0.48]); sphere(mb, 0.08, { c: hex2rgb(['#ff2e88', '#36b9ff', '#40e0a8'][k % 3]) }, 10);
  }
  return mb.build(R);
}
function buildBoulder(R) { const mb = new MB(); sphere(mb, 1.3, { c: hex2rgb('#7b55c9'), c2: hex2rgb('#a98cf0'), mat: MAT.boulder, uv: (p) => [p[0] + p[2], p[1]] }, 22); return mb.build(R); }
function buildDoorPanel(R) { const mb = new MB(); roundBox(mb, [1.88, 1.5, 0.24], 0.12, { c: [1, 1, 1], c2: [1, 1, 1], mat: MAT.door, uv: (p) => [p[0] / 1.88, p[1] / 1.5] }); return mb.build(R); }
function buildPedestal(R) {
  const mb = new MB();
  cylinder(mb, 2.2, 0.35, { c: hex2rgb('#ffd23f'), c2: hex2rgb('#ffffff'), mat: MAT.bumper, aux: 2.2 }, 48, 0.15);
  mb.xf([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, -0.9, 0]); cylinder(mb, 1.8, 0.6, { c: hex2rgb('#ff5fa2'), c2: hex2rgb('#ffffff'), mat: MAT.stripes }, 48, 0.2);
  return mb.build(R);
}
function buildPodium(R) {
  const mb = new MB(), I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const blocks = [[0, 1.6, '#ffc83d'], [-2.6, 1.0, '#c9d2e3'], [2.6, 0.65, '#ff9a5a']];
  for (const [x, h, col] of blocks) { mb.xf(I, [x, h / 2, 0]); roundBox(mb, [1.25, h / 2, 1.25], 0.2, { c: hex2rgb(col), c2: [1, 1, 1], mat: MAT.slab, uv: (p) => [p[0] / 1.25, p[1] / (h / 2)] }); }
  mb.xf(I, [0, -0.25, 0]); cylinder(mb, 7, 0.25, { c: hex2rgb('#b07bff'), c2: hex2rgb('#d7b8ff'), mat: MAT.rings }, 64, 0.15);
  return mb.build(R);
}


export { MB, roundBox, cylinder, lathe, sphere, capsuleX, cone, torus, hexTile, buildBean, BEAN_RIG, tube, HAT_EMIT, buildHats, buildLevelMeshes, buildHoop, buildCrown, buildBoulder, buildDoorPanel, buildPedestal, buildPodium };
