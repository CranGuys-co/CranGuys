// CranGuys — connections. RemoteConn = WebSocket to the authoritative server (auto-reconnect, RTT tracking).
// LocalServer = the very same Match simulation running inside the page for offline bot shows.
import { PROTO, TICK_HZ, TIMING } from '../sim/config.js';
import { Match } from '../sim/game.js';
import { decodeInput } from '../sim/protocol.js';
import { tagOf } from '../economy/cosmetics.js';
class RemoteConn {
  constructor(url, token, onMsg, onState) {
    this.url = url; this.token = token; this.onMsg = onMsg; this.onState = onState;
    this.rtt = 100; this.open = false; this.closedByUser = false; this.tries = 0;
    this.connect();
  }
  connect() {
    this.onState('connecting');
    const ws = (this.ws = new WebSocket(this.url));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.open = true; this.tries = 0; ws.send(JSON.stringify({ t: 'hello', token: this.token, v: PROTO })); this.onState('open'); this.pinger = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000); };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data);
        if (m.t === 'pong') { const r = performance.now() - m.c; this.rtt = this.rtt * 0.8 + r * 0.2; return; }
        this.onMsg(m);
      } else this.onMsg(new Uint8Array(e.data));
    };
    ws.onclose = (e) => {
      this.open = false; clearInterval(this.pinger);
      if (this.closedByUser || e.code === 4002) { this.onState('closed', e.code); return; }
      this.onState('reconnecting');
      const delay = Math.min(8000, 400 * Math.pow(1.7, this.tries++));
      this.retry = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }
  send(m) { if (this.open && this.ws.readyState === 1) this.ws.send(m instanceof Uint8Array ? m : JSON.stringify(m)); }
  close() { this.closedByUser = true; clearTimeout(this.retry); clearInterval(this.pinger); try { this.ws.close(); } catch {} }
}

// Offline: a full show against 59 bots, simulated locally with the authoritative code.
class LocalServer {
  constructor(backend, onMsg, onState) {
    this.backend = backend; this.onMsg = onMsg; this.onState = onState; this.rtt = 0; this.open = true;
    this.q = []; this.match = null; this.slot = -1; this.acc = 0; this.status = { online: 1, queue: 0, shows: 0, lobbies: 0 };
    this.deliver({ t: 'welcome', profile: backend.profile, ...this.status }); // queued first, before any show messages
    setTimeout(() => onState('open'), 0);
  }
  deliver(m) { this.q.push(m); }
  send(m) {
    if (m instanceof Uint8Array) { const i = decodeInput(m); if (i && this.match) this.match.input(this.slot, i.epoch, i.tick, i.mx, i.mz, i.b); return; }
    if (m.t === 'queue') this.startShow();
    else if (m.t === 'leave' || m.t === 'unqueue') { if (this.match) { this.match.leave(this.slot); this.match = null; } this.deliver({ t: 'left', ...this.status }); }
    else if (m.t === 'resync' && this.match) this.match.welcome(this.slot);
    else if (m.t === 'chat' && this.match && typeof m.x === 'string') this.match.chat(this.slot, m.x);
  }
  startShow() {
    const p = this.backend.profile;
    this.deliver({ t: 'mm', st: 'found', ...this.status });
    let match = null;
    match = this.match = new Match({
      lobbySecs: TIMING.lobbyOffline,
      show: typeof window !== 'undefined' && Array.isArray(window.CG_SHOW) ? window.CG_SHOW : undefined, // debug / tests
      send: (slot, msg) => { if (match && this.match === match && (slot === -1 || slot === this.slot)) this.deliver(msg); },
      hooks: {
        onPlayerDone: (pl, res) => { if (pl.slot !== this.slot) return; const rw = this.backend.reward(res); this.deliver({ t: 'reward', ...res, reward: rw, profile: this.backend.profile }); },
        onEnd: () => { setTimeout(() => { if (this.match === match) this.match = null; }, 0); },
      },
    });
    this.slot = match.addPlayer({ userId: 'local', name: p.name, cos: p.loadout, bot: false, tag: tagOf(p.owned) });
    // a few bots are already waiting in the lobby; the rest trickle in during the countdown
    for (let i = 0; i < 9; i++) match.addBot();
    match.welcome(this.slot);
  }
  // called every frame by the client
  update(dt) {
    if (this.match && !this.match.ended) {
      this.acc += Math.min(dt, 0.25);
      let n = 0;
      while (this.acc >= 1 / TICK_HZ && n < 15) { this.match.step(); this.acc -= 1 / TICK_HZ; n++; }
      if (n === 15) this.acc = 0;
    }
    if (this.q.length) { const q = this.q; this.q = []; for (const m of q) this.onMsg(m); }
  }
  close() { if (this.q.length) { const q = this.q; this.q = []; for (const m of q) this.onMsg(m); } this.match = null; this.open = false; }
}


export { RemoteConn, LocalServer };
