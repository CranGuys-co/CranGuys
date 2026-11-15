// CranGuys — scene rendering: level, obstacles, beans, particles, sky, slime, menu stage and podium.
import { Renderer, m4 } from './gl.js';
import { buildBean, buildHats, buildLevelMeshes, buildCrown, buildBoulder, buildDoorPanel, buildPedestal, buildPodium, buildHoop, HAT_EMIT } from './geo.js';
import { BeanVis } from './bean.js';
import { poseAt } from '../sim/collide.js';
import { crownAt } from '../levels/crownpeak.js';
import { qt, v3 } from '../sim/math.js';
import { MODE } from '../sim/config.js';
const N = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const THEMES = {
  day: { top: [0.3, 0.6, 1.0], hor: [0.99, 0.86, 0.96], bot: [0.98, 0.62, 0.86], sun: N([-0.42, 0.8, -0.44]), sunCol: [1.0, 0.95, 0.86], sky: [0.66, 0.76, 1.0], gnd: [0.98, 0.74, 0.88], fog: [0.98, 0.86, 0.96], fogR: [110, 470], slime: [1.0, 0.38, 0.74], slime2: [0.86, 0.2, 0.62] },
  dusk: { top: [0.3, 0.26, 0.82], hor: [1.0, 0.68, 0.78], bot: [0.62, 0.32, 0.78], sun: N([0.45, 0.66, -0.5]), sunCol: [1.0, 0.88, 0.8], sky: [0.66, 0.62, 1.0], gnd: [0.88, 0.58, 0.86], fog: [0.95, 0.7, 0.86], fogR: [90, 400], slime: [0.66, 0.3, 0.98], slime2: [0.44, 0.16, 0.8] },
  sunset: { top: [0.42, 0.4, 0.95], hor: [1.0, 0.74, 0.6], bot: [1.0, 0.56, 0.62], sun: N([0.3, 0.55, -0.78]), sunCol: [1.0, 0.86, 0.68], sky: [0.76, 0.7, 1.0], gnd: [1.0, 0.68, 0.7], fog: [1.0, 0.8, 0.76], fogR: [120, 480], slime: [1.0, 0.46, 0.38], slime2: [0.94, 0.26, 0.44] },
  mint: { top: [0.24, 0.62, 0.98], hor: [0.86, 0.98, 0.92], bot: [0.62, 0.92, 0.8], sun: N([-0.38, 0.78, -0.5]), sunCol: [1.0, 0.97, 0.88], sky: [0.66, 0.84, 1.0], gnd: [0.78, 0.95, 0.84], fog: [0.88, 0.97, 0.94], fogR: [110, 470], slime: [0.4, 0.92, 0.62], slime2: [0.18, 0.72, 0.5] },
  stage: { top: [0.52, 0.36, 0.98], hor: [1.0, 0.62, 0.86], bot: [1.0, 0.55, 0.78], sun: N([-0.5, 0.7, 0.55]), sunCol: [1.0, 0.95, 0.9], sky: [0.8, 0.72, 1.0], gnd: [1.0, 0.72, 0.86], fog: [1.0, 0.7, 0.9], fogR: [60, 240], slime: [1.0, 0.38, 0.74], slime2: [0.86, 0.2, 0.62] },
};

