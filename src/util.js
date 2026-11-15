// CranGuys — client utilities: DOM helpers, safe storage, settings, colour helpers.
import { itemById, DEFAULT_LOADOUT } from './economy/cosmetics.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
// 41270 ms -> "0:41.27"
const fmtTime = (ms) => { ms = Math.max(0, Math.round(ms)); const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`; };
const clock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function hex2rgb(h) {
  if (!h || h === 'rainbow') return [1, 0.5, 0.8];
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Resolve a loadout (item ids) into bean render parameters
function beanLook(lo) {
  lo = { ...DEFAULT_LOADOUT, ...(lo || {}) };
  const c1 = itemById(lo.color) || itemById(DEFAULT_LOADOUT.color), c2 = itemById(lo.color2) || itemById(DEFAULT_LOADOUT.color2);
  const pat = itemById(lo.pattern), face = itemById(lo.face), hat = itemById(lo.hat);
  return {
    colA: hex2rgb(c1.hex), colB: hex2rgb(c2.hex), rainbow: c1.hex === 'rainbow', metal: c1.id === 'c_gold' ? 1 : 0,
    fx: [c1, c2, pat, face, hat].some((it) => it && it.rarity === 'legendary') ? 1 : 0, // legendary sparkle
    pat: pat ? pat.k : 0, face: face ? face.k : 0, hat: hat ? hat.k : 0, wrap: hat && hat.wrap ? 1 : 0,
    css: c1.hex === 'rainbow' ? 'linear-gradient(135deg,#ff5fa2,#ffd23f,#40e0a8,#36b9ff,#b07bff)' : c1.hex, css2: c2.hex === 'rainbow' ? '#ffd23f' : c2.hex,
  };
}

const DEFAULT_SETTINGS = {
  quality: 'auto', sens: 1, invertY: false, autoCam: true, nametags: true, fps: false,
  master: 0.8, music: 0.55, sfx: 0.9, touchSize: 1, server: '', mode: 'auto', haptics: true, swipeCam: 'follow', chat: 'on',
};
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('cg.settings', {}));
function saveSettings() { store.set('cg.settings', settings); }

const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


export { $, $$, el, esc, fmt, fmtTime, clock, store, hex2rgb, beanLook, DEFAULT_SETTINGS, settings, saveSettings, isTouch, sleep };
