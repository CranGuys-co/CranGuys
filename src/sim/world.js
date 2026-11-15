// CranGuys — World: colliders + kinematic poses + dynamic state (falling tiles, broken doors, boulders).
import { prepCollider, poseAt, contactSeg, rayCollider, worldAABB, makeHit } from './collide.js';
import { mtv, mv } from './math.js';
const NEVER = 0x7fffffff;
// Is a (possibly cycling) wind trigger blowing at time t?
function windOn(c, t) {
  const y = c.cyc; if (!y) return true;
  const u = (((t + y.ph) % y.period) + y.period) % y.period;
  return u < y.on;
}
// Rising slime (Slime Surge): the surface height at time t, or null when the level has a fixed kill plane.
function slimeAt(rise, t) {
  if (!rise) return null;
  return Math.min(rise.max, rise.y0 + rise.rate * Math.max(0, t - rise.t0));
}
const CELL = 4;
const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

class World {
  constructor(def) {
    this.def = def;
    this.cols = def.colliders.map((c, i) => prepCollider(c, i));
    this.trigs = (def.triggers || []).map((c, i) => prepCollider(c, i));
    this.kin = this.cols.filter((c) => c.kin);
    this.kinTrig = this.trigs.filter((c) => c.kin);
    this.hasWind = this.trigs.some((c) => c.kind === 'wind');
    this.ndyn = def.ndyn || 0;
    this.dead = new Int32Array(this.ndyn).fill(NEVER);  // tick at which a dynamic collider disappears
    this.balls = [];                                    // dynamic spheres {id, p, v, r}
    this.grid = new Map();
    this.stamp = new Int32Array(this.cols.length);
    this.qn = 0;
    this.t = -1;
    for (const c of this.cols) {
      if (c.kin) continue;
      const a = c.aabb;
      for (let ix = Math.floor(a[0] / CELL); ix <= Math.floor(a[3] / CELL); ix++)
        for (let iz = Math.floor(a[2] / CELL); iz <= Math.floor(a[5] / CELL); iz++) {
          const k = key(ix, iz); let arr = this.grid.get(k); if (!arr) this.grid.set(k, (arr = [])); arr.push(c.id);
        }
    }
    this.hit = makeHit();
    this._p2 = [0, 0, 0]; this._m2 = new Array(9); this._l = [0, 0, 0];
  }

  setTime(t) {
    if (t === this.t) return;
    this.t = t;
    for (const c of this.kin) poseAt(c, t, c.wp, c.wm);
    for (const c of this.kinTrig) poseAt(c, t, c.wp, c.wm);
  }

  alive(c, tick) { return c.dyn < 0 || tick < this.dead[c.dyn]; }
  kill(dyn, tick) { if (dyn >= 0 && tick < this.dead[dyn]) this.dead[dyn] = tick; }
  isDead(dyn, tick) { return tick >= this.dead[dyn]; }

  // Visit colliders whose bounds touch the sphere (x,y,z,rad). Return true from fn to stop early.
  near(x, y, z, rad, tick, fn) {
    const qn = ++this.qn, st = this.stamp;
    const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL), z0 = Math.floor((z - rad) / CELL), z1 = Math.floor((z + rad) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const arr = this.grid.get(key(ix, iz)); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const id = arr[i]; if (st[id] === qn) continue; st[id] = qn;
        const c = this.cols[id], a = c.aabb;
        if (x + rad < a[0] || x - rad > a[3] || y + rad < a[1] || y - rad > a[4] || z + rad < a[2] || z - rad > a[5]) continue;
        if (c.dyn >= 0 && tick >= this.dead[c.dyn]) continue;
        if (fn(c) === true) return;
      }
    }
    for (let i = 0; i < this.kin.length; i++) {
      const c = this.kin[i];
      if (c.dyn >= 0 && tick >= this.dead[c.dyn]) continue;
      const dx = c.wp[0] - x, dy = c.wp[1] - y, dz = c.wp[2] - z, rr = c.br + rad;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      if (fn(c) === true) return;
    }
  }

  // Velocity of the collider surface at world point x (moving platforms, sweepers, conveyors).
  surfVel(c, x, out) {
    if (!c.kin) {
      if (c.conv) { out[0] = c.conv[0]; out[1] = c.conv[1]; out[2] = c.conv[2]; } else { out[0] = out[1] = out[2] = 0; }
      return out;
    }
    const h = 1 / 240, L = this._l, P2 = this._p2, M2 = this._m2;
    L[0] = x[0] - c.wp[0]; L[1] = x[1] - c.wp[1]; L[2] = x[2] - c.wp[2];
    mtv(c.wm, L, L);
    poseAt(c, this.t + h, P2, M2);
    mv(M2, L, L);
    out[0] = (P2[0] + L[0] - x[0]) / h; out[1] = (P2[1] + L[1] - x[1]) / h; out[2] = (P2[2] + L[2] - x[2]) / h;
    if (c.conv) { out[0] += c.conv[0]; out[1] += c.conv[1]; out[2] += c.conv[2]; }
    return out;
  }

  // Is a capsule (a,b,r) overlapping any solid collider?
  overlaps(a, b, r, tick, skip) {
    let hit = false; const H = this.hit;
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, cz = (a[2] + b[2]) / 2, rad = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 2 + r;
    this.near(cx, cy, cz, rad, tick, (c) => { if (c === skip || c.ghost) return; if (contactSeg(c, a, b, r, H) && H.d > 0.01) { hit = true; return true; } });
    return hit;
  }

  // Ray cast against solid colliders. Returns {t, n, c} or null.
  raycast(o, d, maxT, tick, filter) {
    let best = maxT, bc = null; const n = [0, 0, 0], bn = [0, 1, 0];
    const ex = o[0] + d[0] * maxT, ez = o[2] + d[2] * maxT;
    const cx = (o[0] + ex) / 2, cz = (o[2] + ez) / 2, cy = o[1] + d[1] * maxT / 2;
    const rad = maxT / 2 + 0.5;
    const test = (c) => {
      if (c.ghost || (filter && !filter(c))) return;
      const t = rayCollider(c, o, d, best, n);
      if (t < best) { best = t; bc = c; bn[0] = n[0]; bn[1] = n[1]; bn[2] = n[2]; }
    };
    if (rad < 24) this.near(cx, cy, cz, rad, tick, test);
    else { for (const c of this.cols) if (this.alive(c, tick)) test(c); }
    return bc ? { t: best, n: bn, c: bc } : null;
  }

  // Highest walkable surface below (x, yTop, z) within maxDown.
  groundBelow(x, yTop, z, maxDown, tick) {
    const r = this.raycast([x, yTop, z], [0, -1, 0], maxDown, tick);
    return r && r.n[1] > 0.5 ? { y: yTop - r.t, c: r.c, n: r.n } : null;
  }

  trigAt(kind, a, b, r, tick, fn) {
    const H = this.hit;
    for (const c of this.trigs) {
      if (c.kind !== kind) continue;
      if (c.dyn >= 0 && tick >= this.dead[c.dyn]) continue;
      const dx = c.wp[0] - a[0], dy = c.wp[1] - a[1], dz = c.wp[2] - a[2], rr = c.br + r + 1;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      if (contactSeg(c, a, b, r, H)) fn(c, H);
    }
  }
}



export { NEVER, windOn, slimeAt, World, worldAABB };