// ---------------- particles ----------------
class FX {
  constructor(scene) { this.s = scene; this.list = []; this.buf = new Float32Array(6000 * 54); }
  add(o) { if (this.list.length > 1800) this.list.shift(); this.list.push({ t: 0, life: 1, size: 0.3, grow: 0, col: [1, 1, 1, 1], g: 0, drag: 0, spin: 0, rot: Math.random() * 6, cell: 0, add: false, ...o }); }
  dust(p, n = 8, col = [1, 1, 1, 0.7], sp = 2.2) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random(); this.add({ p: [p[0], p[1] + 0.1, p[2]], v: [Math.cos(a) * sp, 0.6 + Math.random(), Math.sin(a) * sp], life: 0.45 + Math.random() * 0.25, size: 0.28, grow: 0.9, col, drag: 3, cell: 5 }); } }
  confetti(p, n = 60, up = 9) { const C = [[1, 0.37, 0.64], [1, 0.82, 0.25], [0.21, 0.73, 1], [0.25, 0.88, 0.66], [0.69, 0.48, 1], [1, 0.54, 0.24]]; for (let i = 0; i < n; i++) this.add({ p: [p[0] + (Math.random() - 0.5), p[1], p[2] + (Math.random() - 0.5)], v: [(Math.random() - 0.5) * 9, up * (0.5 + Math.random()), (Math.random() - 0.5) * 9], life: 2 + Math.random() * 1.5, size: 0.16, col: [...C[i % 6], 1], g: 9, drag: 1.4, spin: (Math.random() - 0.5) * 14, cell: 2 }); }
  sparkle(p, n = 6, col = [1, 0.9, 0.5, 1]) { for (let i = 0; i < n; i++) this.add({ p: [p[0] + (Math.random() - 0.5) * 1.4, p[1] + (Math.random() - 0.5) * 1.2, p[2] + (Math.random() - 0.5) * 1.4], v: [0, 0.6, 0], life: 0.5 + Math.random() * 0.5, size: 0.22, grow: -0.3, col, cell: 4, add: true, spin: 2 }); }
  stars(p) { for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.add({ p: [p[0], p[1] + 0.8, p[2]], v: [Math.cos(a) * 3, 2.5, Math.sin(a) * 3], life: 0.6, size: 0.26, col: [1, 0.86, 0.3, 1], g: 6, cell: 1, spin: 6 }); } }
  dissolve(p) {
    const e = this.s.camEye || [0, 0, 0]; if (Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) > 45) return;
    for (let i = 0; i < 7; i++) this.add({ p: [p[0] + (Math.random() - 0.5) * 2.2, p[1] + 0.1, p[2] + (Math.random() - 0.5) * 2.2], v: [0, 0.8 + Math.random() * 1.4, 0], life: 0.5 + Math.random() * 0.4, size: 0.2, grow: -0.4, col: [1, 0.7, 0.95, 1], cell: 4, add: true, spin: 3 });
  }
  wind(p, dir) { this.add({ p: [p[0] + (Math.random() - 0.3) * 2 * dir, p[1] + (Math.random() - 0.5) * 2.4, p[2] + (Math.random() - 0.5) * 4.5], v: [dir * (8 + Math.random() * 4), 0, 0], life: 0.8, size: 0.45, grow: 1.2, col: [1, 1, 1, 0.32], cell: 0, drag: 0.4 }); }
  ring(p, col = [1, 1, 1, 0.8]) { this.add({ p: [p[0], p[1] + 0.15, p[2]], v: [0, 0, 0], life: 0.4, size: 0.5, grow: 9, col, cell: 3, add: true }); }
  splash(p) { for (let i = 0; i < 24; i++) { const a = Math.random() * 6.283, s = 2 + Math.random() * 5; this.add({ p: [p[0], p[1], p[2]], v: [Math.cos(a) * s * 0.6, 4 + Math.random() * 7, Math.sin(a) * s * 0.6], life: 0.9, size: 0.35, col: [1, 0.5, 0.8, 0.95], g: 18, cell: 0 }); } }
  burst(p, kind) {
    if (kind === 'door') for (let i = 0; i < 26; i++) this.add({ p: [p[0] + (Math.random() - 0.5) * 3, p[1] + (Math.random() - 0.5) * 2.5, p[2]], v: [(Math.random() - 0.5) * 6, Math.random() * 6, 3 + Math.random() * 6], life: 0.9, size: 0.25, col: [1, 1, 1, 1], g: 14, cell: 2, spin: 8 });
  }
  near(p, sound, vol = 1) { const e = this.s.camEye || [0, 0, 0]; const d = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]); const v = vol * Math.max(0, 1 - d / 40); if (v > 0.05) this.s.sound.play(sound, v); }
  update(dt) {
    for (const q of this.list) { q.t += dt; q.v[1] -= q.g * dt; const k = Math.exp(-q.drag * dt); q.v[0] *= k; q.v[1] *= q.g ? 1 : k; q.v[2] *= k; q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt; q.rot += q.spin * dt; }
    this.list = this.list.filter((q) => q.t < q.life);
  }
  // camera-facing quads into sprite buffers
  build(view, extra) {
    const rx = [view[0], view[4], view[8]], ry = [view[1], view[5], view[9]];
    let na = 0, nb = 0; const A = this.buf, B = (this.bufB = this.bufB || new Float32Array(3000 * 54));
    const push = (q, add) => {
      const arr = add ? B : A, idx = add ? nb++ : na++, o = idx * 54; if (idx >= (add ? 3000 : 6000)) return;
      const f = q.t / q.life, s = Math.max(0.01, q.size * (1 + q.grow * f)), alpha = q.col[3] * (f > 0.7 ? (1 - f) / 0.3 : 1);
      const c = Math.cos(q.rot) * s, sn = Math.sin(q.rot) * s;
      const ax = q.flat ? [s, 0, 0] : [rx[0] * c + ry[0] * sn, rx[1] * c + ry[1] * sn, rx[2] * c + ry[2] * sn], ay = q.flat ? [0, 0, s] : [-rx[0] * sn + ry[0] * c, -rx[1] * sn + ry[1] * c, -rx[2] * sn + ry[2] * c];
      const cell = q.cell, u0 = (cell % 4) / 4, v0 = Math.floor(cell / 4) / 4, u1 = u0 + 0.25, v1 = v0 + 0.25;
      const P = (sx, sy) => [q.p[0] + ax[0] * sx + ay[0] * sy, q.p[1] + ax[1] * sx + ay[1] * sy, q.p[2] + ax[2] * sx + ay[2] * sy];
      const corners = [[-1, -1, u0, v1], [1, -1, u1, v1], [1, 1, u1, v0], [-1, -1, u0, v1], [1, 1, u1, v0], [-1, 1, u0, v0]];
      let k = o;
      for (const [sx, sy, u, v] of corners) { const p = P(sx, sy); arr[k++] = p[0]; arr[k++] = p[1]; arr[k++] = p[2]; arr[k++] = u; arr[k++] = v; arr[k++] = q.col[0]; arr[k++] = q.col[1]; arr[k++] = q.col[2]; arr[k++] = alpha; }
    };
    for (const q of this.list) push(q, q.add);
    for (const q of extra) push(q, q.add);
    return { na, nb };
  }
}

