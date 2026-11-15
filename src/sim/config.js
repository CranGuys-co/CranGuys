// CranGuys — shared constants. Changing PROTO forces clients and server to match.

const PROTO = 3;
// filled in by vite.config.js with a fingerprint of the code at build time ('__BUILD__' when running unbundled)
const BUILD = '__BUILD__';
// what peer-to-peer players must match exactly to play together
const NETV = PROTO + ':' + BUILD;
const GAME_NAME = 'CranGuys';

// Simulation timing: 30 Hz authoritative ticks, 3 physics substeps per tick, snapshots every 2 ticks (15 Hz).
const TICK_HZ = 30;
const DT = 1 / TICK_HZ;
const SUBSTEPS = 3;
const SNAP_EVERY = 2;
const INTERP_TICKS = 4;          // remote players are rendered ~133 ms in the past

const MAX_PLAYERS = 60;

// Jelly-bean character physics (metres, seconds)
const PHYS = {
  G: 27,             // gravity
  TERM: 26,          // terminal fall speed (keeps substep travel < platform thickness)
  RUN: 7.6,          // top run speed
  ACC: 58, DEC: 44,  // ground acceleration / braking
  AIR_ACC: 17, AIR_DEC: 3,
  ICE_ACC: 6.5, ICE_DEC: 2.2,
  TURN: 13,          // facing turn rate (rad/s)
  JUMP: 9.5,         // jump take-off speed  -> apex ~1.67 m
  COYOTE: 0.11, JBUF: 0.13, DBUF: 0.1,
  DIVE_H: 9.8, DIVE_MAX: 12.5, DIVE_V: 4.4, DIVE_GV: 5.2,
  SLIDE_DEC: 8.5, SLIDE_MIN: 0.42, GETUP: 0.34, RECOVER_HOP: 6.6,
  R: 0.42, HH: 0.36, RS: 0.46,   // capsule radius, capsule half-segment, sphere radius (dive/ragdoll)
  RAG_REST: 0.33, RAG_MIN: 0.85, RAG_MAX: 4.2,
  HELD_SLOW: 0.42, GRAB_SLOW: 0.55, GRAB_MAX: 2.7, GRAB_CD: 0.9, GRAB_REACH: 1.35, TETHER: 0.85,
  CLIMB_T: 0.38,
  BOUNCE: 16,
  RESPAWN_T: 1.15,
};
// feet-to-centre height when standing
PHYS.STAND = PHYS.HH + PHYS.R;

const BTN = { JUMP: 1, DIVE: 2, GRAB: 4, EMOTE: 8 };
const MODE = { NORMAL: 0, DIVE: 1, SLIDE: 2, GETUP: 3, RAG: 4, LEDGE: 5, CLIMB: 6, GRABBING: 7, RESPAWN: 8, OUT: 9 };
const MODE_NAME = ['normal', 'dive', 'slide', 'getup', 'ragdoll', 'ledge', 'climb', 'grabbing', 'respawn', 'out'];
const SURF = { NORMAL: 0, ICE: 1, CONVEYOR: 2, BOUNCY: 3, BUMPER: 4, SLIME: 5 };

const PHASE = { LOBBY: 1, INTRO: 2, COUNTDOWN: 3, PLAY: 4, ROUND_END: 5, RESULTS: 6, PODIUM: 7, END: 8 };
const PHASE_NAME = { 1: 'lobby', 2: 'intro', 3: 'countdown', 4: 'play', 5: 'roundEnd', 6: 'results', 7: 'podium', 8: 'end' };

// Phase lengths (seconds)
const TIMING = {
  lobbyOnline: 28,     // waiting-room countdown once the first player arrives
  lobbyFull: 6,        // shortened when 60 humans are in
  lobbyOffline: 9,
  botFillWindow: 14,   // bots trickle into the lobby during the last N seconds
  intro: 6,
  countdown: 3.4,
  roundEnd: 2.6,
  results: 6,
  podium: 4,          // short and sweet
  disconnectGrace: 25,
  duelStart: 6,        // ranked duel: both players in -> short countdown
  rankedStart: 20,     // ranked show: 5 real players in -> last call for others
};


export { PROTO, BUILD, NETV, GAME_NAME, TICK_HZ, DT, SUBSTEPS, SNAP_EVERY, INTERP_TICKS, MAX_PLAYERS, PHYS, BTN, MODE, MODE_NAME, SURF, PHASE, PHASE_NAME, TIMING };
