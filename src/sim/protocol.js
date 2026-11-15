// CranGuys — wire protocol. JSON text frames for control messages; compact binary frames for the
// two hot paths: client inputs (30 Hz) and world snapshots (15 Hz).
import { NFIELDS } from './character.js';
const BIN = { SNAP: 1, INPUT: 2 };

// ---------- inputs: [2][epoch u8][tick u32][mx i8][mz i8][buttons u8] ----------
const qAxis = (x) => Math.max(-127, Math.min(127, Math.round(x * 127)));
function encodeInput(epoch, tick, mx, mz, b) {
  const a = new Uint8Array(9), d = new DataView(a.buffer);
  a[0] = BIN.INPUT; a[1] = epoch & 255; d.setUint32(2, tick >>> 0, true); d.setInt8(6, qAxis(mx)); d.setInt8(7, qAxis(mz)); a[8] = b & 255;
  return a;
}
function decodeInput(buf) {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (a.length < 9 || a[0] !== BIN.INPUT) return null;
  const d = new DataView(a.buffer, a.byteOffset, a.byteLength);
  return { epoch: a[1], tick: d.getUint32(2, true), mx: d.getInt8(6) / 127, mz: d.getInt8(7) / 127, b: a[8] & 15 };
}

// ---------- snapshots ----------
// header: [1][epoch u8][tick u32][inbuf i8][q u8][alive u8][Q u8][hasOwn u8] (+ own NFIELDS*f32)
// body:   [n u8] n * {slot u8, x,y,z i16 (1/32 m), yaw u8, flags u8, vx,vy,vz i8 (1/4 m/s), air u8}
//         [nb u8] nb * {id u8, x,y,z i16, vx,vy,vz i8}
const PS = 13, BS = 10, HDR = 11;
const q16 = (x) => Math.max(-32767, Math.min(32767, Math.round(x * 32)));
const q8v = (x) => Math.max(-127, Math.min(127, Math.round(x * 4)));

function buildSnapBody(players, balls) {
  let n = 0; for (const p of players) if (p) n++;
  const nb = balls ? Math.min(balls.length, 255) : 0;
  const a = new Uint8Array(2 + n * PS + nb * BS), d = new DataView(a.buffer);
  let o = 0; a[o++] = n;
  for (const p of players) {
    if (!p) continue;
    const s = p.st;
    a[o] = p.slot; d.setInt16(o + 1, q16(s.p[0]), true); d.setInt16(o + 3, q16(s.p[1]), true); d.setInt16(o + 5, q16(s.p[2]), true);
    a[o + 7] = Math.round(((s.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * 256) & 255;
    a[o + 8] = (s.mode & 15) | (s.gr ? 16 : 0) | (s.held ? 32 : 0) | (s.mode === 5 || s.mode === 6 ? 64 : 0);
    d.setInt8(o + 9, q8v(s.v[0])); d.setInt8(o + 10, q8v(s.v[1])); d.setInt8(o + 11, q8v(s.v[2]));
    a[o + 12] = Math.min(255, Math.round((s.mode === 1 || s.mode === 2 || s.mode === 4 ? s.mt : s.air) * 50));
    o += PS;
  }
  a[o++] = nb;
  for (let i = 0; i < nb; i++) {
    const b = balls[i];
    a[o] = b.id & 255; d.setInt16(o + 1, q16(b.p[0]), true); d.setInt16(o + 3, q16(b.p[1]), true); d.setInt16(o + 5, q16(b.p[2]), true);
    d.setInt8(o + 7, q8v(b.v[0])); d.setInt8(o + 8, q8v(b.v[1])); d.setInt8(o + 9, q8v(b.v[2]));
    o += BS;
  }
  return a;
}

function encodeSnap(h, own, body) {
  const ownBytes = own ? NFIELDS * 4 : 0;
  const a = new Uint8Array(HDR + ownBytes + body.length), d = new DataView(a.buffer);
  a[0] = BIN.SNAP; a[1] = h.epoch & 255; d.setUint32(2, h.tick >>> 0, true); d.setInt8(6, Math.max(-127, Math.min(127, h.inbuf | 0)));
  a[7] = h.q & 255; a[8] = h.alive & 255; a[9] = h.Q & 255; a[10] = own ? 1 : 0;
  if (own) for (let i = 0; i < NFIELDS; i++) d.setFloat32(HDR + i * 4, own[i], true);
  a.set(body, HDR + ownBytes);
  return a;
}

function decodeSnap(buf) {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (a[0] !== BIN.SNAP) return null;
  const d = new DataView(a.buffer, a.byteOffset, a.byteLength);
  const out = { epoch: a[1], tick: d.getUint32(2, true), inbuf: d.getInt8(6), q: a[7], alive: a[8], Q: a[9], own: null, players: [], balls: [] };
  let o = HDR;
  if (a[10]) { out.own = new Float32Array(NFIELDS); for (let i = 0; i < NFIELDS; i++) out.own[i] = d.getFloat32(o + i * 4, true); o += NFIELDS * 4; }
  const n = a[o++];
  for (let i = 0; i < n; i++) {
    out.players.push({
      slot: a[o], x: d.getInt16(o + 1, true) / 32, y: d.getInt16(o + 3, true) / 32, z: d.getInt16(o + 5, true) / 32,
      yaw: (a[o + 7] / 256) * Math.PI * 2, mode: a[o + 8] & 15, gr: !!(a[o + 8] & 16), held: !!(a[o + 8] & 32), hang: !!(a[o + 8] & 64),
      vx: d.getInt8(o + 9, true) / 4, vy: d.getInt8(o + 10, true) / 4, vz: d.getInt8(o + 11, true) / 4, mt: a[o + 12] / 50,
    });
    o += PS;
  }
  const nb = a[o++] || 0;
  for (let i = 0; i < nb; i++) {
    out.balls.push({ id: a[o], x: d.getInt16(o + 1, true) / 32, y: d.getInt16(o + 3, true) / 32, z: d.getInt16(o + 5, true) / 32, vx: d.getInt8(o + 7, true) / 4, vy: d.getInt8(o + 8, true) / 4, vz: d.getInt8(o + 9, true) / 4 });
    o += BS;
  }
  return out;
}


export { BIN, qAxis, encodeInput, decodeInput, buildSnapBody, encodeSnap, decodeSnap };