function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 32); fn(); g.restore(); };
  cell(0, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.6, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
  cell(1, () => { g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 12 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
  cell(2, () => { g.fillStyle = '#fff'; g.fillRect(-14, -24, 28, 48); });
  cell(3, () => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.stroke(); });
  cell(4, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(4, -4, 30, 0); g.quadraticCurveTo(4, 4, 0, 30); g.quadraticCurveTo(-4, 4, -30, 0); g.quadraticCurveTo(-4, -4, 0, -30); g.fill(); });
  cell(5, () => { g.fillStyle = 'rgba(255,255,255,0.95)'; for (const [x, y, r] of [[0, 4, 16], [-12, 8, 11], [12, 8, 12], [-6, -6, 12], [8, -5, 11]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } });
  cell(6, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 22); g.bezierCurveTo(-30, 2, -18, -26, 0, -10); g.bezierCurveTo(18, -26, 30, 2, 0, 22); g.fill(); });
  cell(7, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(0.7, 'rgba(0,0,0,0.25)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
  return c;
}
function textCanvas(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.font = '900 170px "Titan One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 26; g.strokeStyle = '#2a1050'; g.strokeText(text, 512, 136);
  const gr = g.createLinearGradient(0, 40, 0, 220); gr.addColorStop(0, '#fff6a8'); gr.addColorStop(1, '#ffb300'); g.fillStyle = gr; g.fillText(text, 512, 128);
  return c;
}

class Scene {
  constructor(canvas, sound) {
    this.R = new Renderer(canvas); this.sound = sound;
    if (!this.R.ok) return;
    const R = this.R;
    this.bean = buildBean(R); this.hats = buildHats(R); this.crown = buildCrown(R); this.boulder = buildBoulder(R); this.door = buildDoorPanel(R);
    this.pedestal = buildPedestal(R); this.podium = buildPodium(R); this.hoop = buildHoop(R, false); this.hoopGold = buildHoop(R, true);
    this.atlas = R.texture(makeAtlas());
    this.fx = new FX(this);
    this.lvl = null; this.tex = new Map();
    this.time = 0; this.quality = 1;
  }
  get ok() { return this.R.ok; }

  setQuality(q) { this.quality = q; this.R.setShadow(q >= 2 ? 2048 : q === 1 ? 1024 : 0); }

  loadLevel(level, world) {
    if (this.lvl) { for (const c of this.lvl.m.chunks) c.mesh.free(); for (const k of this.lvl.m.kin) k.mesh.free(); for (const l of this.lvl.m.lasers) l.mesh.free(); if (this.lvl.m.dyn) this.lvl.m.dyn.free(); if (this.lvl.m.props) this.lvl.m.props.free(); }
    const m = buildLevelMeshes(this.R, level, world);
    for (const t of m.text) if (!this.tex.has(t.text)) this.tex.set(t.text, this.R.texture(textCanvas(t.text)));
    this.lvl = { level, world, m, theme: THEMES[level.theme] || THEMES.day };
    this.fx.list = [];
  }

  // ---------- frames ----------
  frame(cam, dt) {
    const R = this.R; this.time += dt; R.time = this.time;
    R.resize(this.quality >= 2 ? 1 : this.quality === 1 ? 0.85 : 0.7, this.quality >= 2 ? 2 : 1.5);
    R.setCamera(cam.eye, cam.look, cam.fov);
    this.camEye = cam.eye; this.view = R.view;
    this.fx.update(dt);
  }

  // draw an in-show frame. g: ClientGame-derived draw data
  renderGame(cam, dt, d) {
    const R = this.R, L = this.lvl; if (!L) return;
    this.frame(cam, dt);
    R.setTheme(L.theme);
    const W = L.world;
    W.setTime(d.worldTime);
    // dynamic object states (tiles/doors) for the GPU
    let dynOn = false;
    if (d.tileStates) dynOn = d.tileStates(R.stateData); if (d.doorStates && d.doorStates(R.stateData)) dynOn = true;
    if (dynOn) R.uploadState();
    const focus = d.focus || cam.look;
    R.setLight(focus, this.quality >= 2 ? 42 : 34);
    const beans = d.beans;
    // shadow pass
    if (R.beginShadow()) {
      for (const c of L.m.chunks) if (this.nearFocus(c, focus, 60)) R.draw(c.mesh);
      if (L.m.dyn) R.draw(L.m.dyn, null, { dyn: true });
      for (const k of L.m.kin) R.draw(k.mesh, m4.fromRM(k.c.wm, k.c.wp));
      for (const b of beans) if (Math.hypot(b.p[0] - focus[0], b.p[2] - focus[2]) < 40) R.drawBean(this.bean, b.vis.bones, b.vis.params);
      for (const b of d.mascots || []) if (Math.hypot(b.p[0] - focus[0], b.p[2] - focus[2]) < 60) R.drawBean(this.bean, b.vis.bones, b.vis.params);
      for (const b of d.balls) R.draw(this.boulder, m4.trs(b.p, b.q || [0, 0, 0, 1]));
      R.endShadow();
    }
    R.beginMain();
    R.drawSky();
    R.cur = null;
    if (L.m.props) R.draw(L.m.props, null, {});
    for (const c of L.m.chunks) if (this.visible(c.mn, c.mx)) R.draw(c.mesh);
    if (L.m.dyn) R.draw(L.m.dyn, null, { dyn: true });
    for (const k of L.m.kin) if (k.c.wp[1] > -1000) R.draw(k.mesh, m4.fromRM(k.c.wm, k.c.wp), d.kinTint && k.c.vis && (k.c.vis.cm !== undefined || k.c.vis.cmScreen || k.c.vis.wb || k.c.vis.tk) ? { tint: d.kinTint(k.c), emit: k.c.vis.cmScreen ? 0.55 : k.c.vis.tk === 'rope' ? 0.45 : k.c.vis.tk === 'spot' ? 1 : 0 } : undefined);
    for (const b of d.balls) R.draw(this.boulder, m4.trs(b.p, b.q || [0, 0, 0, 1]));
    if (d.hoops) for (const o of d.hoops) { // Hoop Hunt: upright rings turning slowly where they float
      const h = o.h, q = qt.mul(qt.axis([0, 1, 0], h.yaw + this.time * 0.9), qt.axis([1, 0, 0], Math.PI / 2));
      R.draw(h.v >= 5 ? this.hoopGold : this.hoop, m4.trs(h.p, q, [o.s, o.s, o.s]), { emit: h.v >= 5 ? 0.35 : 0.18 });
    }
    for (const db of d.debris || []) R.draw(this.door, m4.trs(db.p, qt.axis([1, 0, 0], db.rx)), { tint: [...rgb(db.c), Math.max(0, 1 - db.t / 2.5)] });
    if (d.crown) { R.draw(this.crown, m4.trs(d.crown, qt.axis([0, 1, 0], this.time * 1.6), [1.15, 1.15, 1.15]), { emit: 0.15 }); }
    this.drawBeans(beans, cam);
    if (d.mascots) this.drawBeans(d.mascots, cam); // giant mascots (Rope Rumble, Red Light Rush)
    R.drawSlime(d.slimeY !== undefined ? d.slimeY : L.level.slimeY);
    // lasers (emissive, additive)
    R.cur = null;
    R.blend(true, true);
    for (const l of L.m.lasers) {
      poseAt(l.c, d.worldTime, l.c.wp, l.c.wm);
      if (l.c.wp[1] < -1000) continue;
      const pulse = 0.85 + Math.sin(this.time * 18) * 0.15;
      R.draw(l.mesh, m4.fromRM(l.c.wm, l.c.wp), { emit: 1, tint: [pulse, pulse, pulse, 0.85] });
    }
    R.blend(false);
    R.cur = null;
    this.drawText(L.m.text);
    // particles + crown glow + dizzy stars + blob shadows
    const extra = [];
    if (d.crown) { extra.push({ p: d.crown, t: 0, life: 1, size: 1.8 + Math.sin(this.time * 4) * 0.2, grow: 0, col: [1, 0.85, 0.4, 0.55], cell: 0, rot: 0, add: true }); if (Math.random() < dt * 14) this.fx.sparkle(d.crown, 1); }
    for (const b of beans) {
      if (b.st.mode === MODE.RAG || b.st.mode === MODE.GETUP) for (let i = 0; i < 3; i++) { const a = this.time * 5 + (i * 6.283) / 3; extra.push({ p: [b.p[0] + Math.cos(a) * 0.45, b.p[1] + 1.05, b.p[2] + Math.sin(a) * 0.45], t: 0, life: 1, size: 0.13, grow: 0, col: [1, 0.85, 0.25, 1], cell: 1, rot: a, add: false }); }
      if (!R.shadowSize) { const gb = W.groundBelow(b.p[0], b.p[1] + 0.3, b.p[2], 8, Math.floor(d.worldTime * 30)); b.ground = gb ? gb.y : undefined; }
      if (!R.shadowSize && b.ground !== undefined) extra.push({ p: [b.p[0], b.ground + 0.03, b.p[2]], t: 0, life: 1, size: 0.6, grow: 0, col: [1, 1, 1, 1], cell: 7, rot: 0, add: false, flat: true });
    }
    const { na, nb } = this.fx.build(R.view, extra);
    R.drawSprites(this.fx.buf, na, this.atlas, false);
    R.drawSprites(this.fx.bufB, nb, this.atlas, true);
  }

  drawBeans(beans, cam) {
    const R = this.R;
    for (const b of beans) {
      R.drawBean(this.bean, b.vis.bones, b.vis.params);
      const hat = this.hats[b.look.hat];
      if (hat) R.draw(hat, b.vis.hatM, HAT_EMIT[b.look.hat] ? { emit: HAT_EMIT[b.look.hat] } : undefined);
    }
    R.cur = null;
  }

  drawText(list) {
    const R = this.R, gl = R.gl;
    for (const t of list) {
      const tex = this.tex.get(t.text); if (!tex) continue;
      const hw = t.w / 2, hh = t.h / 2, z = t.p[2], s = t.back ? -1 : 1;
      const q = [[-hw * s, -hh, 0, 1], [hw * s, -hh, 1, 1], [hw * s, hh, 1, 0], [-hw * s, -hh, 0, 1], [hw * s, hh, 1, 0], [-hw * s, hh, 0, 0]];
      const buf = (this._tb = this._tb || new Float32Array(54)); let k = 0;
      for (const [x, y, u, v] of q) { buf[k++] = t.p[0] - x; buf[k++] = t.p[1] + y; buf[k++] = z; buf[k++] = u; buf[k++] = v; buf[k++] = 1; buf[k++] = 1; buf[k++] = 1; buf[k++] = 1; }
      R.drawSprites(buf, 1, tex, false);
    }
  }

  nearFocus(c, f, r) { return !(c.mx[0] < f[0] - r || c.mn[0] > f[0] + r || c.mx[2] < f[2] - r || c.mn[2] > f[2] + r); }
  visible(mn, mx) {
    const vp = this.R.vp;
    let outL = 0, outR = 0, outB = 0, outT = 0, outN = 0;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? mx[0] : mn[0], y = i & 2 ? mx[1] : mn[1], z = i & 4 ? mx[2] : mn[2];
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cx < -cw) outL++; if (cx > cw) outR++; if (cy < -cw) outB++; if (cy > cw) outT++; if (cw < 0) outN++;
    }
    return !(outL === 8 || outR === 8 || outB === 8 || outT === 8 || outN === 8);
  }

  // ---------- thumbnails: a real render of a bean wearing something (locker & shop) ----------
  // kind: 'body' (whole bean, three-quarter view) | 'face' (close-up) | 'hat' (head and hat)
  thumb(look, kind = 'body', size = 96) {
    const R = this.R; if (!R.ok) return null;
    const S = size * 2, v = this._tv || (this._tv = new BeanVis(look));
    v.setLook(look);
    const yaw = kind === 'face' ? 0 : kind === 'hat' ? 0.55 : kind === 'head' ? 0.42 : kind === 'back' ? Math.PI - 0.45 : 0.5;
    for (let i = 0; i < 6; i++) v.update(0.05, { p: [0, 0.78, 0], v: [0, 0, 0], yaw, mode: MODE.NORMAL, gr: 1, mt: 0 }, 1.3, { menu: true });
    v.params.blink = 1;
    const cam = kind === 'face' ? { e: [0, 1.3, 2.2], l: [0, 1.17, 0], f: 0.34 } : kind === 'head' ? { e: [0.25, 1.78, 2.6], l: [0, 1.36, 0], f: 0.5 } : kind === 'hat' ? { e: [0.35, 2.05, 2.2], l: [0, 1.66, 0], f: 0.5 } : kind === 'back' ? { e: [0.2, 1.75, 4.4], l: [0, 1.05, 0], f: 0.5 } : { e: [0.15, 1.38, 3.5], l: [0, 0.9, 0], f: 0.48 };
    const aspect = R.aspect, theme = R.theme, eye = R.eye, view = R.view, proj = R.proj, vp = R.vp, inv = R.invVP;
    R.aspect = 1; R.setTheme(THEMES.stage); R.setCamera(cam.e, cam.l, cam.f);
    R.offscreen(S, S);
    R.drawBean(this.bean, v.bones, v.params);
    const hat = this.hats[look.hat]; if (hat) R.draw(hat, v.hatM, { emit: HAT_EMIT[look.hat] || 0 });
    const px = R.readOffscreen();
    Object.assign(R, { aspect, theme, eye, view, proj, vp, invVP: inv });
    const c = (this._tc = this._tc || document.createElement('canvas')); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.putImageData(img, 0, 0);
    const out = document.createElement('canvas'); out.width = out.height = size;
    const og = out.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, size, size);
    return out.toDataURL('image/png');
  }

  // ---------- menu stage (bean on a pedestal) ----------
  renderStage(cam, dt, beans, opts = {}) {
    const R = this.R; this.frame(cam, dt);
    R.setTheme(THEMES.stage);
    R.setLight([0, 0.5, 0], 6);
    if (R.beginShadow()) { R.draw(opts.podium ? this.podium : this.pedestal, opts.podium ? null : m4.trs([0, -0.35, 0], [0, 0, 0, 1])); for (const b of beans) R.drawBean(this.bean, b.vis.bones, b.vis.params); R.endShadow(); }
    R.beginMain(); R.drawSky(); R.cur = null;
    R.draw(opts.podium ? this.podium : this.pedestal, opts.podium ? null : m4.trs([0, -0.35, 0], [0, 0, 0, 1]));
    if (opts.crownAt) R.draw(this.crown, m4.trs(opts.crownAt, qt.axis([0, 1, 0], this.time * 1.4), [1.05, 1.05, 1.05]), { emit: 0.2 });
    this.drawBeans(beans, cam);
    const { na, nb } = this.fx.build(R.view, []);
    R.drawSprites(this.fx.buf, na, this.atlas, false); R.drawSprites(this.fx.bufB, nb, this.atlas, true);
  }
}

function rgb(h) { if (Array.isArray(h)) return h; const n = parseInt(String(h).replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }


export { THEMES, Scene };
