// CranGuys — UI controller (DOM): menu, locker, shop, settings, account, lobby, HUD, banners, results, podium, rewards.
import { $, $$, el, esc, fmt, fmtTime, clock, settings, saveSettings, beanLook, isTouch } from '../util.js';
import { REC_MAPS } from '../online/p2p.js';
import { CATALOG, itemById, RARITY, slotCategory, XP_PER_LEVEL, levelForXp, tagOf } from '../economy/cosmetics.js';
import { icon } from './icons.js';
import { LEVELS, POOLS, DUEL_POOLS, levelMeta } from '../levels/index.js';
import { PHASE } from '../sim/config.js';
import { rankOf, RANKS, TIERS, isUnreal, UNREAL_RP, MIN_SHOW_HUMANS, DUEL_WINS } from '../online/ranks.js';
import { rankBadge } from './rankbadge.js';
import { cmCycle, cmPhase, CM_COLORS } from '../levels/colormatch.js';
import { crownAt } from '../levels/crownpeak.js';
import { PASS_ITEMS, PASS_SHOWN, passReward, passClaimable } from '../economy/pass.js';
import { Ads } from './ads.js';
import { cloudOn } from '../online/cloud/config.js';
import { sendCode } from '../online/cloud/account.js';
// the OWNER tag shown next to the name of whoever redeemed the owner code
const OWNER_TAG = '<span class="otag"><i class="fa-solid fa-gem"></i>OWNER</span>';
const passLevelOf = (id) => +(Object.keys(PASS_ITEMS).find((k) => PASS_ITEMS[k] === id) || 0);

const HAT_EMOJI = ['⛔', '🥳', '👑', '🐰', '🧢', '😇', '🎩', '🚧', '🪖', '👨‍🍳', '🍒', '📡', '🌼', '🧶', '🏴‍☠️', '🎧', '👷', '🥷', '🦖', '🛡️', '⛷️', '🦸', '🪽', '🐸', '🧙', '🍨', '🃏', '🦄', '🍄', '🎃', '🎓', '🦆', '🛸', '🎨', '🤠', '👒', '🎅', '🦌', '🤘', '🎀', '💐', '🐱', '🦶', '💰'];
const TYPE = { race: { label: 'RACE', icon: 'fa-flag-checkered', col: '#22c8ff' }, hunt: { label: 'HUNT', icon: 'fa-bullseye', col: '#22c48a' }, race2: { label: 'RACE', icon: 'fa-rotate', col: '#1fb5c9' }, survival: { label: 'SURVIVAL', icon: 'fa-shapes', col: '#ff2e88' }, final: { label: 'FINAL', icon: 'fa-crown', col: '#ffb300' }, lobby: { label: 'LOBBY', icon: 'fa-umbrella-beach', col: '#a66bff' } };
const TIPS = [
  'Dive (Ctrl / DIVE) to belly-flop under high sweepers.', 'Hold GRAB at a wall’s edge to climb up ledges.', 'Not every door breaks — follow the crowd!',
  'Red Light Rush: start braking the moment the music stops — beans don’t stop on a dime.', 'Rope Rumble: watch the rope’s shadow, and don’t fall for the stall at the top!',
  'Hop between tiles in Tile Tumble: running wastes floor.', 'Trust Tiles: follow the beans who made it across!', 'Jump Ring: never jump while the high bar is coming.', 'Hammers swing in a rhythm — wait for the gap.', 'Bumpers bounce you — use them, or avoid them.',
  'Grab other beans to slow them down (it’s allowed!).', 'Win a show to unlock the Royal Crown hat!', 'Bouncy pads launch you over gaps — keep your speed up.',
  'Slime Surge: the slime keeps rising — and falling in knocks you out!', 'Wall Rush: look for the gap, or hop the short blocks.',
  'Colour Clash: get onto the colour on the big screen before the countdown ends.', 'Boulder Bash: sidestep the boulders and stay away from the edge.',
];

function faceSVG(k) {
  const eye = { 0: '<ellipse cx="17" cy="15" rx="2.6" ry="3.8" fill="#2a1050"/><ellipse cx="27" cy="15" rx="2.6" ry="3.8" fill="#2a1050"/>',
    1: '<path d="M14 16q3-5 6 0M24 16q3-5 6 0" stroke="#2a1050" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    2: '<path d="M14 15h6M24 15h6" stroke="#2a1050" stroke-width="2.4" stroke-linecap="round"/>',
    3: '<rect x="11" y="11" width="22" height="7" rx="3" fill="#1d1033"/><path d="M14 13l4 0" stroke="#fff" stroke-width="1.4"/>',
    4: '<path d="M17 18l-3.5-3.5a2 2 0 013.5-2 2 2 0 013.5 2z M27 18l-3.5-3.5a2 2 0 013.5-2 2 2 0 013.5 2z" fill="#ff3d7a"/>',
    5: '<ellipse cx="17" cy="16" rx="2.4" ry="3.2" fill="#2a1050"/><ellipse cx="27" cy="16" rx="2.4" ry="3.2" fill="#2a1050"/><path d="M13 10l7 2.5M31 10l-7 2.5" stroke="#2a1050" stroke-width="2.2" stroke-linecap="round"/>',
    6: '<ellipse cx="17" cy="15" rx="2.6" ry="3.8" fill="#2a1050"/><path d="M24 16q3-5 6 0" stroke="#2a1050" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    7: '<path d="M17 11l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z M27 11l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z" fill="#ffb300"/>',
    8: '<path d="M17 15m-.6 0a.6.6 0 101.2 0 1.6 1.6 0 10-3.2 0 2.6 2.6 0 105.2 0M27 15m-.6 0a.6.6 0 101.2 0 1.6 1.6 0 10-3.2 0 2.6 2.6 0 105.2 0" stroke="#2a1050" stroke-width="1.3" fill="none"/>',
    9: '<ellipse cx="16.5" cy="15" rx="3.4" ry="4.6" fill="#2a1050"/><ellipse cx="27" cy="15.5" rx="1.8" ry="2.5" fill="#2a1050"/><circle cx="17.5" cy="13.5" r="1.1" fill="#fff"/>',
    10: '<ellipse cx="17" cy="15" rx="3.2" ry="4.8" fill="#2a1050"/><ellipse cx="27" cy="15" rx="3.2" ry="4.8" fill="#2a1050"/><circle cx="18" cy="13" r="1.3" fill="#fff"/><circle cx="28" cy="13" r="1.3" fill="#fff"/><circle cx="16.3" cy="17" r=".7" fill="#fff"/><circle cx="26.3" cy="17" r=".7" fill="#fff"/>',
    11: '<ellipse cx="22" cy="15" rx="5" ry="6" fill="#2a1050"/><circle cx="23.3" cy="12.8" r="1.6" fill="#fff"/>' }[k] || '';
  return `<svg viewBox="0 0 44 30" width="46"><ellipse cx="22" cy="15" rx="17" ry="11" fill="#fff3ec" stroke="#2a1050" stroke-width="2"/>${eye}</svg>`;
}
function patternCSS(k, a, b) {
  return [a, `repeating-linear-gradient(0deg, ${a} 0 8px, ${b} 8px 16px)`, `radial-gradient(${b} 28%, transparent 31%) 0 0/14px 14px, ${a}`,
    `linear-gradient(135deg, ${b} 25%, transparent 25%) -7px 0/14px 14px, linear-gradient(225deg, ${b} 25%, transparent 25%) -7px 0/14px 14px, ${a}`,
    `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0/16px 16px`, `linear-gradient(90deg, ${b} 50%, ${a} 50%)`,
    `radial-gradient(circle at 30% 30%, ${b} 12%, transparent 14%) 0 0/16px 16px, ${a}`, `repeating-conic-gradient(${a} 0 30deg, ${b} 30deg 60deg)`,
    `linear-gradient(0deg, ${a}, ${b})`, `radial-gradient(circle at 35% 40%, ${b} 18%, transparent 20%) 0 0/18px 18px, ${a}`,
    `repeating-linear-gradient(90deg, transparent 0 6px, ${b}88 6px 10px), repeating-linear-gradient(0deg, ${a} 0 6px, ${b}88 6px 10px)`,
    `radial-gradient(ellipse 60% 40% at 50% 100%, transparent 70%, ${b} 72% 100%) 0 0/16px 12px, ${a}`,
    `radial-gradient(circle, transparent 30%, ${b} 33% 48%, transparent 51%) 0 0/14px 14px, ${a}`,
    `conic-gradient(from 45deg, ${b} 25%, ${a} 0 50%, ${b} 0 75%, ${a} 0) 0 0/14px 14px`,
    `radial-gradient(circle at 20% 30%, ${b} 22%, transparent 24%) 0 0/18px 16px, radial-gradient(circle at 70% 70%, ${b} 18%, transparent 20%) 0 0/14px 18px, ${a}`,
    `conic-gradient(${a}, ${b}, ${a}, ${b}, ${a})`][k] || a;
}
function itemIcon(it, look) {
  if (!it) return '';
  const A = look ? look.css : '#ff7ab8', B = look ? look.css2 : '#fff';
  if (it.slot === 'color') return `<div class="ic" style="background:${it.hex === 'rainbow' ? 'conic-gradient(#ff5fa2,#ffd23f,#40e0a8,#36b9ff,#b07bff,#ff5fa2)' : it.hex}"></div>`;
  if (it.slot === 'pattern') return `<div class="ic" style="background:${patternCSS(it.k, A.startsWith('linear') ? '#ff7ab8' : A, B)}"></div>`;
  if (it.slot === 'face') return `<div class="ic" style="background:${A.startsWith('linear') ? '#ff7ab8' : A}">${faceSVG(it.k)}</div>`;
  if (it.slot === 'tag') return `<div class="ic tagic">${OWNER_TAG}</div>`;
  return `<div class="ic">${HAT_EMOJI[it.k] || '❓'}</div>`;
}
const priceHTML = (p) => (p.c ? `<span class="price"><i class="fa-solid fa-crown" style="color:#ffb300"></i>${p.c}</span>` : `<span class="price"><span class="ico-berry"></span>${fmt(p.b)}</span>`);

