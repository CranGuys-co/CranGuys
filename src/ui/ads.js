// Ads (Adsterra Native Banner) — kept well away from gameplay.
//
// * Only on the main menu and on the end-of-show / "you're out" screen. Never in a round, the lobby, the
//   podium, the Locker, Shop or Pass. When a show starts the ad is deleted (its code stops running) and a fresh
//   one is loaded next time you're back on the menu.
// * Only on the site Adsterra approved (your github.io address) — never in local tests or the claude.ai copy.
// * The ad runs inside its own frame: it can't redirect the game tab, pop up alerts or start downloads, links
//   open in a new tab, and taps on the game never reach it. Nothing shows at all if the ad doesn't load (ad
//   blocker, school filter, no fill), so there's never an empty box.
// * It never covers a button: on the menu it sits in the free space top-right (above the PLAY corner), on the
//   end screen beside the card; if there isn't room on a small screen there's simply no ad.
//
// To switch ads off, set ADS_ON to false.
import { BUILD } from '../sim/config.js';
const ADS_ON = true;
const AD_KEY = '55090921d91859c8ea8fcac9a1f56edc';
const AD_SRC = 'https://bauval.org/21/' + AD_KEY;
const AD_HOSTS = ['github.io']; // the site(s) registered with Adsterra
const GAP = 16;

const allowed = () => {
  if (typeof window.CG_AD_SRC === 'string') return true; // test hook
  const h = location.hostname;
  return AD_HOSTS.some((d) => h === d || h.endsWith('.' + d));
};
// The ad runs in a frame that loads this same page with ?cgad=1, so the ad script sees your real github.io address
// (Adsterra checks it). In that frame the game never starts: runAdFrame() swaps the page for just the ad tag.
const isAdFrame = () => typeof window !== 'undefined' && window.parent !== window && /[?&]cgad=1\b/.test(location.search);
function runAdFrame() {
  const d = document;
  for (const e of d.querySelectorAll('link[rel="stylesheet"], style')) e.remove();
  d.documentElement.removeAttribute('class'); d.documentElement.style.cssText = 'margin:0;padding:0;background:transparent';
  d.body.removeAttribute('class');
  d.body.style.cssText = 'margin:0;padding:0;background:transparent;overflow:hidden;font-family:system-ui,-apple-system,sans-serif';
  d.body.innerHTML = `<div id="container-${AD_KEY}"></div>`;
  const base = d.createElement('base'); base.target = '_blank'; d.head.prepend(base); // ad links open in a new tab
  const open = window.open; // new tabs only when the ad itself is tapped
  window.open = function () { const u = navigator.userActivation; return u && !u.isActive ? null : open.apply(window, arguments); };
  window.__ad = { state: 'loading the ad script…' };
  const sc = d.createElement('script'); // the Adsterra tag, exactly as given: the script, then its container
  sc.async = true; sc.setAttribute('data-cfasync', 'false'); sc.src = window.CG_AD_SRC || AD_SRC;
  sc.onload = () => { window.__ad.state = 'ad script loaded'; };
  sc.onerror = () => { window.__ad.state = 'ad script BLOCKED or failed to load (ad blocker / VPN / school filter?)'; };
  d.body.insertBefore(sc, d.body.firstChild);
}

