// CranGuys — in-game chat for online shows. Everything is filtered twice: before sending (instant feedback)
// and again when it arrives (so nothing nasty gets through even from a modified game). Players can also mute
// anyone, switch to quick-chat only, or turn chat off entirely in Settings.
import { $, el, esc, settings, isTouch } from '../util.js';
import { LocalServer } from '../online/net.js';
import { PHASE } from '../sim/config.js';
import { moderate, QUICK, CHAT_REASON } from '../online/chatFilter.js';
class Chat {
  constructor(app) {
    this.app = app; this.open = false; this.muted = new Set(); this.speakers = new Map(); this.sent = []; this.last = '';
    $('#chatBtn').addEventListener('click', () => (this.open ? this.close() : this.show()));
    $('#chatClose').addEventListener('click', () => this.close());
    $('#chatSend').addEventListener('click', () => this.submit());
    $('#chatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submit(); } else if (e.key === 'Escape') this.close(); e.stopPropagation(); });
    $('#chatQuick').innerHTML = '';
    for (const q of QUICK) { const b = el('button', { class: 'qchip' }, q); b.addEventListener('click', () => { this.send(q); this.close(); }); $('#chatQuick').append(b); }
    // keyboard: Enter or T opens chat during a show (when not typing somewhere else)
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (this.open && e.key === 'Escape') { this.close(); return; }
      if (!this.open && (e.key === 'Enter' || e.code === 'KeyT') && this.available() && !this.app.ui.modalOpen()) { e.preventDefault(); this.show(); }
    });
  }
  // chat is for shows with other real people (not Solo), unless switched off
  available() {
    const a = this.app, c = a.conn;
    return settings.chat !== 'off' && (a.state === 'show' || a.state === 'podium') && !!a.game && !!c && !(c instanceof LocalServer);
  }
  sync() { // called every frame by the app: show the chat button only where chat makes sense
    const on = this.available(), lob = on && this.app.game && this.app.game.phase === PHASE.LOBBY && this.app.state === 'show';
    if (lob !== this._lob) { this._lob = lob; document.body.classList.toggle('lobbying', !!lob); }
    if (on !== this._shown) { this._shown = on; $('#chatBtn').classList.toggle('hide', !on); if (!on) { this.close(); $('#chatLog').innerHTML = ''; } }
  }
  show() {
    if (!this.available()) return;
    this.open = true; this.app.chatOpen = true;
    $('#chatPanel').classList.remove('hide'); $('#chatBtn .dot').classList.add('hide');
    const quickOnly = settings.chat === 'quick';
    $('#chatRow').classList.toggle('hide', quickOnly);
    this.renderMute();
    if (!quickOnly && !isTouch()) setTimeout(() => $('#chatIn').focus(), 30);
  }
  close() {
    if (!this.open) return;
    this.open = false; this.app.chatOpen = false;
    $('#chatPanel').classList.add('hide'); $('#chatIn').blur(); $('#chatIn').value = '';
  }
  submit() { const v = $('#chatIn').value; if (!v.trim()) return this.close(); if (this.send(v)) { $('#chatIn').value = ''; this.close(); } }
  send(text) {
    if (settings.chat === 'quick' && !QUICK.includes(text)) return false;
    const now = performance.now(); this.sent = this.sent.filter((t) => now - t < 6000);
    if (this.sent.length >= 3) { this.app.ui.toast(CHAT_REASON.slow, 'bad'); return false; }
    const r = moderate(text, { last: this.last });
    if (!r.ok) { if (CHAT_REASON[r.reason]) this.app.ui.toast(CHAT_REASON[r.reason], 'bad'); this.app.sound.play('error'); return false; }
    this.sent.push(now); this.last = r.text;
    this.app.conn.send({ t: 'chat', x: r.text });
    return true;
  }
  receive(m) {
    const g = this.app.game; if (!g || settings.chat === 'off' || this.muted.has(m.s)) return;
    const r = g.roster.get(m.s); if (!r) return;
    const ok = moderate(m.x); if (!ok.ok) return; // second line of defence
    this.speakers.set(m.s, r.name);
    const line = el('div', { class: 'cmsg' + (m.s === g.you ? ' me' : '') });
    const col = String(r.look.css).startsWith('#') ? r.look.css : '#ffd23f';
    line.innerHTML = `<b style="--c:${esc(col)}">${esc(r.name)}${r.tag === 'owner' ? ' <span class="otag sm"><i class="fa-solid fa-gem"></i>OWNER</span>' : ''}</b> ${esc(ok.text)}`;
    const log = $('#chatLog'); log.append(line);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), 9000); setTimeout(() => line.remove(), 10000);
    if (m.s !== g.you) { this.app.sound.play('pop', 0.35); if (!this.open) $('#chatBtn .dot').classList.remove('hide'); }
    if (this.open) this.renderMute();
  }
  blocked(m) { const t = CHAT_REASON[m.why]; if (t) this.app.ui.toast(t, 'bad'); }
  renderMute() {
    const g = this.app.game, box = $('#chatMute'); box.innerHTML = '';
    const ppl = [...this.speakers].filter(([s]) => g && s !== g.you);
    if (!ppl.length) return;
    box.append(el('small', {}, 'Tap to mute / unmute:'));
    for (const [s, name] of ppl) {
      const b = el('button', { class: 'qchip mute' + (this.muted.has(s) ? ' on' : '') }, el('i', { class: 'fa-solid fa-volume-xmark' }), ' ' + name);
      b.addEventListener('click', () => { if (this.muted.has(s)) this.muted.delete(s); else this.muted.add(s); this.renderMute(); });
      box.append(b);
    }
  }
  reset() { this.muted.clear(); this.speakers.clear(); $('#chatLog').innerHTML = ''; this.close(); }
}


export { Chat };