class UI {
  constructor(app) {
    this.app = app; this.screen = null; this.lockerTab = 'color'; this.colorSlot = 'color'; this.feedItems = [];
    this.tags = []; this.lobbyChips = new Map(); this.ads = new Ads(document.getElementById('ui'));
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]'); if (go) { this.app.sound.play('click'); this.app.goto(go.dataset.go); return; }
      const act = e.target.closest('[data-act]'); if (act) { this.app.sound.play('click'); this.action(act.dataset.act, act); }
    });
    $$('.mode-toggle button').forEach((b) => b.addEventListener('click', () => { this.app.sound.play('click'); this.app.setMode(b.dataset.mode); }));
    $('#playBtn').addEventListener('click', () => this.app.play());
    $('#cancelBtn').addEventListener('click', () => this.app.cancel());
    $('#lobbyToggle').addEventListener('click', () => $('.lobby-panel').classList.toggle('collapsed'));
    const join = () => { this.app.sound.play('click'); const v = $('#roomIn').value; $('#roomIn').blur(); this.app.joinRoom(v); };
    // iOS scrolls the page up to make room for the keyboard: put it back afterwards
    document.addEventListener('focusout', (e) => { if (e.target.matches && e.target.matches('input, textarea')) setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input, textarea')) scrollTo(0, 0); }, 80); });
    $('#joinBtn').addEventListener('click', join);
    $('#roomIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    $('#roomIn').addEventListener('input', (e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); if (v !== e.target.value) e.target.value = v; });
    $('#startBtn').addEventListener('click', () => { this.app.sound.play('click'); this.app.startRoom(); });
    $('#roomCopy').addEventListener('click', () => { // share an invite link (opens the game straight into this room)
      const code = $('#roomCodeTxt').textContent, url = location.origin + location.pathname + '?room=' + code;
      const text = `Join my CranGuys room! Code: ${code}`, done = () => this.toast(`Invite link copied — send it to your friends! (Code ${code})`, 'good');
      const copy = () => { try { navigator.clipboard.writeText(text + '\n' + url).then(done, () => this.toast(`Your room code is ${code}`)); } catch { this.toast(`Your room code is ${code}`); } };
      if (navigator.share && isTouch()) navigator.share({ title: 'CranGuys', text, url }).catch(() => {}); else copy();
    });
    $$('#rankKind button').forEach((b) => b.addEventListener('click', () => { this.app.sound.play('click'); this.app.setRankKind(b.dataset.k); }));
    $('#rkLb').addEventListener('click', () => { this.app.sound.play('click'); this.leaderboardModal(); });
    $('#psClaim').addEventListener('click', () => this.app.claimPass());
    $$('#colorSlot button').forEach((b) => b.addEventListener('click', () => { this.colorSlot = b.dataset.slot; $$('#colorSlot button').forEach((x) => x.classList.toggle('on', x === b)); this.renderLocker(); }));
    this.renderShowCard();
  }

  action(a) {
    const app = this.app;
    switch (a) {
      case 'settings': return this.settingsModal();
      case 'account': return this.accountModal();
      case 'rename': return this.renameModal();
      case 'promo': return this.promoModal();
      case 'leaderboard': return this.leaderboardModal();
      case 'closeModal': return this.closeModal();
      case 'leave': return app.leaveShow();
      case 'leaveAsk': return this.confirm('Leave this show?', 'You’ll still get rewards for the rounds you’ve qualified from.', 'Leave', () => app.leaveShow());
      case 'specPrev': return app.cycleSpectate(-1);
      case 'specNext': return app.cycleSpectate(1);
      case 'toMenu': this.hideOverlay('rewards'); return app.goto('menu');
      case 'playAgain': this.hideOverlay('rewards'); app.goto('menu'); return app.play();
    }
  }

  // ---------------- screens ----------------
  show(id) {
    if (id !== this.screen && this.app.preview) this.app.clearPreview();
    this.screen = id;
    for (const s of $$('.screen')) s.classList.toggle('show', s.id === id);
    document.body.classList.toggle('subscreen', id === 'locker' || id === 'shop' || id === 'pass');
    document.body.classList.toggle('in-menu', id === 'menu' || id === 'locker' || id === 'shop' || id === 'pass');
    $$('.tabs-main .tab').forEach((t) => t.classList.toggle('on', t.dataset.go === id));
    if (id === 'menu' || id === 'locker' || id === 'shop' || id === 'pass') { $('#menu').classList.add('show'); for (const x of $$('#menu > *')) x.style.visibility = id === 'menu' ? '' : 'hidden'; $('#menu .tabs-main').style.visibility = ''; }
    if (id === 'locker') this.renderLocker();
    if (id === 'shop') this.renderShop();
    if (id === 'pass') this.renderPass(true);
    this.adSync();
  }
  overlay(id, on = true) { $('#' + id).classList.toggle('show', on); if (id === 'intro') document.body.classList.toggle('intro-on', !!on); if (id === 'rewards') this.adSync(); }
  // ads only on the main menu and the end-of-show screen (kept loaded but hidden in the Locker / Shop / Pass,
  // deleted as soon as a show starts)
  adSync() {
    const id = this.screen, sub = id === 'locker' || id === 'shop' || id === 'pass';
    this.ads.set($('#rewards').classList.contains('show') ? 'end' : id === 'menu' ? 'menu' : sub ? 'park' : null);
  }
  hideOverlay(id) { this.overlay(id, false); }
  updateReady() {
    if (document.getElementById('updPill')) return;
    const b = el('button', { class: 'upd-pill', id: 'updPill' }, '');
    b.innerHTML = '<i class="fa-solid fa-rotate"></i> New update! Tap to refresh';
    b.addEventListener('click', () => { if (this.app.state === 'show' && !confirm('Leave this show and update?')) return; location.reload(); });
    document.getElementById('ui').append(b);
  }
  overlayOn(id) { const o = document.getElementById(id); return !!o && o.classList.contains('show'); }
  modalOpen() { return $('#modal').classList.contains('show'); }
  migrating(on) { $('#migrating').classList.toggle('show', !!on); }
  touch(on) { $('#touch').classList.toggle('hide', !(on && (isTouch() || settings.forceTouch))); $('#touch').classList.toggle('show', on && (isTouch() || settings.forceTouch)); }
  boot(p, msg) { $('#boot .loadbar i').style.width = Math.round(p * 100) + '%'; if (msg) $('#boot .boot-msg').textContent = msg; }

  toast(msg, kind = '') {
    const t = el('div', { class: 'toast ' + kind }, msg); $('#toasts').append(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 2600);
  }

  // ---------------- profile & menu ----------------
  setProfile(p) {
    if (!p) return;
    this.profile = p;
    $$('.cur.berries b').forEach((b) => (b.textContent = fmt(p.berries)));
    $$('.cur.crowns b').forEach((b) => (b.textContent = fmt(p.crowns)));
    $('.lvl-n').textContent = p.level; $('.topbar .xpbar i').style.width = ((p.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100 + '%';
    $('.nameplate .nm').textContent = p.name;
    $('#npTag').classList.toggle('hide', tagOf(p.owned) !== 'owner');
    if (this.screen === 'locker') this.renderLocker();
    if (this.screen === 'pass') this.renderPass();
    this.passBadge();
    this.rankCard();
  }
  // ---------------- ranked ----------------
  rankCard() {
    const p = this.app.local && this.app.local.profile; if (!p) return;
    const r = rankOf(p.rp | 0), key = [r.rp, p.duelW, p.duelL, p.rkPlayed, p.rkWins, p.rpPeak].join();
    if (key === this._rkKey) return; this._rkKey = key;
    $('#rkBadge').innerHTML = rankBadge(r, 74);
    $('#rkName').textContent = r.name; $('#rkName').style.color = r.c[2];
    $('#rkBar').style.width = Math.round(r.pct * 100) + '%'; $('#rkBar').style.background = `linear-gradient(90deg, ${r.c[1]}, ${r.c[0]})`;
    $('#rkRp').textContent = r.next == null ? `${fmt(r.rp)} RP · top rank!` : `${fmt(r.rp)} RP · ${r.toNext} to ${RANKS[r.idx + 1].name}`;
    const peak = rankOf(p.rpPeak | 0);
    $('#rkStats').innerHTML = `<span><b>${p.duelW | 0}–${p.duelL | 0}</b> duels</span><span><b>${p.rkPlayed | 0}</b> ranked</span><span><b>${p.rkWins | 0}</b> <i class="fa-solid fa-crown"></i></span><span>Peak <b>${esc(peak.name)}</b></span>`;
    $('#rkLadder').innerHTML = TIERS.map((t, i) => `<span class="${i === r.tierIdx ? 'on' : i < r.tierIdx ? 'done' : ''}" title="${t.name}">${rankBadge(RANKS.find((k) => k.tierIdx === i), 22)}</span>`).join('');
    $('#rkLb').classList.remove('locked');
    $('#rkLb').innerHTML = '<i class="fa-solid fa-trophy"></i> Ranked leaderboard';
  }
  setRankKind(k) {
    $$('#rankKind button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    if (this.mode === 'ranked') this.setMode('ranked', true, k);
  }
  // Top: the ranked leaderboard (highest rank first) and the world records for every map
  async leaderboardModal(tab = 'rank') {
    if (!this.app.p2pOK) return this.modal(`<h3><i class="fa-solid fa-trophy"></i> Leaderboards</h3><p class="note">Leaderboards need an internet connection — try again when you’re online.</p>`);
    this.modal(`<h3><i class="fa-solid fa-trophy"></i> Leaderboards</h3>
      <div class="seg2 lb-tabs"><button class="btn small ${tab === 'rank' ? 'yellow' : 'ghost'}" data-lbt="rank"><i class="fa-solid fa-medal"></i> Ranked</button><button class="btn small ${tab === 'rec' ? 'yellow' : 'ghost'}" data-lbt="rec"><i class="fa-solid fa-stopwatch"></i> World records</button></div>
      <div id="lbBody"></div>`, (b) => {
      $$('[data-lbt]', b).forEach((x) => x.addEventListener('click', () => { this.app.sound.play('click'); this.leaderboardModal(x.dataset.lbt); }));
      if (tab === 'rec') this.renderRecords($('#lbBody', b)); else this.renderRankBoard($('#lbBody', b));
    });
  }
  async renderRankBoard(box) {
    const p = this.app.local.profile, played = (p.rkPlayed | 0) > 0;
    box.innerHTML = `<p class="lb-sub">Highest rank first — play a ranked duel or show to get on it.</p><p class="note">Loading…</p><div class="lb crowns" id="glb"></div><div class="lb-me" id="glbMe"></div>`;
    this.app.syncLeaderboard();
    let rows = [], failed = false;
    try { rows = await this.app.leaderboard(); } catch (e) { failed = true; }
    if (!box.isConnected) return;
    const me = this.app.myLbId();
    // our own entry may not have reached the brokers yet: show it anyway (the server's board is always up to date)
    if (played && !cloudOn() && !rows.some((x) => x.id === me)) { rows.push({ id: me, n: p.name, w: p.wins | 0, rp: p.rp | 0, lv: p.level, c: beanLook(p.loadout).css, tg: tagOf(p.owned), at: Date.now() }); rows.sort((a, c) => c.rp - a.rp || c.w - a.w || a.at - c.at); }
    $('.note', box).textContent = failed ? 'Couldn’t reach the leaderboard — check your connection.' : rows.length ? `${rows.length} bean${rows.length > 1 ? 's' : ''} · names are auto-moderated` : 'Nobody has played ranked yet — be the first!';
    const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1));
    $('#glb', box).innerHTML = rows.map((x, i) => `<div class="${x.id === me ? 'me' : ''}${i < 3 ? ' top' : ''}"><b>${medal(i)}</b><span>${rankBadge(x.rp, 24)}<i class="lbdot" style="background:${esc(x.c)}"></i>${esc(x.n)}${x.tg === 'owner' ? OWNER_TAG : ''}${x.id === me ? ' <em>you</em>' : ''}</span><span class="lbw lbr"><small>${esc(rankOf(x.rp).name)}</small>${fmt(x.rp)} RP</span></div>`).join('');
    const pos = rows.findIndex((x) => x.id === me);
    if (this.app.needsAccount()) { $('#glbMe', box).innerHTML = '<a href="#" id="glbIn">Sign in</a> and play a ranked match to put your bean on the board!'; $('#glbIn', box).addEventListener('click', (e) => { e.preventDefault(); this.accountModal(); }); return; }
    $('#glbMe', box).innerHTML = played ? (pos >= 0 ? `You’re <b>${medal(pos)}</b> · <b>${esc(rankOf(p.rp | 0).name)}</b> (${fmt(p.rp | 0)} RP)` : `You’re <b>${esc(rankOf(p.rp | 0).name)}</b> — not in the top 100 yet`) : 'Play a ranked match to put your bean on the board!';
    const mine = $('#glb .me', box); if (mine) mine.scrollIntoView({ block: 'nearest' });
  }
  async renderRecords(box) {
    box.innerHTML = `<p class="lb-sub">The fastest time anyone has ever done on each map (races and Crown Peak).</p><p class="note">Loading…</p><div class="lb recs" id="grec"></div>`;
    try { await this.app.loadRecords(); } catch (e) { /* shown below */ }
    if (!box.isConnected) return;
    const recs = this.app.records, pbs = (this.app.local.profile && this.app.local.profile.pbs) || {};
    $('.note', box).textContent = recs ? 'Beat one in a show to put your name on it!' : 'Couldn’t reach the records — check your connection.';
    $('#grec', box).innerHTML = Object.keys(REC_MAPS).map((id) => {
      const r = recs && recs.get(id), m = levelMeta(id), pb = pbs[id];
      return `<div><span class="recmap"><b>${esc(m.name)}</b><small>${pb ? `your best: ${fmtTime(pb)}` : 'your best: none yet'}</small></span><span class="rect">${r ? `<b>${fmtTime(r.t)}</b><small><i class="lbdot" style="background:${esc(r.c)}"></i>${esc(r.n)}${r.tg === 'owner' ? OWNER_TAG : ''}</small>` : '<b>—</b><small>up for grabs!</small>'}</span></div>`;
    }).join('');
  }
  recordsChanged() { if (this.app.game && this.overlayOn('intro')) this.introRecord(this.app.game.level); }
  introRecord(level) {
    const box = $('#icRec'); if (!box) return;
    const id = String(level.showId || level.id).split(':')[0], r = this.app.records && this.app.records.get(id);
    if (!REC_MAPS[id]) { box.classList.add('hide'); return; }
    box.classList.remove('hide');
    box.innerHTML = r ? `<i class="fa-solid fa-stopwatch"></i> World record <b>${fmtTime(r.t)}</b> · ${esc(r.n)}` : '<i class="fa-solid fa-stopwatch"></i> No world record yet — set the first!';
  }
  // live counts of real players, on the mode buttons and the PLAY button
  playerCounts(c) {
    if (!c) return;
    const set = (sel, n) => { const b = $(sel); if (!b) return; let i = b.querySelector('.pc'); if (!i) { i = el('i', { class: 'pc' }); b.append(i); } i.textContent = n; i.classList.toggle('hide', !n); };
    set('.mode-toggle [data-mode="online"]', c.online);
    set('.mode-toggle [data-mode="ranked"]', c.duel + c.ranked);
    set('#rankKind [data-k="duel"]', c.duel);
    set('#rankKind [data-k="ranked"]', c.ranked);
    const live = $('#liveCount');
    if (live) { live.classList.toggle('hide', !c.total); live.innerHTML = `<i class="dot"></i><b>${fmt(c.total)}</b> online now · <b>${fmt(c.online)}</b> in shows · <b>${fmt(c.duel)}</b> in duels · <b>${fmt(c.ranked)}</b> in ranked shows`; }
  }
  // ---------------- CranPass: the free reward roadmap ----------------
  passBadge() {
    const p = this.profile; if (!p) return;
    const n = Math.max(0, (p.level | 0) - Math.max(1, p.passClaimed | 0));
    $$('.tab[data-go="pass"] .badge').forEach((b) => { b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hide', !n); });
  }
  renderPass(scroll = false) {
    const p = this.profile; if (!p) return;
    const lv = p.level | 0, claimed = Math.max(1, p.passClaimed | 0), owned = new Set(p.owned), look = beanLook(p.loadout);
    const ready = passClaimable(p.xp, claimed, p.owned), last = Math.max(PASS_SHOWN, lv + 5);
    $('#psLvl').textContent = lv;
    $('#psXp').style.width = ((p.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100 + '%';
    $('#psXpT').textContent = `${fmt(p.xp % XP_PER_LEVEL)} / ${fmt(XP_PER_LEVEL)} XP to level ${lv + 1}`;
    const cb = $('#psClaim'), n = ready.levels.length;
    cb.disabled = !n;
    cb.innerHTML = n ? `<i class="fa-solid fa-gift"></i> CLAIM ${n} REWARD${n > 1 ? 'S' : ''}<small>${fmt(ready.berries)} Cranberries${ready.crowns ? ` · ${ready.crowns} Crown${ready.crowns > 1 ? 's' : ''}` : ''}${ready.items.length ? ` · ${ready.items.length} item${ready.items.length > 1 ? 's' : ''}` : ''}</small>` : '<i class="fa-solid fa-circle-check"></i> ALL CLAIMED<small>Play shows to earn XP and reach the next level</small>';
    const row = (l) => {
      const r = passReward(l, l <= claimed ? null : owned), st = l <= claimed ? 'got' : l <= lv ? 'ready' : 'locked';
      const it = r.item || r.dupe ? itemById(r.item || r.dupe) : null;
      const chips = [`<span class="pchip b"><span class="ico-berry"></span>${fmt(r.berries)}</span>`];
      if (r.crowns) chips.push(`<span class="pchip c"><i class="fa-solid fa-crown"></i>${r.crowns}</span>`);
      if (it) chips.push(`<span class="pchip it r-${it.rarity}" data-try="${it.id}" data-pass-item="${it.id}"><span class="pth" data-thumb="${it.id}" data-slot="${it.slot}">${itemIcon(it, look)}</span><b>${esc(it.name)}</b>${it.rarity === 'pass' ? '<em>PASS ONLY</em>' : ''}</span>`);
      return `<div class="prow ${st}${l === lv ? ' here' : ''}${l % 5 === 0 ? ' big' : ''}" data-lv="${l}"><div class="pnode"><b>${l}</b></div><div class="prew">${chips.join('')}</div><div class="pst">${st === 'got' ? '<i class="fa-solid fa-check"></i>' : st === 'ready' ? 'CLAIM' : '<i class="fa-solid fa-lock"></i>'}</div>${l === lv ? '<span class="phere">YOU</span>' : ''}</div>`;
    };
    const key = [lv, claimed, p.owned.length, p.loadout.color, p.loadout.hat].join();
    if (key !== this._psKey) {
      this._psKey = key;
      let html = ''; for (let l = 2; l <= last; l++) html += row(l);
      const road = $('#psRoad'); road.innerHTML = html;
      $$('[data-pass-item]', road).forEach((x) => x.addEventListener('click', () => { const it = itemById(x.dataset.passItem); if (it) this.app.tryOn(it, 'shop'); }));
      $$('.prow.ready', road).forEach((x) => x.addEventListener('click', (e) => { if (!e.target.closest('[data-pass-item]')) this.app.claimPass(); }));
      this.queueThumbs(road);
    }
    if (scroll) requestAnimationFrame(() => {
      const at = $(`#psRoad .prow[data-lv="${Math.max(2, Math.min(claimed + 1, lv))}"]`), w = $('#passWrap');
      if (at && w) w.scrollTop = Math.max(0, at.offsetTop - w.clientHeight * 0.45);
    });
  }
  renderShowCard() {
    const slots = [['race', 'Round 1'], ['race2', 'Round 2'], ['survival', 'Round 3'], ['final', 'Round 4']];
    $('.sc-rounds').innerHTML = slots.map(([type, lbl]) => {
      const T = TYPE[type], ids = type === 'race2' ? POOLS.race : POOLS[type], names = ids.map((id) => levelMeta(id).name).filter((n, i, a) => a.indexOf(n) === i);
      return `<div class="sc-round" style="background:${T.col}" title="${esc(names.join(' · '))}"><i class="fa-solid ${T.icon}"></i><b>${T.label}</b><small>${lbl}</small><small><i class="fa-solid fa-dice"></i> ${names.length} maps</small></div>`;
    }).join('');
  }
  setMode(mode, onlineAvailable, rankKind = this.app.rankKind) {
    this.mode = mode;
    $$('.mode-toggle button').forEach((b) => { b.classList.toggle('on', b.dataset.mode === mode); if (b.dataset.mode !== 'offline') b.disabled = !onlineAvailable; });
    $$('#rankKind button').forEach((b) => b.classList.toggle('on', b.dataset.k === rankKind));
    const rk = mode === 'ranked';
    $('#rankKind').classList.toggle('hide', !rk); $('#rankCard').classList.toggle('hide', !rk); $('.showcard').classList.toggle('hide', rk);
    if (rk) this.rankCard();
    this.playLabel = mode === 'friends' ? 'CREATE ROOM' : rk ? (rankKind === 'duel' ? 'FIND DUEL' : 'RANKED SHOW') : 'PLAY';
    $('#playBtn').classList.toggle('long', this.playLabel.length > 6);
    if (!$('#playBtn').classList.contains('searching')) $('.pb-main').textContent = this.playLabel;
    $('#roomJoin').classList.toggle('hide', mode !== 'friends');
    $('.sc-foot').innerHTML = mode === 'offline' ? '<i class="fa-solid fa-robot"></i> Just you and 59 bots — works without internet'
      : mode === 'friends' ? '<i class="fa-solid fa-users"></i> Make a room, share the code — bots fill the rest'
      : '<i class="fa-solid fa-globe"></i> Real players from anywhere · bots fill empty spots';
  }
  setStatus(text, ok = true) { $('.pb-status').textContent = text; $('#playBtn').classList.toggle('off', !ok); }
  setSearching(on, text) {
    const b = $('#playBtn'); b.classList.toggle('searching', on);
    $('.pb-main').textContent = on ? (this.mode === 'ranked' && this.app.rankKind === 'duel' ? 'SEARCHING' : 'FINDING SHOW') : this.playLabel || 'PLAY';
    if (text) this.setStatus(text);
    $('#cancelBtn').classList.toggle('hide', !on);
  }

  // ---------------- locker ----------------
  renderLocker() {
    const p = this.profile; if (!p) return;
    const tabs = [['color', 'Colours', 'fa-palette'], ['pattern', 'Patterns', 'fa-shapes'], ['face', 'Faces', 'fa-face-smile'], ['hat', 'Hats', 'fa-hat-cowboy']];
    $('#lockerTabs').innerHTML = tabs.map(([k, n, i]) => `<button data-tab="${k}" class="${k === this.lockerTab ? 'on' : ''}"><i class="fa-solid ${i}"></i>${n}</button>`).join('');
    $$('#lockerTabs button').forEach((b) => b.addEventListener('click', () => { this.app.sound.play('click'); this.lockerTab = b.dataset.tab; this.renderLocker(); }));
    $('#colorSlot').classList.toggle('hide', this.lockerTab !== 'color');
    const slot = this.lockerTab === 'color' ? this.colorSlot : this.lockerTab;
    const owned = new Set(p.owned), look = beanLook(p.loadout);
    const items = CATALOG.filter((i) => i.slot === this.lockerTab && (i.rarity !== 'exclusive' || owned.has(i.id))).sort((a, b) => (owned.has(b.id) - owned.has(a.id)) || Object.keys(RARITY).indexOf(a.rarity) - Object.keys(RARITY).indexOf(b.rarity));
    if (!this.shopData) this.app.backend.shop().then((s) => (this.shopData = s)).catch(() => {});
    const g = $('#lockerGrid'); g.innerHTML = '';
    for (const it of items) {
      const own = owned.has(it.id), eq = p.loadout[slot] === it.id;
      const d = el('div', { class: `item r-${it.rarity} ${own ? '' : 'locked'} ${eq ? 'eq' : ''}`, html: `<i class="shine"></i><div class="th" data-thumb="${it.id}" data-slot="${slot}">${itemIcon(it, look)}</div><div class="nm">${esc(it.name)}</div><span class="rar">${own ? '' : '<i class="fa-solid fa-lock"></i> '}${RARITY[it.rarity].name}</span>` });
      if (!own) d.append(el('span', { class: 'try-badge', html: '<i class="fa-solid fa-eye"></i>' }));
      if (this.app.preview && this.app.preview.id === it.id && this.app.preview.slot === slot) d.classList.add('trying');
      d.addEventListener('click', () => {
        if (!own) return this.app.tryOn(it, slot); // locked: preview it on your bean
        this.app.sound.play('pop'); this.app.clearPreview(); this.app.equip(slot, it.id);
      });
      g.append(d);
    }
    this.queueThumbs(g);
  }
  // swap the quick CSS icons for real renders, a few per frame so scrolling stays smooth
  queueThumbs(root) {
    const jobs = [...root.querySelectorAll('[data-thumb]')], token = (this._thumbJob = {});
    const apply = (e) => { const url = this.app.thumb(itemById(e.dataset.thumb), e.dataset.slot); if (url) { const im = new Image(); im.className = 'thimg'; im.alt = ''; im.src = url; e.append(im); e.classList.add('ready'); } };
    const step = () => {
      if (this._thumbJob !== token) return;
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 14) apply(jobs.shift());
      if (jobs.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------------- shop ----------------
  async renderShop() {
    const p = this.profile; let s;
    try { s = await this.app.backend.shop(); } catch (e) { this.toast(e.message, 'bad'); return; }
    this.shopData = s;
    const owned = new Set(p.owned), look = beanLook(p.loadout);
    const f = itemById(s.featured);
    const fo = owned.has(f.id);
    const slotOf = (it) => (it.slot === 'color' ? 'color' : it.slot);
    $('#shopFeatured').innerHTML = `<div class="feat card r-${f.rarity}" data-try="${f.id}"><span class="try-badge"><i class="fa-solid fa-eye"></i></span><div class="ic th big" data-thumb="${f.id}" data-slot="${slotOf(f)}">${itemIcon(f, look).replace('class="ic"', 'class="ic2"')}</div><div><span class="tag">★ FEATURED · ${RARITY[f.rarity].name.toUpperCase()}</span><h3>${esc(f.name)}</h3><p style="margin:4px 0 10px;color:#4b2a86">${f.slot === 'hat' ? 'Hat' : f.slot === 'color' ? 'Bean colour' : f.slot === 'face' ? 'Face' : 'Pattern'}</p>${fo ? '<div class="owned-tag">OWNED</div>' : `<button class="btn yellow buy" data-id="${f.id}">${priceHTML(f.price)}</button>`}</div></div>`;
    const g = $('#shopGrid'); g.innerHTML = '';
    for (const id of s.items) {
      const it = itemById(id), own = owned.has(id);
      g.append(el('div', { class: `sitem card r-${it.rarity}` + (this.app.preview && this.app.preview.id === id ? ' trying' : ''), 'data-try': id, html: `<i class="shine"></i><span class="try-badge"><i class="fa-solid fa-eye"></i></span><span class="rib" style="background:${RARITY[it.rarity].col}">${RARITY[it.rarity].name}</span><div class="ic th" data-thumb="${id}" data-slot="${slotOf(it)}">${itemIcon(it, look)}</div><div class="nm">${esc(it.name)}</div>${own ? '<div class="owned-tag">OWNED</div>' : `<button class="btn small buy" data-id="${id}">${priceHTML(it.price)}</button>`}` }));
    }
    this.queueThumbs($('#shop'));
    $$('#shop .buy').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.app.buy(b.dataset.id); }));
    $$('#shop [data-try]').forEach((c) => c.addEventListener('click', () => this.app.tryOn(itemById(c.dataset.try), 'shop')));
    clearInterval(this.shopIv);
    const tick = () => { const ms = s.refreshAt - Date.now(); $('#shopTimer').textContent = ms > 0 ? `New items in ${Math.floor(ms / 3.6e6)}h ${Math.floor((ms % 3.6e6) / 6e4)}m` : 'Refreshing…'; };
    tick(); this.shopIv = setInterval(tick, 30000);
  }

  // ---------------- try-on ----------------
  tryOnBar(it, slot) {
    const bar = $('#tryon');
    $$('.trying').forEach((x) => x.classList.remove('trying'));
    if (!it) { bar.classList.add('hide'); return; }
    const p = this.profile, owned = p && p.owned.includes(it.id), inShop = this.shopData && (this.shopData.items.includes(it.id) || this.shopData.featured === it.id);
    $$(`[data-try="${it.id}"]`).forEach((x) => x.classList.add('trying'));
    if (this.screen === 'locker') this.renderLocker();
    const tu = this.app.thumb(it, slot === 'shop' ? it.slot : slot);
    $('#toIcon').innerHTML = tu ? `<img class="to-th" src="${tu}" alt="">` : itemIcon(it, beanLook((this.app.preview && this.app.preview.loadout) || p.loadout));
    $('#toName').textContent = it.name;
    $('#toName').style.color = RARITY[it.rarity].col;
    const buy = $('#toBuy');
    if (owned) { buy.innerHTML = '<i class="fa-solid fa-check"></i> Equip'; buy.disabled = false; buy.onclick = () => { const s = this.app.preview.slot; this.app.clearPreview(); this.app.equip(s, it.id); }; $('#toNote').textContent = 'You own this!'; }
    else if (inShop) { buy.innerHTML = priceHTML(it.price); buy.disabled = false; buy.onclick = () => this.app.buy(it.id); $('#toNote').textContent = RARITY[it.rarity].name + (slot === 'color2' ? ' · pattern colour' : ''); }
    else if (passLevelOf(it.id)) { buy.innerHTML = `<i class="fa-solid fa-lock"></i> CranPass Lv ${passLevelOf(it.id)}`; buy.disabled = true; buy.onclick = null; $('#toNote').textContent = 'Free on the CranPass — level up to unlock it!'; }
    else if (it.rarity === 'exclusive') { buy.innerHTML = '<i class="fa-solid fa-gift"></i> Promo code only'; buy.disabled = true; buy.onclick = null; $('#toNote').textContent = 'Only from a special code.'; }
    else { buy.innerHTML = '<i class="fa-solid fa-lock"></i> Not in shop today'; buy.disabled = true; buy.onclick = null; $('#toNote').textContent = 'Check back when the shop refreshes!'; }
    $('#toOff').onclick = () => { this.app.sound.play('click'); this.app.clearPreview(); };
    bar.classList.remove('hide');
  }

  // ---------------- modals ----------------
  modal(html, onMount) { $('#modalBody').innerHTML = html; $('#modal').classList.add('show'); if (onMount) onMount($('#modalBody')); }
  closeModal() { $('#modal').classList.remove('show'); }
  confirm(title, text, yes, fn) {
    this.modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="seg2"><button class="btn ghost" data-act="closeModal">Stay</button><button class="btn pink" id="cfYes">${esc(yes)}</button></div>`, (b) => $('#cfYes', b).addEventListener('click', () => { this.closeModal(); fn(); }));
  }
  // promo codes: type a code, get the reward straight away (and a big reveal)
  promoModal() {
    this.modal(`<h3><i class="fa-solid fa-gift"></i> Promo code</h3><p class="note">Got a code? Type it in to unlock something special.</p>
      <input class="field promo-in" id="pcIn" maxlength="24" placeholder="ENTER CODE" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" inputmode="text">
      <button class="btn yellow" id="pcOk" style="width:100%"><i class="fa-solid fa-gift"></i> Redeem</button>`, (b) => {
      const go = async () => {
        const v = $('#pcIn', b).value; if (!v.trim()) return;
        $('#pcOk', b).disabled = true;
        try { const r = await this.app.redeem(v); this.promoReveal(r); }
        catch (e) { this.app.sound.play('error'); this.toast(e.message, 'bad'); $('#pcIn', b).classList.remove('shake'); void $('#pcIn', b).offsetWidth; $('#pcIn', b).classList.add('shake'); $('#pcOk', b).disabled = false; }
      };
      $('#pcOk', b).addEventListener('click', go); $('#pcIn', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      if (!isTouch()) setTimeout(() => $('#pcIn', b).focus(), 60);
    });
  }
  promoReveal({ promo, items }) {
    const all = (items || []).map(itemById).filter(Boolean), it = all[0] || null, url = it ? this.app.thumb(it, it.slot) : null, look = beanLook(this.profile.loadout);
    const extras = all.slice(1).map((x) => (x.slot === 'tag' ? OWNER_TAG : `<span class="pw-extra r-${x.rarity}">${itemIcon(x, look)}<b>${esc(x.name)}</b></span>`)).join('');
    const wearable = all.some((x) => x.slot !== 'tag');
    this.modal(`<div class="promo-win"><div class="pw-rays"></div><small>CODE REDEEMED!</small>
      ${it ? `<div class="pw-item r-${it.rarity}">${url ? `<img src="${url}" alt="">` : itemIcon(it, look)}</div><h3>${esc(all.length > 1 ? promo.title || it.name : it.name)}</h3><span class="pw-tag" style="background:${RARITY[it.rarity].col}">${RARITY[it.rarity].name.toUpperCase()}</span>` : `<h3>${esc(promo.title)}</h3>`}
      ${extras ? `<div class="pw-extras">+ ${extras}</div>` : ''}
      <p class="note">${esc(promo.note || 'Enjoy!')}</p>
      ${wearable ? `<button class="btn yellow" id="pwEq" style="width:100%"><i class="fa-solid fa-check"></i> Wear it now</button>` : ''}</div>`, (b) => {
      if (!wearable) return;
      $('#pwEq', b).addEventListener('click', () => {
        this.closeModal();
        const wear = promo.wear || { [it.slot]: it.id };
        for (const [slot, id] of Object.entries(wear)) if (this.profile.owned.includes(id)) this.app.equip(slot, id);
        this.app.goto('locker'); this.lockerTab = slotCategory(Object.keys(wear).includes('hat') ? 'hat' : it.slot); this.renderLocker();
      });
    });
    this.app.sound.play('buy'); setTimeout(() => this.app.sound.play('confetti'), 250);
    this.app.fx.confetti([0, 1.4, 0], 90, 9);
  }
  renameModal() {
    const p = this.profile;
    this.modal(`<h3>Your bean name</h3><input class="field" id="nmIn" maxlength="16" value="${esc(p.name)}"><button class="btn yellow" id="nmOk" style="width:100%"><i class="fa-solid fa-check"></i> Save</button>`, (b) => {
      const go = async () => { try { await this.app.rename($('#nmIn', b).value); this.closeModal(); } catch (e) { this.toast(e.message, 'bad'); } };
      $('#nmOk', b).addEventListener('click', go); $('#nmIn', b).addEventListener('keydown', (e) => e.key === 'Enter' && go());
    });
  }
  settingsModal() {
    const S = settings;
    const sw = (k) => `<div class="switch ${S[k] ? 'on' : ''}" data-k="${k}"></div>`;
    const sl = (k, min, max, step) => `<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}">`;
    this.modal(`<h3><i class="fa-solid fa-gear"></i> Settings</h3>
      <h4>Gameplay</h4>
      <div class="row"><label>Camera sensitivity</label>${sl('sens', 0.3, 2.5, 0.05)}</div>
      <div class="row"><label>Chat in online shows</label><select data-k="chat"><option value="on">On (auto-moderated)</option><option value="quick">Quick chat only</option><option value="off">Off</option></select></div>
      <div class="row"><label>Touch camera swipe</label><select data-k="swipeCam"><option value="follow">Camera follows finger</option><option value="classic">Drag the world (classic)</option></select></div>
      <div class="row"><label>Invert camera Y</label>${sw('invertY')}</div>
      <div class="row"><label>Auto-follow camera</label>${sw('autoCam')}</div>
      <div class="row"><label>Show nametags</label>${sw('nametags')}</div>
      <h4>Graphics</h4>
      <div class="row"><label>Quality</label><select data-k="quality"><option value="auto">Auto</option><option value="low">Low (fastest)</option><option value="medium">Medium</option><option value="high">High (shadows)</option></select></div>
      <div class="row"><label>Show FPS</label>${sw('fps')}</div>
      <h4>Audio</h4>
      <div class="row"><label>Master</label>${sl('master', 0, 1, 0.05)}</div>
      <div class="row"><label>Music</label>${sl('music', 0, 1, 0.05)}</div>
      <div class="row"><label>Effects</label>${sl('sfx', 0, 1, 0.05)}</div>
      <h4>Controls</h4>
      <div class="row"><label>Touch button size</label>${sl('touchSize', 0.75, 1.35, 0.05)}</div>
      <div class="keys"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Move (camera-relative)</span><span><kbd>Space</kbd></span><span>Jump</span><span><kbd>Ctrl</kbd> / <kbd>C</kbd></span><span>Dive</span><span><kbd>E</kbd> (hold)</span><span>Grab beans, ledges &amp; the crown</span><span>Mouse / <kbd>J</kbd><kbd>L</kbd></span><span>Camera (click to lock mouse)</span><span>Gamepad</span><span>A jump · X dive · RT grab · sticks</span><span>Touch</span><span>Left stick · drag right side to look</span></div>
      <h4>Server</h4>
      <div class="row"><label>CranGuys server URL<br><small style="color:#4b2a86">Blank = this website</small></label></div>
      <input class="field" data-k="server" placeholder="https://your-cranguys.onrender.com" value="${esc(S.server)}">
      <p class="note">Changing the server reloads the game.</p>`, (b) => {
      $$('.switch', b).forEach((s) => s.addEventListener('click', () => { S[s.dataset.k] = !S[s.dataset.k]; s.classList.toggle('on', S[s.dataset.k]); saveSettings(); this.app.applySettings(); }));
      $$('input[type=range]', b).forEach((r) => r.addEventListener('input', () => { S[r.dataset.k] = +r.value; saveSettings(); this.app.applySettings(); }));
      const q = $('select[data-k=quality]', b); q.value = S.quality; q.addEventListener('change', () => { S.quality = q.value; saveSettings(); this.app.applySettings(); });
      const sc = $('select[data-k=swipeCam]', b); sc.value = S.swipeCam; sc.addEventListener('change', () => { S.swipeCam = sc.value; saveSettings(); });
      const ch = $('select[data-k=chat]', b); ch.value = S.chat || 'on'; ch.addEventListener('change', () => { S.chat = ch.value; saveSettings(); });
      const sv = $('input[data-k=server]', b); sv.addEventListener('change', () => { S.server = sv.value.trim(); saveSettings(); location.reload(); });
    });
  }
  async accountModal() {
    const app = this.app, p = this.profile, online = app.mode === 'online' && app.onlineOK; // logins only exist on a CranGuys server
    if (cloudOn() && !online) return this.cloudAccountModal();
    let lb = [];
    try { lb = await app.backend.leaderboard(); } catch {}
    const stats = `<div class="seg2"><div class="note"><b>${p.wins}</b> wins</div><div class="note"><b>${p.shows}</b> shows</div><div class="note"><b>${p.finals}</b> finals</div><div class="note">Lv <b>${p.level}</b></div></div>`;
    let acct;
    if (!online) acct = `<p class="note"><i class="fa-solid fa-circle-check"></i> <b>No sign-in needed!</b> Your bean, Cranberries and items are saved on this device, and Online and Friends games work without an account — other players only see your bean’s name and outfit.</p>${this.saveCodeHtml()}`;
    else if (p.guest) acct = `<p class="note">You’re a <b>guest</b>. Create a login to keep your bean on any device.</p>
      <input class="field" id="acU" placeholder="Username" maxlength="16" autocapitalize="off" autocomplete="username"><input class="field" id="acP" type="password" placeholder="Password (6+ characters)" autocomplete="current-password">
      <div class="seg2"><button class="btn mint" id="acReg"><i class="fa-solid fa-user-plus"></i> Create login</button><button class="btn ghost" id="acLog"><i class="fa-solid fa-right-to-bracket"></i> Sign in</button></div>`;
    else acct = `<p class="note">Signed in as <b>${esc(p.username)}</b>.</p><button class="btn ghost" id="acOut"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>`;
    this.modal(`<h3><i class="fa-solid fa-user"></i> ${esc(p.name)}</h3>${stats}<h4>Account</h4>${acct}<h4><i class="fa-solid fa-trophy"></i> Top beans</h4><div class="lb">${lb.length ? lb.map((r, i) => `<div><b>#${i + 1}</b><span>${esc(r.name)}</span><span><i class="fa-solid fa-crown" style="color:#ffb300"></i> ${r.wins}</span></div>`).join('') : '<p class="note">No shows played yet — be the first!</p>'}</div>`, (b) => {
      const U = () => $('#acU', b).value.trim(), P = () => $('#acP', b).value;
      const run = (fn) => async () => { try { await fn(); this.closeModal(); this.toast('Welcome, ' + this.profile.name + '!', 'good'); } catch (e) { this.toast(e.message, 'bad'); } };
      if ($('#acReg', b)) $('#acReg', b).addEventListener('click', run(() => app.account('register', U(), P())));
      if ($('#acLog', b)) $('#acLog', b).addEventListener('click', run(() => app.account('login', U(), P())));
      if ($('#acOut', b)) $('#acOut', b).addEventListener('click', run(() => app.account('logout')));
      this.wireSaveCode(b);
    });
  }

  // Accounts (Supabase): sign in with a code sent to your email; your bean then lives in your account.
  cloudAccountModal(step = {}) {
    const app = this.app, L = app.local, p = this.profile;
    const stats = `<div class="seg2"><div class="note"><b>${p.wins}</b> wins</div><div class="note"><b>${p.shows}</b> shows</div><div class="note"><b>${p.finals}</b> finals</div><div class="note">Lv <b>${p.level}</b></div></div>`;
    let acct;
    if (L.signedIn) acct = `<p class="note"><i class="fa-solid fa-circle-check"></i> Signed in as <b>${esc(L.email)}</b>. Your bean, Cranberries, items and rank are saved to your account — sign in on any device to carry on.</p>
      <div class="seg2"><button class="btn ghost" id="acOut"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button><button class="btn ghost" id="acDel"><i class="fa-solid fa-trash"></i> Delete account</button></div>`;
    else if (!step.email) acct = `<p class="note">Sign in with your email to keep your bean on any device, play <b>Ranked</b> and get on the leaderboards. There’s no password: we email you a 6-digit code.</p>
      <input class="field" id="acEmail" type="email" placeholder="Your email" autocomplete="email" autocapitalize="off" spellcheck="false" inputmode="email" enterkeyhint="send" value="${esc(step.last || '')}">
      <button class="btn mint" id="acSend" style="width:100%"><i class="fa-solid fa-envelope"></i> Email me a code</button>
      <p class="note">No account needed to play: without one, your bean is saved on this device.</p>${this.saveCodeHtml()}`;
    else acct = `<p class="note">We sent a code to <b>${esc(step.email)}</b>. It can take a minute — check your spam folder too.</p>
      <input class="field" id="acCode" placeholder="6-digit code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" enterkeyhint="go">
      <p class="note"><i class="fa-solid fa-circle-check"></i> New account? Your bean comes with you: Lv ${p.level}, ${fmt(p.berries)} Cranberries, your items and your rank.</p>
      <div class="seg2"><button class="btn mint" id="acVerify"><i class="fa-solid fa-right-to-bracket"></i> Sign in</button><button class="btn ghost" id="acBack">Use another email</button></div>`;
    this.modal(`<h3><i class="fa-solid fa-user"></i> ${esc(p.name)}</h3>${stats}<h4>Account</h4>${acct}`, (b) => {
      const busy = (btn, on) => { btn.disabled = on; btn.classList.toggle('busy', on); };
      const fail = (e) => { app.sound.play('error'); this.toast(e.message || 'Something went wrong — try again.', 'bad'); };
      const send = $('#acSend', b), verify = $('#acVerify', b);
      if (send) {
        const go = async () => {
          const email = $('#acEmail', b).value; busy(send, true);
          try { const to = await sendCode(email); app.sound.play('click'); this.cloudAccountModal({ email: to }); setTimeout(() => { const c = $('#acCode'); if (c) c.focus(); }, 50); }
          catch (e) { busy(send, false); fail(e); }
        };
        send.addEventListener('click', go);
        $('#acEmail', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      if (verify) {
        const go = async () => {
          busy(verify, true);
          try { await L.signIn(step.email, $('#acCode', b).value); app.sound.play('buy'); this.closeModal(); }
          catch (e) { busy(verify, false); fail(e); }
        };
        verify.addEventListener('click', go);
        $('#acCode', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        $('#acBack', b).addEventListener('click', () => this.cloudAccountModal({ last: step.email }));
      }
      if ($('#acOut', b)) $('#acOut', b).addEventListener('click', async () => { await L.signOut(); this.closeModal(); });
      if ($('#acDel', b)) $('#acDel', b).addEventListener('click', () => this.confirm('Delete your account?', 'This deletes your account and everything saved in it — your bean’s progress, items and rank — for good. The guest bean on this device stays.', 'Delete it', async () => {
        try { await L.deleteAccount(); } catch (e) { fail(e); }
      }));
      this.wireSaveCode(b);
    });
  }
  // guests: move a bean between devices with a code, no account needed
  saveCodeHtml() {
    return `<h4><i class="fa-solid fa-link"></i> Move your bean to another device</h4>
      <p class="note">Copy your save code here, then on the other device open this screen and tap <b>Load save code</b>.</p>
      <div class="seg2"><button class="btn mint" id="svCopy"><i class="fa-solid fa-copy"></i> Copy save code</button><button class="btn ghost" id="svShow"><i class="fa-solid fa-right-to-bracket"></i> Load save code</button></div>
      <div id="svBox" class="hide"><textarea class="field" id="svIn" rows="3" placeholder="Paste your save code (starts with CG1-)" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea><button class="btn yellow" id="svLoad" style="width:100%">Load my bean</button></div>`;
  }
  wireSaveCode(b) {
    const app = this.app;
    if ($('#svCopy', b)) $('#svCopy', b).addEventListener('click', () => {
      const code = app.local.exportCode(), done = () => this.toast('Save code copied! Paste it on your other device.', 'good');
      const fallback = () => { $('#svBox', b).classList.remove('hide'); $('#svIn', b).value = code; $('#svIn', b).select(); this.toast('Copy the code from the box.'); };
      try { navigator.clipboard.writeText(code).then(done, fallback); } catch { fallback(); }
    });
    if ($('#svShow', b)) $('#svShow', b).addEventListener('click', () => { $('#svBox', b).classList.remove('hide'); $('#svIn', b).value = ''; $('#svIn', b).focus(); });
    if ($('#svLoad', b)) $('#svLoad', b).addEventListener('click', async () => {
      try { const p2 = await app.local.importCode($('#svIn', b).value); app.backend = app.local; this.setProfile(p2); app.refreshBean(); this.closeModal(); this.toast(`Welcome back, ${p2.name}!`, 'good'); app.sound.play('buy'); }
      catch (e) { app.sound.play('error'); this.toast(e.message, 'bad'); }
    });
  }

  // ---------------- lobby ----------------
  lobbyInit(game) {
    this.lobbyChips.clear();
    const g = $('#lobbyGrid'); g.innerHTML = '';
    for (let i = 0; i < 60; i++) g.append(el('div', { class: 'chip empty' }, el('div', { class: 'bn' }), el('span', {}, '…')));
    for (const r of game.roster.values()) if (r.status !== 'gone') this.lobbyJoin(r, true);
    $('#lobbyMax').textContent = 60;
    this.realPlayers(game);
    const others = [...game.roster.values()].filter((r) => !r.bot && r.slot !== game.you && r.status !== 'gone');
    if (others.length) { this.toast(`⭐ ${others.length === 1 ? others[0].name + ' is a real player' : others.length + ' real players are'} in this show!`, 'gold'); this.app.sound.play('join'); }
    this.roomInfo(game);
    this.tipI = Math.floor(Math.random() * TIPS.length); $('#lobbyTip').textContent = '💡 ' + TIPS[this.tipI];
  }
  lobbyJoin(r, silent) {
    if (!r || this.lobbyChips.has(r.slot) || this.app.game?.phase !== PHASE.LOBBY) return;
    const chips = $$('#lobbyGrid .chip.empty'); const c = chips[0]; if (!c) return;
    c.className = 'chip' + (r.slot === this.app.game.you ? ' me' : !r.bot ? ' human' : '');
    c.querySelector('.bn').style.background = r.look.css; c.querySelector('span').innerHTML = (r.tag === 'owner' ? '<i class="fa-solid fa-gem ogem"></i>' : '') + esc(r.name); if (r.tag === 'owner') c.classList.add('owner');
    this.lobbyChips.set(r.slot, c);
    if (!r.bot && r.slot !== this.app.game.you) { this.realPlayers(this.app.game); if (!silent) { this.toast(`⭐ ${r.name} joined — a real player!`, 'gold'); this.app.sound.play('join'); } }
    else if (!silent) this.app.sound.play('join', 0.6);
  }
  // every human in the show, highlighted in gold: in the lobby panel and in a HUD list that stays up all game
  realPlayers(game) {
    if (!game) return;
    const hum = [...game.roster.values()].filter((r) => !r.bot && r.status !== 'gone');
    const others = hum.filter((r) => r.slot !== game.you);
    $('#lpReal').classList.toggle('hide', !others.length && !game.kind);
    $('#hudReal').classList.toggle('hide', !others.length || game.duel);
    $('#realN').textContent = hum.length;
    const st = (r) => (r.status === 'q' ? '✅' : r.status === 'x' ? '❌' : r.status === 'left' ? '👋' : '');
    const badge = (r) => (game.kind && r.rp != null ? `<span class="rb" title="${esc(rankOf(r.rp).name)}">${rankBadge(r.rp, 20)}</span>` : '');
    const item = (r) => `<div class="real-item${r.slot === game.you ? ' me' : ''}${r.status === 'x' || r.status === 'left' ? ' out' : ''}"><span class="bn" style="background:${r.look.css}"></span>${badge(r)}<b>${esc(r.name)}</b>${r.tag === 'owner' ? OWNER_TAG : ''}${r.slot === game.you ? '<small>you</small>' : ''}<em>${game.duel ? '' : st(r)}</em></div>`;
    const html = hum.sort((a, b) => (a.slot === game.you ? -1 : b.slot === game.you ? 1 : a.slot - b.slot)).map(item).join('');
    if (html !== this._realHTML) { this._realHTML = html; $('#realList').innerHTML = html; $('#hudRealList').innerHTML = html; }
  }
  lobbyLeave(slot) { const g = this.app.game, r = g && g.roster.get(slot); if (r && !r.bot) setTimeout(() => this.realPlayers(this.app.game), 0); const c = this.lobbyChips.get(slot); if (c) { c.className = 'chip empty'; c.querySelector('.bn').style.background = ''; c.querySelector('span').textContent = '…'; this.lobbyChips.delete(slot); } }
  // private rooms: show the code, and a START button for the host while the lobby is held
  roomInfo(game) {
    const host = !!(this.app.conn && this.app.conn.isHost);
    $('#roomBadge').classList.toggle('hide', !game.room);
    if (game.room) $('#roomCodeTxt').textContent = game.room;
    $('#startBtn').classList.toggle('hide', !(host && game.hold && !game.kind));
  }
  lobbyTick(game) {
    if (game.kind && game.hold) { // ranked: waiting for enough real players
      let h = 0; for (const r of game.roster.values()) if (!r.bot && r.status !== 'gone') h++;
      $('#lobbyTimer').textContent = game.duel ? 'SEARCHING' : `${h} / ${game.need || MIN_SHOW_HUMANS}`;
      $('#lobbyWhen').textContent = game.duel ? 'waiting for an opponent — anyone can take you on…' : 'real players needed to start the ranked show';
    } else if (game.kind) { $('#lobbyTimer').textContent = clock(game.timeLeft()); $('#lobbyWhen').textContent = game.duel ? 'opponent found! duel starts in' : 'ranked show starts in'; }
    else if (game.hold) {
      const host = !!(this.app.conn && this.app.conn.isHost);
      $('#lobbyTimer').textContent = host ? 'READY?' : 'SOON';
      $('#lobbyWhen').textContent = host ? 'press START when your friends are in' : 'waiting for the host to start';
    } else { $('#lobbyTimer').textContent = clock(game.timeLeft()); $('#lobbyWhen').textContent = 'show starts in'; }
    if (!$('#startBtn').classList.contains('hide') !== !!(game.hold && !game.kind && this.app.conn && this.app.conn.isHost)) this.roomInfo(game);
    let n = 0; for (const r of game.roster.values()) if (r.status !== 'gone') n++;
    $('#lobbyFill').textContent = n;
    if (Math.floor(performance.now() / 6000) !== this.tipT) { this.tipT = Math.floor(performance.now() / 6000); $('#lobbyTip').textContent = '💡 ' + TIPS[(this.tipI + this.tipT) % TIPS.length]; }
  }

  // ---------------- in-show HUD ----------------
  hudRound(game) {
    const L = game.level, T = TYPE[L.type] || TYPE.race;
    $('#hRoundN').textContent = game.duel ? `DUEL · ROUND ${game.round + 1} · ${T.label}` : game.isFinal ? `THE FINAL · ${T.label}` : `ROUND ${game.round + 1} · ${T.label}`; $('#hRoundName').textContent = L.name;
    this.duelBoard(game);
    $('#hFeed').innerHTML = ''; this.feedItems = [];
    $('#hObjective').textContent = '';
  }
  // 1v1: both beans, their ranks and the round score, all game long
  duelBoard(game) {
    const box = $('#duelBoard'); box.classList.toggle('hide', !game.duel); if (!game.duel) return;
    const ds = [...game.roster.values()].filter((r) => !r.bot && r.status !== 'gone').sort((a, b) => (a.slot === game.you ? -1 : b.slot === game.you ? 1 : 0));
    const side = (r) => (r ? `<div class="db-p${r.slot === game.you ? ' me' : ''}">${r.rp != null ? rankBadge(r.rp, 26) : ''}<span class="bn" style="background:${r.look.css}"></span><b>${esc(r.slot === game.you ? 'You' : r.name)}${r.tag === 'owner' ? ' <i class="fa-solid fa-gem ogem"></i>' : ''}</b></div>` : '<div class="db-p"><b>…</b></div>');
    const w = (r) => (r ? game.dw[r.slot] | 0 : 0);
    const html = `${side(ds[0])}<div class="db-score"><b>${w(ds[0])}</b><i>:</i><b>${w(ds[1])}</b><small>FIRST TO ${DUEL_WINS}</small></div>${side(ds[1])}`;
    if (html !== this._dbHTML) { this._dbHTML = html; box.innerHTML = html; }
  }
  hud(game, spectName) {
    const L = game.level, c = game.counts, k = $('#hCounter .k'), b = $('#hCounter b'), fin = game.isFinal;
    let key, val;
    if (game.duel) { key = '1v1 DUEL'; val = L.type === 'race' ? 'FIRST TO FINISH' : L.type === 'final' ? 'GRAB THE CROWN' : L.type === 'hunt' ? 'MOST POINTS' : 'OUTLAST THEM'; }
    else if (L.type === 'race') { key = fin ? 'FIRST WINS' : 'QUALIFIED'; val = `${c.q} / ${c.Q || game.Q}`; }
    else if (L.type === 'survival') { key = fin ? 'LAST BEAN STANDING' : 'BEANS LEFT'; val = fin ? `${c.alive} left` : `${c.alive} → ${c.Q || game.Q}`; }
    else if (L.type === 'hunt') {
      const me = game.roster.get(game.you), mine = me ? me.score | 0 : 0, all = [...game.roster.values()].filter((r) => r.status === 'in' || r.status === 'q').map((r) => r.score | 0).sort((a, b) => b - a);
      const Q = c.Q || game.Q, cut = all.length >= Q ? all[Q - 1] : 0, place = all.filter((v) => v > mine).length + 1;
      key = `YOUR POINTS · #${place}`; val = `${mine} pts`;
      const tag = `Top ${Q} go through · cut-off ${cut} pt${cut === 1 ? '' : 's'}`; if ($('#hObjective').textContent !== tag && game.phase === PHASE.PLAY && performance.now() - (this.objT || 0) > 4000) $('#hObjective').textContent = tag;
    }
    else { key = 'GRAB THE CROWN'; val = `${c.alive} left`; }
    if (val !== this._cv) { if (this._cv) $('#hCounter').classList.remove('bump'), void $('#hCounter').offsetWidth, $('#hCounter').classList.add('bump'); this._cv = val; k.textContent = key; b.textContent = val; }
    // survival rounds have no deadline worth showing: count up instead
    const up = !!L.noClock, limit = game.timeLimit || L.timeLimit;
    const left = game.phase === PHASE.PLAY ? Math.max(0, game.timeLeft() - 2) : game.phase === PHASE.COUNTDOWN || game.phase === PHASE.INTRO ? limit : 0;
    const shown = up ? (game.phase === PHASE.PLAY ? Math.max(0, limit - left) : 0) : left;
    $('#hTimer').textContent = clock(shown);
    $('.h-timer').classList.toggle('low', !up && game.phase === PHASE.PLAY && left < 15);
    $('.h-timer').classList.toggle('up', up);
    this.colourTarget(game);
    // Slime Surge: how close the rising slime is
    const rise = L.rules && L.rules.rise;
    const sy = rise ? Math.min(rise.max, rise.y0 + rise.rate * Math.max(0, game.serverTick() / 30 - rise.t0)) : 0, sgap = rise && game.meActive ? game.me.p[1] - 0.78 - sy : 99;
    if (rise && game.phase === PHASE.PLAY && game.meActive && sy < rise.max && sgap < 9 && performance.now() - (this.objT || 0) > 4000) {
      const y = sy, gap = sgap;
      const tag = gap < 3 ? `🟢 THE SLIME IS RIGHT BEHIND YOU! (${Math.max(0, gap).toFixed(1)} m)` : `🟢 Slime rising · ${gap.toFixed(0)} m below you`;
      $('#hObjective').textContent = tag; $('#hObjective').classList.toggle('warn', gap < 3);
    } else if ($('#hObjective').classList.contains('warn')) { $('#hObjective').classList.remove('warn'); $('#hObjective').textContent = ''; }
    this.crownHint(game);
    const sp = $('#spectate');
    sp.classList.toggle('hide', !spectName);
    if (spectName) $('#specName').textContent = spectName;
  }
  objective(text) { $('#hObjective').textContent = text || ''; this.objT = performance.now(); }
  // Red Light Rush: the big traffic light at the top of the screen
  lightHud(phase) {
    const box = $('#hLight');
    if (!phase || phase === 'wait') { if (!box.classList.contains('hide')) box.classList.add('hide'); return; }
    const k = phase === 'green' ? 'green' : phase === 'turn' ? 'turn' : 'red';
    if (box.dataset.k === k && !box.classList.contains('hide')) return;
    box.dataset.k = k; box.classList.remove('hide');
    box.className = 'h-light ' + k;
    $('#hlTxt').textContent = k === 'green' ? 'GREEN LIGHT — RUN!' : k === 'turn' ? 'RED LIGHT — STOP!' : 'FREEZE! DON’T MOVE!';
  }
  // Crown Peak: a pill that stays up the whole duel round, and gets loud near the summit for everyone
  crownHint(game) {
    const box = $('#hCrown'), L = game.level;
    let near = false, show = false;
    if (L && L.type === 'final' && L.id === 'crownpeak' && game.phase === PHASE.PLAY && game.meActive) {
      const c = crownAt(game.serverTick() / 30), p = game.me.p;
      near = Math.hypot(p[0] - c[0], p[2] - c[2]) < 11 && p[1] > c[1] - 7;
      show = near || !!game.duel;
    }
    box.classList.toggle('hide', !show); box.classList.toggle('near', near);
    if (!show) return;
    const key = isTouch() ? 'GRAB' : 'GRAB (E)', txt = near ? `👑 JUMP & HOLD ${key} ON THE CROWN!` : '👑 Grab the crown at the top to win!';
    if (box.textContent !== txt) box.textContent = txt;
  }
  // Colour Clash: the colour to stand on, with a countdown bar, mirrored from the big screen
  colourTarget(game) {
    const box = $('#hTarget'), cm = game.level && game.level.cm;
    if (!cm || game.phase !== PHASE.PLAY) { box.classList.add('hide'); return; }
    const t = Math.max(0, game.serverTick() / 30), P = cmCycle(cm.plan, t), ph = cmPhase(P, t);
    box.classList.remove('hide');
    if (!P || ph === 'ready' || ph === 'back') { box.className = 'h-target wait'; $('#htName').textContent = 'GET READY…'; $('#htSw').style.background = '#fff'; $('#htBar').style.width = '0%'; return; }
    const col = CM_COLORS[P.target];
    box.className = 'h-target ' + ph; $('#htName').textContent = ph === 'drop' ? `${col.name}!` : `STAND ON ${col.name}`; $('#htSw').style.background = col.hex;
    $('#htBar').style.width = ph === 'show' ? Math.max(0, Math.min(100, (1 - (t - P.t - P.ready) / (P.show - P.ready)) * 100)) + '%' : '0%';
    if (ph === 'show' && this._cmBeep !== Math.ceil(P.t + P.show - t) && P.t + P.show - t < 3.2) { this._cmBeep = Math.ceil(P.t + P.show - t); this.app.sound.play('tick', 0.7); }
  }
  feed(text, kind = '') {
    const d = el('div', { class: kind }, text); $('#hFeed').prepend(d);
    this.feedItems.push(d); if (this.feedItems.length > 5) this.feedItems.shift().remove();
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 4000);
  }
  nametags(list) {
    const root = $('#nametags');
    while (this.tags.length < list.length) { const t = el('div', { class: 'tag' }); root.append(t); this.tags.push(t); }
    for (let i = 0; i < this.tags.length; i++) {
      const t = this.tags[i], d = list[i];
      if (!d) { if (t.style.opacity !== '0') t.style.opacity = '0'; continue; }
      const nk = d.name + (d.o ? '|o' : '');
      if (t._n !== nk) { t.innerHTML = esc(d.name) + (d.o ? `<span class="ob">${icon('gem')}OWNER</span>` : ''); t._n = nk; t.classList.toggle('owner', !!d.o); }
      if (t._h !== !!d.h) { t._h = !!d.h; t.classList.toggle('human', t._h); }
      t.style.opacity = '1';
      t.style.transform = `translate(${d.x}px, ${d.y}px) translate(-50%, -100%) scale(${d.s})`;
    }
  }
  fps(text) { const f = $('#fps'); f.classList.toggle('hide', !settings.fps); if (settings.fps) f.textContent = text; }

  // ---------------- round flow ----------------
  intro(m, level) {
    const fin = !m.duel && (!!m.final || m.i === m.n - 1), type = fin ? 'final' : level.type, T = TYPE[type] || TYPE.race;
    const g = this.app.game, sc = m.duel && g ? (() => { const me = g.dw[g.you] | 0, op = Object.entries(g.dw).filter(([s]) => +s !== g.you).reduce((a, [, w]) => Math.max(a, w | 0), 0); return ` · ${me}–${op}`; })() : '';
    $('#icRound').textContent = m.duel ? `⚔ DUEL · ROUND ${m.i + 1}${sc}` : fin ? 'THE FINAL' : `ROUND ${m.i + 1} OF ${m.n}`;
    const ty = $('#icType'); ty.textContent = T.label; ty.className = 'ic-type ' + type;
    $('#icDesc').textContent = (fin && level.descFinal) || level.desc; $('#icTip').textContent = level.tip;
    $('#icQ').textContent = m.duel ? (level.type === 'race' ? '⚔ First over the line takes the round' : level.type === 'final' ? '⚔ First to grab the crown takes the round' : level.type === 'hunt' ? '⚔ Most points takes the round' : '⚔ Outlast your opponent to take the round')
      : level.type === 'hunt' ? `🎯 Top ${m.Q} of ${m.count} beans qualify` : level.type === 'race' ? (fin ? '👑 First bean over the line wins!' : `🏁 ${m.Q} of ${m.count} beans qualify`)
      : level.type === 'survival' ? (fin ? `👑 ${m.count} finalists · last bean standing wins` : `💥 Survive until only ${m.Q} remain`) : `👑 ${m.count} finalists · 1 crown`;
    // duels on Crown Peak: reaching the summit isn't enough — make that impossible to miss
    const cw = $('#icWarn'), crownDuel = m.duel && level.type === 'final';
    cw.classList.toggle('hide', !crownDuel);
    if (crownDuel) cw.innerHTML = `👑 REMEMBER: GRAB THE CROWN AT THE VERY TOP! 👑<small>Standing on the summit doesn't count — jump up and hold ${isTouch() ? 'the GRAB button' : 'GRAB (E / Shift)'} on the floating crown.</small>`;
    const pool = (m.duel ? Object.values(DUEL_POOLS).flat() : fin ? POOLS.final : POOLS[level.type] || []).map((id) => levelMeta(id).name);
    this.reel([...new Set(pool.length ? pool : [level.name])], level.name);
    this.introRecord(level);
    this.overlay('intro', true);
  }
  // slot-machine style map reveal
  reel(names, land) {
    const nm = $('#icName'), card = $('#intro .intro-card');
    clearTimeout(this.reelT);
    card.classList.add('spinning'); nm.classList.remove('landed');
    const seq = [], at = [], start = Math.floor(Math.random() * names.length), steps = 13 + Math.floor(Math.random() * 4);
    for (let i = 0; i < steps; i++) seq.push(names[(start + i) % names.length]);
    seq.push(land);
    for (let i = 0, t = 0; i < seq.length; i++) { at.push(t); t += 42 + (i + 1) * (i + 1) * 0.6; } // slows down like a reel
    const t0 = performance.now(); let shown = -1;
    const tick = () => { // time-based, so a busy frame skips ahead instead of stretching the spin
      const el = performance.now() - t0; let i = shown; while (i + 1 < seq.length && at[i + 1] <= el) i++;
      if (i !== shown) { shown = i; nm.textContent = seq[i]; nm.classList.remove('flick'); void nm.offsetWidth; if (i < seq.length - 1) { nm.classList.add('flick'); this.app.sound.play('tick', 0.5); } }
      if (i < seq.length - 1) this.reelT = setTimeout(tick, Math.max(10, at[i + 1] - el));
      else { card.classList.remove('spinning'); nm.classList.remove('flick'); nm.classList.add('landed'); this.app.sound.play('pop', 0.9); }
    };
    tick();
  }
  countdown(n) {
    const c = $('#countdown'); c.innerHTML = '';
    const s = el('span', { class: n === 'GO!' ? 'go' : '' }, String(n)); c.append(s);
    setTimeout(() => { if (c.contains(s)) s.remove(); }, 1000);
  }
  banner(text, kind = 'info', sub = '', stay = false) {
    const b = $('#banner'); b.innerHTML = '';
    const d = el('div', { class: `bn ${kind} ${stay ? 'stay' : ''}`, html: esc(text) + (sub ? `<small>${esc(sub)}</small>` : '') }); b.append(d);
    clearTimeout(this.bannerT); if (!stay) this.bannerT = setTimeout(() => { if (b.contains(d)) d.remove(); }, 2700);
  }
  clearBanner() { $('#banner').innerHTML = ''; }
  results(m, game) {
    const me = game.you, q = m.qualified.includes(me), x = m.eliminated.includes(me);
    const L = game.level;
    const fin = game.isFinal;
    $('#resTitle').textContent = fin ? 'THE FINAL · ' + L.name.toUpperCase() : `ROUND ${m.round + 1} · ${L.name.toUpperCase()}`;
    const you = $('#resYou'); you.className = 'res-you ' + (q ? 'q' : x ? 'x' : 's');
    you.textContent = q ? (fin ? '👑 YOU WON!' : '✅ YOU QUALIFIED!') : x ? '❌ ELIMINATED' : '👀 SPECTATING';
    $('#resQn').textContent = m.qualified.length;
    $('#resGrid').innerHTML = m.qualified.map((s) => { const r = game.roster.get(s); return r ? `<div class="chip ${s === me ? 'me' : !r.bot ? 'human' : ''}"><div class="bn" style="background:${r.look.css}"></div><span>${esc(r.name)}</span></div>` : ''; }).join('');
    $('#resNext').innerHTML = m.next ? `NEXT UP: <b>🎲 ${game.duel ? 'ROUND ' + (m.round + 2) : m.round + 2 >= game.showN ? 'THE FINAL' : 'A RANDOM ROUND'}</b>` : m.qualified.length ? 'TO THE PODIUM! 🏆' : 'NO WINNER THIS TIME';
    $('#resDuel').classList.toggle('hide', !game.duel);
    if (game.duel) {
      you.className = 'res-you ' + (m.winner === me ? 'q' : m.winner < 0 ? 's' : 'x');
      you.textContent = m.winner === me ? '⚔ YOU TOOK THE ROUND!' : m.winner < 0 ? '🤝 A DRAW — NO POINT' : '😵 THEY TOOK THE ROUND';
      this.duelBoard(game); $('#resDuel').innerHTML = $('#duelBoard').innerHTML;
      if (!m.next) $('#resNext').innerHTML = 'THE DUEL IS DECIDED! 🏆';
    }
    $('.res-label').classList.toggle('hide', !!game.duel); $('#resGrid').classList.toggle('hide', !!game.duel);
    this.overlay('results', true);
  }
  podium(m, game) {
    // duels crown nobody: the winner gets crossed swords and the final score instead
    const duel = !!(game && game.duel), sc = duel && m.dw ? Object.values(m.dw).map((x) => x | 0).sort((a, b) => b - a) : null;
    $('#podium .pod-crown').innerHTML = duel ? '<i class="fa-solid fa-swords"></i>' : '<i class="fa-solid fa-crown"></i>';
    $('#podium .pod-title').textContent = duel ? (m.winner ? `DUEL WON ${sc[0] || 0}–${sc[1] || 0}!` : 'DUEL DRAWN') : 'WINNER!';
    $('#podName').innerHTML = m.winner ? esc(m.winner.n) + (m.winner.g === 'owner' ? ' ' + OWNER_TAG : '') : 'Nobody';
    $('#podPlaces').innerHTML = (m.top || []).slice(1).map((s, i) => { const r = game.roster.get(s); return r ? `<div>${i === 0 ? '🥈' : '🥉'} ${esc(r.name)}</div>` : ''; }).join('');
  }
  rewards(m, profile) {
    const won = m && m.won, rounds = m ? m.rounds : 0, rw = (m && m.reward) || { berries: 0, crowns: 0, xp: 0 };
    $('#rwHead').textContent = won ? 'CROWNED!' : 'SHOW COMPLETE';
    $('#rwSub').textContent = won ? 'You won the whole show! 👑' : rounds === 0 ? 'Eliminated in round 1 — next time!' : `You qualified from ${rounds} round${rounds > 1 ? 's' : ''}!`;
    const rows = [[`<span class="ico-berry"></span> Cranberries`, '+' + fmt(rw.berries + (rw.bonus || 0))], ['<i class="fa-solid fa-star" style="color:#22c8ff"></i> Experience', '+' + fmt(rw.xp)]];
    if (rw.crowns) rows.push(['<i class="fa-solid fa-crown"></i> Crowns', '+' + rw.crowns]);
    $('#rwRows').innerHTML = rows.map(([a, b]) => `<div class="rw-row">${a}<b>${b}</b></div>`).join('');
    $$('#rwRows .rw-row').forEach((r, i) => setTimeout(() => { r.classList.add('in'); this.app.sound.play('pop'); }, 350 + i * 280));
    if (profile) { $('#rwLvl').textContent = profile.level; setTimeout(() => ($('#rwXp').style.width = ((profile.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100 + '%'), 600); }
    $('#rwUp').classList.toggle('hide', !(rw.levelUp > 0));
    if (rw.levelUp > 0) $('#rwUp').innerHTML = `LEVEL ${rw.levelUp}! <small>🎁 CranPass reward ready to claim</small>`;
    const rk = rw.rank, box = $('#rwRank'); box.classList.toggle('hide', !rk);
    if (rk) {
      if (rk.kind === 'duel') { $('#rwHead').textContent = rk.res === 1 ? 'DUEL WON!' : rk.res === 0.5 ? 'DUEL DRAWN' : 'DUEL LOST'; $('#rwSub').textContent = `${rk.score[0]} – ${rk.score[1]}${rk.oppName ? ' vs ' + rk.oppName : ''}`; }
      else $('#rwSub').textContent = `#${rk.place} of ${rk.of} real players` + (won ? ' — and the crown! 👑' : '');
      const a = rankOf(rk.from), b = rankOf(rk.to), sign = rk.delta > 0 ? '+' : '';
      box.innerHTML = `<div class="rr-badges">${rankBadge(a, 54)}${rk.up || rk.down ? `<i class="fa-solid fa-chevron-right"></i>${rankBadge(b, 70, 'pop')}` : ''}</div>
        <div class="rr-text"><b class="${rk.delta >= 0 ? 'up' : 'down'}">${sign}${rk.delta} RP</b><span>${esc(b.name)} · ${fmt(rk.to)} RP</span>${rk.unreal ? '<em>🌈 UNREAL! The global leaderboard is now open to you.</em>' : rk.up ? '<em>▲ PROMOTED!</em>' : rk.down ? '<em class="down">▼ Demoted</em>' : ''}</div>
        <div class="rk-bar"><i style="width:${Math.round(rankOf(rk.from).pct * 100)}%;background:linear-gradient(90deg, ${b.c[1]}, ${b.c[0]})"></i></div>`;
      setTimeout(() => { const i = $('#rwRank .rk-bar i'); if (i) i.style.width = Math.round(b.pct * 100) + '%'; }, 700);
      if (rk.up) setTimeout(() => this.app.sound.play('crown'), 900);
    }
    this.overlay('rewards', true);
  }
}


export { OWNER_TAG, itemIcon, UI };