class Ads {
  constructor(root) {
    this.on = ADS_ON && allowed();
    this.dbg = /[?&]addebug/.test(location.search); this.why = '';
    // ?addebug=direct: also put the exact Adsterra tag straight into the page (no frame) in a yellow test box, to see
    // whether the frame is what stops the ad
    if (/[?&]addebug=direct/.test(location.search) && this.on) {
      const box = (this.directBox = document.createElement('div')); box.className = 'ad-direct';
      box.innerHTML = `<div id="container-${AD_KEY}"></div>`;
      const sc = document.createElement('script'); sc.async = true; sc.setAttribute('data-cfasync', 'false'); sc.src = window.CG_AD_SRC || AD_SRC;
      box.insertBefore(sc, box.firstChild); root.appendChild(box);
    }
    if (this.dbg) { this.panel = document.createElement('div'); this.panel.className = 'ad-debug'; root.appendChild(this.panel); setInterval(() => this.debug(), 1000); }
    this.root = root; this.slot = null; this.box = null; this.frame = null; this.h = 0; this.ro = null; this.fw = 300;
    if (!this.on) return;
    this.timer = setInterval(() => this.place(), 1000); // follows layout changes (mode switch, rotate, safety rules closing…)
    addEventListener('resize', () => this.place());
  }
  // slot: 'menu' | 'end' | 'park' (keep the ad loaded but hidden, e.g. in the Locker) | null (delete it)
  set(slot) {
    if (!this.on || slot === this.slot) return;
    this.slot = slot; this.since = 0;
    if (!slot) this.destroy();
    this.place();
  }
  ensure() {
    if (this.box) return;
    const box = (this.box = document.createElement('div'));
    box.className = 'ad-box'; box.setAttribute('aria-label', 'Advertisement');
    box.innerHTML = '<span class="ad-tag">Ad</span><div class="ad-clip"></div>';
    const f = (this.frame = document.createElement('iframe'));
    f.title = 'Advertisement'; f.setAttribute('scrolling', 'no');
    // no allow-top-navigation (can't redirect the game), no allow-modals (no fake "virus" alerts), no allow-downloads
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    f.style.width = this.fw + 'px';
    f.src = location.pathname + '?cgad=1';
    f.addEventListener('load', () => {
      try {
        const b = f.contentDocument.body, fit = () => { const h = Math.ceil(b.scrollHeight); if (h !== this.h) { this.h = h; this.place(); } };
        this.ro = new ResizeObserver(fit); this.ro.observe(b); fit();
        this.loaded = true; this.debug();
      } catch (e) { /* the frame went away */ }
    });
    box.lastChild.appendChild(f);
    const modal = this.root.querySelector('#modal');
    this.root.insertBefore(box, modal || null); // under pop-up windows, above the menu / end screen
  }
  destroy() {
    if (this.ro) this.ro.disconnect();
    if (this.box) this.box.remove();
    this.box = this.frame = this.ro = null; this.h = 0; this.loaded = false;
  }
  // ?addebug=1: a little panel saying what the ad is doing (and why it isn't showing)
  debug() {
    if (!this.panel) return;
    let st = '—'; try { st = this.frame && this.frame.contentWindow && this.frame.contentWindow.__ad ? this.frame.contentWindow.__ad.state : this.frame ? 'frame loading…' : 'no ad frame'; } catch (e) { st = '?'; }
    let inside = '—';
    try {
      const w = this.frame && this.frame.contentWindow, c = w && w.document.getElementById('container-' + AD_KEY);
      if (c) {
        const hosts = [...new Set(w.performance.getEntriesByType('resource').map((e) => { try { return new URL(e.name).hostname; } catch (_) { return '?'; } }))];
        inside = `${c.children.length} elements, ${c.innerHTML.length} chars, ${w.document.querySelectorAll('iframe').length} inner frames · loaded from: ${hosts.join(', ') || 'nothing'}`;
      }
    } catch (e) { inside = 'can’t look inside: ' + e.message; }
    let direct = '';
    if (this.directBox) { const c = this.directBox.querySelector('#container-' + AD_KEY); direct = c ? `${c.children.length} elements, ${Math.round(c.getBoundingClientRect().height)}px tall` : 'no container'; }
    const rows = [['build', BUILD], ['site', location.hostname + (allowed() ? ' ✓ approved' : ' ✗ not github.io → ads off')], ['ads switch', ADS_ON ? 'on' : 'OFF'],
      ['screen', this.slot || 'none (in a show)'], ['ad', st], ['ad height', this.h + 'px'], ['inside ad', inside], ...(this.directBox ? [['direct test', direct + ' (yellow box, top-left)']] : []), ['showing', this.box && this.box.classList.contains('show') ? 'YES' : 'no — ' + (this.why || '…')]];
    this.panel.innerHTML = '<b>Ad debug</b>' + rows.map(([k, v]) => `<div><i>${k}</i> ${String(v).replace(/</g, '&lt;')}</div>`).join('');
  }
  // the free rectangle the ad may use (it never covers a button), or null if there's no room on this screen
  region() {
    const vw = innerWidth, vh = innerHeight;
    const r = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
    if (document.querySelector('#safety.show')) return null;
    if (this.slot === 'menu') {
      if (vw < 980 || document.body.classList.contains('subscreen')) return null;
      const top = (r('#menu .topbar')?.bottom || 64) + GAP, play = r('#menu .playwrap');
      const w = 320, x = vw - w - 16, np = r('#menu .nameplate');
      const bottom = (play ? play.top : vh - 220) - GAP;
      if (np && np.right + GAP > x && np.bottom > top && np.top < bottom) return null;
      return { x, y: top, w, h: bottom - top, align: 'right' };
    }
    if (this.slot === 'end') {
      const card = document.querySelector('#rewards .rw-card'); if (!card) return null;
      const cw = card.offsetWidth, ch = card.offsetHeight, cl = (vw - cw) / 2, ct = Math.max(GAP, (vh - ch) / 2);
      // to the right of the card, level with its top (well away from its buttons) and clear of the menu's top bar
      // and PLAY corner showing dimmed behind it; the side tabs are on the left, so never there
      const side = vw - (cl + cw) - 24 - GAP, top = Math.max(ct, (r('#menu .topbar')?.bottom || 64) + GAP);
      const play = r('#menu .playwrap'), bottom = (play && play.left < vw - GAP - side ? play.top : vh) - GAP;
      if (side >= 230) { const w = Math.min(320, side); return { x: cl + cw + 24, y: top, w, h: bottom - top, align: 'left' }; }
      const below = vh - (ct + ch) - 24 - GAP;
      if (below >= 120) { const w = Math.min(340, vw - 2 * GAP); return { x: (vw - w) / 2, y: ct + ch + 24, w, h: below, align: 'center' }; }
    }
    return null;
  }
  place() {
    if (!this.on) { this.why = 'ads are off on this site'; return; }
    const R = this.slot && this.slot !== 'park' ? this.region() : null, PAD = 18, TAG = 16;
    this.why = !this.slot || this.slot === 'park' ? 'not an ad screen' : !R ? (document.querySelector('#safety.show') ? 'safety rules still up' : 'no free space on this screen size') : '';
    if (R) { const fw = Math.round(R.w - PAD); if (fw !== this.fw) { this.fw = fw; if (this.frame) this.frame.style.width = fw + 'px'; } }
    if (!this.box) {
      // only load an ad once there's somewhere visible for it, and you've stayed on the screen for a moment
      if (!R) { this.since = 0; return; }
      if (!this.since) { this.since = performance.now(); setTimeout(() => this.place(), 700); return; }
      if (performance.now() - this.since < 600) return;
      this.ensure();
    }
    // shrink a tall ad to fit (down to 60%) rather than covering anything; no room or nothing loaded → no box
    const sc = R && this.h > 0 ? Math.min(1, (R.h - PAD - TAG) / this.h) : 0;
    const show = !!R && this.h >= 40 && sc >= 0.6;
    if (R && !show) this.why = this.h < 40 ? 'nothing loaded in the ad yet (no ad, or it was blocked)' : `ad too tall (${this.h}px for ${Math.round(R.h)}px of space) — set the Native Banner to 1 row of 2 ads`;
    this.box.classList.toggle('show', show);
    if (!show) return;
    const bw = Math.round(this.fw * sc + PAD), x = R.align === 'right' ? R.x + R.w - bw : R.align === 'center' ? R.x + (R.w - bw) / 2 : R.x;
    Object.assign(this.box.style, { left: Math.round(x) + 'px', top: Math.round(R.y) + 'px', width: bw + 'px' });
    const clip = this.box.lastChild; clip.style.width = Math.round(this.fw * sc) + 'px'; clip.style.height = Math.round(this.h * sc) + 'px';
    Object.assign(this.frame.style, { height: this.h + 'px', transform: sc < 1 ? `scale(${sc})` : '' });
  }
}


export { ADS_ON, isAdFrame, runAdFrame, Ads };
