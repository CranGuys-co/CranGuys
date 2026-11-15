// CranGuys — cameras: third-person orbit follow with collision, intro fly-overs, spectating, podium & menu shots.
import { clamp, damp, wrapPi } from '../sim/math.js';
import { pathAt } from '../levels/kit.js';
import { settings } from '../util.js';
class Cam {
  constructor() {
    this.yaw = 0; this.pitch = 0.34; this.dist = 7.4; this.fov = 1.08;
    this.eye = [0, 6, -10]; this.look = [0, 1, 0]; this.tgt = null; this.shakeT = 0; this.shakeA = 0;
  }
  reset(yaw = 0, pos = null) { this.yaw = yaw; this.pitch = 0.34; this.tgt = pos ? [pos[0], pos[1] + 1.2, pos[2]] : null; }
  shake(a, t = 0.35) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = Math.max(this.shakeT, t); }

  follow(dt, pos, vel, world, inp, tick) {
    this.yaw += inp.camDX * settings.sens; this.pitch = clamp(this.pitch + inp.camDY * settings.sens, -0.3, 1.15);
    const sp = Math.hypot(vel[0], vel[2]);
    // gentle auto-follow behind the direction of travel when the player isn't steering the camera
    if (settings.autoCam && performance.now() - (inp.lastCam || 0) > 900 && sp > 2.5) {
      const want = Math.atan2(vel[0], vel[2]), d = wrapPi(want - this.yaw);
      if (Math.abs(d) < 2.2) this.yaw += d * Math.min(1, dt * 0.9 * clamp(sp / 7, 0, 1));
    }
    const t = [pos[0], pos[1] + 1.25, pos[2]];
    if (!this.tgt) this.tgt = t.slice();
    this.tgt[0] = damp(this.tgt[0], t[0], 16, dt); this.tgt[2] = damp(this.tgt[2], t[2], 16, dt); this.tgt[1] = damp(this.tgt[1], t[1], 7, dt);
    if (Math.abs(this.tgt[1] - t[1]) > 6) this.tgt[1] = t[1];
    const cp = Math.cos(this.pitch), dir = [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
    let dist = this.dist;
    if (world) {
      const hit = world.raycast(this.tgt, dir, dist + 0.4, tick, (c) => !c.kin || c.shape !== 'cap');
      if (hit) dist = Math.max(1.6, hit.t - 0.45);
    }
    this.curDist = this.curDist === undefined ? dist : dist < this.curDist ? dist : damp(this.curDist, dist, 4, dt);
    this.eye = [this.tgt[0] + dir[0] * this.curDist, this.tgt[1] + dir[1] * this.curDist, this.tgt[2] + dir[2] * this.curDist];
    this.look = [this.tgt[0], this.tgt[1] + 0.15, this.tgt[2]];
    this.fov = damp(this.fov, 1.08 + clamp((sp - 7) * 0.012, 0, 0.12), 4, dt);
    this.applyShake(dt);
  }

  intro(u, keys) {
    const e = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    const k = e(clamp(u, 0, 1));
    this.eye = pathAt(keys.map((q) => q.e), k); this.look = pathAt(keys.map((q) => q.l), k); this.fov = 1.0;
    this.tgt = null;
  }
  orbit(center, r, h, speed, t, fov = 0.9) {
    const a = t * speed;
    this.eye = [center[0] + Math.sin(a) * r, center[1] + h, center[2] + Math.cos(a) * r]; this.look = center.slice(); this.fov = fov;
  }
  fixed(eye, look, fov = 0.85) { this.eye = eye; this.look = look; this.fov = fov; }
  applyShake(dt) {
    if (this.shakeT <= 0) return;
    this.shakeT -= dt; const a = this.shakeA * Math.max(0, this.shakeT) * 2.5;
    this.eye = [this.eye[0] + (Math.random() - 0.5) * a, this.eye[1] + (Math.random() - 0.5) * a, this.eye[2] + (Math.random() - 0.5) * a];
    if (this.shakeT <= 0) this.shakeA = 0;
  }
}


export { Cam };
