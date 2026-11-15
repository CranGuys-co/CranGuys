// CranGuys — input: keyboard + mouse, gamepads, and an iPad-first touch layout (floating stick,
// camera drag on the right half, big JUMP / DIVE / GRAB buttons). Output is camera-relative world movement.
import { BTN } from './sim/config.js';
import { el, settings } from './util.js';
const KEYS = {
  up: ['KeyW', 'ArrowUp', 'KeyZ'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft', 'KeyQ'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], dive: ['ControlLeft', 'ControlRight', 'KeyC', 'KeyX'], grab: ['KeyE'],
  camL: ['KeyJ'], camR: ['KeyL'],
};

class Input {
  constructor(canvas) {
    this.cv = canvas; this.keys = new Set(); this.enabled = false;
    this.camDX = 0; this.camDY = 0; this.lastCamInput = 0; this.mouseBtn = 0;
    this.stick = { id: null, x0: 0, y0: 0, x: 0, y: 0 }; this.camTouch = { id: null, x: 0, y: 0 };
    this.tbtn = { jump: false, dive: false, grab: false };
    this.padPrev = 0; this.usingPad = false; this.onAny = null;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (this.enabled && ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'Tab'].includes(e.code)) e.preventDefault();
      if (this.onAny) this.onAny(e);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.tbtn.jump = this.tbtn.dive = this.tbtn.grab = false; });
    // mouse look: drag, or pointer-lock after clicking the canvas on desktop
    canvas.addEventListener('mousedown', (e) => {
      this.mouseBtn = e.buttons;
      if (this.enabled && !matchMedia('(pointer: coarse)').matches && document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} }
    });
    addEventListener('mouseup', (e) => (this.mouseBtn = e.buttons));
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === canvas || (this.mouseBtn & 1)) { this.camDX += e.movementX * 0.0032; this.camDY += e.movementY * 0.0032; this.lastCamInput = performance.now(); }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // touch controls are DOM elements layered over the canvas
  buildTouch(root) {
    this.troot = root;
    const zone = el('div', { class: 'tzone' });
    const knob = el('div', { class: 'tknob' }), base = el('div', { class: 'tbase' }, knob);
    const mk = (cls, label, icon, key) => {
      const b = el('div', { class: 'tbtn ' + cls, 'data-k': key }, el('i', { class: 'fa-solid ' + icon }), el('span', {}, label));
      return b;
    };
    const jump = mk('jump', 'JUMP', 'fa-arrow-up', 'jump'), dive = mk('dive', 'DIVE', 'fa-person-swimming', 'dive'), grab = mk('grab', 'GRAB', 'fa-hand', 'grab');
    const cam = el('div', { class: 'tcam' });
    root.append(zone, base, cam, jump, dive, grab);
    this.tel = { zone, base, knob, jump, dive, grab };
    const btnFor = (x, y) => { for (const b of [jump, dive, grab]) { const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (Math.hypot(x - cx, y - cy) < r.width * 0.62) return b; } return null; };
    const touches = new Map(); // id -> 'stick' | 'cam' | btn key
    const start = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const b = btnFor(t.clientX, t.clientY);
        if (b) { touches.set(t.identifier, b.dataset.k); this.tbtn[b.dataset.k] = true; b.classList.add('on'); continue; }
        if (t.clientX < innerWidth * 0.45 && this.stick.id === null) {
          this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: 0, y: 0 }; touches.set(t.identifier, 'stick');
          base.style.transform = `translate(${t.clientX - 70}px, ${t.clientY - 70}px)`; base.classList.add('on'); knob.style.transform = 'translate(0px,0px)';
        } else if (this.camTouch.id === null) { this.camTouch = { id: t.identifier, x: t.clientX, y: t.clientY }; touches.set(t.identifier, 'cam'); }
      }
      e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        const k = touches.get(t.identifier);
        if (k === 'stick') {
          let dx = t.clientX - this.stick.x0, dy = t.clientY - this.stick.y0; const l = Math.hypot(dx, dy), R = 62 * settings.touchSize;
          if (l > R) { // drag the stick base along (floating stick)
            this.stick.x0 += (dx / l) * (l - R); this.stick.y0 += (dy / l) * (l - R); dx = (dx / l) * R; dy = (dy / l) * R;
            base.style.transform = `translate(${this.stick.x0 - 70}px, ${this.stick.y0 - 70}px)`;
          }
          this.stick.x = dx / R; this.stick.y = dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (k === 'cam') {
          // 'follow' (default): the camera moves the way your finger swipes. 'classic': drag the world instead.
          const k = settings.swipeCam === 'classic' ? 1 : -1;
          this.camDX += (t.clientX - this.camTouch.x) * 0.0068 * settings.sens * k; this.camDY += (t.clientY - this.camTouch.y) * 0.0055 * settings.sens * k;
          this.camTouch.x = t.clientX; this.camTouch.y = t.clientY; this.lastCamInput = performance.now();
        }
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        const k = touches.get(t.identifier); touches.delete(t.identifier);
        if (k === 'stick') { this.stick.id = null; this.stick.x = this.stick.y = 0; base.classList.remove('on'); }
        else if (k === 'cam') this.camTouch.id = null;
        else if (k) { this.tbtn[k] = false; this.tel[k].classList.remove('on'); }
      }
    };
    for (const n of [zone, cam, jump, dive, grab]) { n.addEventListener('touchstart', start, { passive: false }); n.addEventListener('touchmove', move, { passive: false }); n.addEventListener('touchend', end); n.addEventListener('touchcancel', end); }
    // mouse fallback for the on-screen buttons (useful on touch laptops)
    for (const b of [jump, dive, grab]) { b.addEventListener('mousedown', () => { this.tbtn[b.dataset.k] = true; b.classList.add('on'); }); b.addEventListener('mouseup', () => { this.tbtn[b.dataset.k] = false; b.classList.remove('on'); }); }
  }

  has(list) { for (const k of list) if (this.keys.has(k)) return true; return false; }

  poll(camYaw, dt) {
    let sx = 0, sy = 0, b = 0;
    if (this.enabled) {
      if (this.has(KEYS.left)) sx -= 1; if (this.has(KEYS.right)) sx += 1; if (this.has(KEYS.up)) sy += 1; if (this.has(KEYS.down)) sy -= 1;
      if (this.has(KEYS.jump)) b |= BTN.JUMP; if (this.has(KEYS.dive)) b |= BTN.DIVE; if (this.has(KEYS.grab)) b |= BTN.GRAB;
      if (this.has(KEYS.camL)) { this.camDX -= 2.4 * dt; this.lastCamInput = performance.now(); } if (this.has(KEYS.camR)) { this.camDX += 2.4 * dt; this.lastCamInput = performance.now(); }
      if (this.stick.id !== null) { sx += this.stick.x; sy -= this.stick.y; }
      if (this.tbtn.jump) b |= BTN.JUMP; if (this.tbtn.dive) b |= BTN.DIVE; if (this.tbtn.grab) b |= BTN.GRAB;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
        const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
        if (lx || ly) { sx += lx; sy -= ly; this.usingPad = true; }
        if (rx || ry) { this.camDX += rx * 2.8 * dt * settings.sens; this.camDY += ry * 2.0 * dt * settings.sens; this.lastCamInput = performance.now(); }
        const B = p.buttons, pr = (i) => B[i] && B[i].pressed;
        if (pr(0)) b |= BTN.JUMP; if (pr(2) || pr(1)) b |= BTN.DIVE; if (pr(7) || pr(5) || pr(6) || pr(4)) b |= BTN.GRAB;
        if (b) this.usingPad = true;
        break;
      }
    }
    const l = Math.hypot(sx, sy); if (l > 1) { sx /= l; sy /= l; }
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    const out = { mx: sy * s - sx * c, mz: sy * c + sx * s, b, sx, sy, camDX: this.camDX, camDY: this.camDY * (settings.invertY ? -1 : 1) };
    this.camDX = 0; this.camDY = 0;
    return out;
  }
  // menu navigation helpers for gamepads
  padPressed() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) { const m = p.buttons.reduce((a, x, i) => a | (x.pressed ? 1 << i : 0), 0); const pressed = m & ~this.padPrev; this.padPrev = m; return pressed; }
    return 0;
  }
  release() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
}


export { Input };
