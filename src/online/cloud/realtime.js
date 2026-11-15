// Supabase Realtime as one more "broker" for peer-to-peer play (see Hub in src/online/p2p.js). It looks like
// MiniMQTT to the Hub: connect, subscribe(topic), publish(topic, data), close, onmessage.
//
//   * The messages that find and join a room (offers, answers, "I'm here") go over Realtime broadcast, on the
//     same secure web port as the website, so school and office networks that block the public brokers work.
//   * The public room list (quick play) goes through the database instead (board.js): hosts check in, and
//     players looking for a game read the list, so nobody has to message everybody.
//   * Game data never goes through Realtime: it's direct between browsers (WebRTC). If a direct link isn't
//     possible the players fall back to relaying through a public broker, as before. (Supabase's free plan only
//     allows about 100 Realtime messages a second for the whole game, and a relay needs ~30 a second per player.)
import { getClient } from './client.js';
import { roomAnnounce, roomList } from './board.js';
import { NETV } from '../../sim/config.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RealtimeConn {
  constructor(pubTopic) {
    this.kind = 'realtime'; this.pubTopic = pubTopic;
    this.connected = false; this.onmessage = null; this.onclose = null;
    this.sb = null; this.chans = new Map(); this.pollT = null; this.annAt = 0;
  }
  async connect(timeout) {
    const t0 = Date.now();
    this.sb = await Promise.race([getClient(), sleep(timeout).then(() => { throw new Error('timeout'); })]);
    const rt = this.sb.realtime;
    rt.connect();
    while (!rt.isConnected()) {
      if (Date.now() - t0 > timeout) throw new Error('timeout');
      await sleep(50);
    }
    this.connected = true;
    return this;
  }
  // a channel per topic; messages wait until it has joined
  chan(topic, listen) {
    let c = this.chans.get(topic);
    if (!c) {
      const ch = this.sb.channel('cg:' + topic, { config: { broadcast: { self: false, ack: false } } });
      c = { ch, ready: false, wait: [], listen: false };
      this.chans.set(topic, c);
      ch.on('broadcast', { event: 'm' }, ({ payload }) => {
        if (c.listen && this.connected && this.onmessage && payload && typeof payload.d === 'string') this.onmessage(topic, enc.encode(payload.d));
      });
      ch.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        c.ready = true;
        for (const d of c.wait.splice(0)) ch.send({ type: 'broadcast', event: 'm', payload: { d } });
      });
    }
    if (listen) c.listen = true;
    return c;
  }
  subscribe(topic) {
    if (!this.connected) return;
    if (topic === this.pubTopic) { // the public room list lives in the database
      if (this.pollT) return;
      const poll = async () => {
        try { for (const m of await roomList(NETV)) if (this.connected && this.onmessage) this.onmessage(topic, enc.encode(JSON.stringify(m))); } catch { /* try again */ }
      };
      poll(); this.pollT = setInterval(poll, 2500);
      return;
    }
    this.chan(topic, true);
  }
  publish(topic, payload) {
    if (!this.connected) return;
    let text;
    if (typeof payload === 'string') text = payload;
    else if (payload && payload[0] === 0x7b) text = dec.decode(payload);
    else return; // relayed game data: never over Realtime (see above)
    if (topic === this.pubTopic) { // a host announcing its room
      const now = Date.now(); if (now - this.annAt < 1800) return; this.annAt = now;
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m && m.t === 'room') roomAnnounce(m).catch(() => {});
      return;
    }
    const c = this.chan(topic, false);
    if (c.ready) c.ch.send({ type: 'broadcast', event: 'm', payload: { d: text } });
    else if (c.wait.length < 20) c.wait.push(text);
  }
  close() {
    this.connected = false; this.onclose = null;
    clearInterval(this.pollT); this.pollT = null;
    for (const { ch } of this.chans.values()) { try { this.sb.removeChannel(ch); } catch { /* already gone */ } }
    this.chans.clear();
  }
}
