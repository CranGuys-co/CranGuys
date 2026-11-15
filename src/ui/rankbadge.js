// CranGuys — ranked badges, drawn as inline SVG (crisp at any size, no image files).
// Bronze → Diamond share a shield with a tier emblem and I / II / III pips; Elite, Champion and Unreal get their own shapes.
import { rankOf } from '../online/ranks.js';
let n = 0;
const INK = '#2a1050';
const starPath = (cx, cy, R, r, k = 5, rot = -Math.PI / 2) => {
  let d = ''; for (let i = 0; i < k * 2; i++) { const a = rot + (i * Math.PI) / k, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
  return d + 'Z';
};
const EMBLEM = {
  // a little jelly bean
  bronze: (g) => `<g transform="rotate(-28 50 50)"><rect x="37" y="30" width="26" height="40" rx="13" fill="url(#${g}e)" stroke="${INK}" stroke-width="3"/><ellipse cx="50" cy="43" rx="9" ry="6" fill="#fff8f0" stroke="${INK}" stroke-width="2"/><circle cx="47" cy="43" r="1.8" fill="${INK}"/><circle cx="53" cy="43" r="1.8" fill="${INK}"/></g>`,
  silver: (g) => `<path d="${starPath(50, 50, 22, 10)}" fill="url(#${g}e)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="${starPath(50, 50, 9, 4)}" fill="#fff" opacity=".85"/>`,
  gold: (g) => `<path d="M27 63 L24 36 L37 47 L50 28 L63 47 L76 36 L73 63 Z" fill="url(#${g}e)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><rect x="27" y="62" width="46" height="8" rx="3" fill="url(#${g}e)" stroke="${INK}" stroke-width="3"/><circle cx="50" cy="51" r="4" fill="#ff4d7e" stroke="${INK}" stroke-width="2"/>`,
  platinum: (g) => `<path d="M50 26 L72 42 L64 70 L36 70 L28 42 Z" fill="url(#${g}e)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M50 26 L50 70 M28 42 L72 42 M36 70 L50 42 L64 70" stroke="#fff" stroke-width="2" opacity=".55" fill="none"/>`,
  diamond: (g) => `<path d="M30 40 L40 28 H60 L70 40 L50 74 Z" fill="url(#${g}e)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M30 40 H70 M40 28 L45 40 L50 74 L55 40 L60 28" stroke="#fff" stroke-width="2" opacity=".6" fill="none" stroke-linejoin="round"/>`,
};
function pips(div, c) {
  if (!div) return '';
  const w = 13, x0 = 50 - ((div - 1) * w) / 2;
  let s = '';
  for (let i = 0; i < div; i++) s += `<path d="M${x0 + i * w - 5} 86 l5 5 l5 -5" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x0 + i * w - 5} 86 l5 5 l5 -5" stroke="${c}" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}

function rankBadge(rpOrRank, size = 64, extraClass = '') {
  const r = typeof rpOrRank === 'object' && rpOrRank ? rpOrRank : rankOf(rpOrRank | 0);
  const g = 'rb' + ++n, [hi, mid, lo] = r.c;
  const defs = `<defs>
    <linearGradient id="${g}m" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
    <linearGradient id="${g}e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="${hi}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
    <linearGradient id="${g}u" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7af6"/><stop offset=".25" stop-color="#ffd84a"/><stop offset=".5" stop-color="#5ef0c4"/><stop offset=".75" stop-color="#6aa8ff"/><stop offset="1" stop-color="#b45cff"/></linearGradient>
    <radialGradient id="${g}g" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="${hi}" stop-opacity=".9"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient>
  </defs>`;
  let body;
  if (r.tier === 'elite') {
    body = `<circle cx="50" cy="52" r="46" fill="url(#${g}g)"/>
      <path d="M8 46 Q20 30 36 40 Q22 44 18 58 Q14 50 8 46Z M92 46 Q80 30 64 40 Q78 44 82 58 Q86 50 92 46Z" fill="url(#${g}m)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="${starPath(50, 52, 34, 20, 6, -Math.PI / 2)}" fill="url(#${g}m)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="${starPath(50, 52, 18, 9, 6, -Math.PI / 2)}" fill="url(#${g}e)" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M38 34 Q50 26 62 34" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`;
  } else if (r.tier === 'champion') {
    body = `<circle cx="50" cy="55" r="46" fill="url(#${g}g)"/>
      <path d="M14 70 Q8 46 22 26 M86 70 Q92 46 78 26" stroke="#ffcf3e" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${[0, 1, 2, 3].map((i) => `<ellipse cx="${14 + i * 1.5}" cy="${64 - i * 11}" rx="7" ry="3.6" transform="rotate(${-60 + i * 12} ${14 + i * 1.5} ${64 - i * 11})" fill="#ffd84a" stroke="${INK}" stroke-width="2"/><ellipse cx="${86 - i * 1.5}" cy="${64 - i * 11}" rx="7" ry="3.6" transform="rotate(${60 - i * 12} ${86 - i * 1.5} ${64 - i * 11})" fill="#ffd84a" stroke="${INK}" stroke-width="2"/>`).join('')}
      <path d="M50 18 L80 30 V56 C80 76 66 90 50 98 C34 90 20 76 20 56 V30 Z" fill="url(#${g}m)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M34 66 L32 44 L42 52 L50 38 L58 52 L68 44 L66 66 Z" fill="#ffd84a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="50" cy="58" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
      <path d="M30 32 L50 24 L70 32" stroke="#fff" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>`;
  } else if (r.tier === 'unreal') {
    body = `<circle class="rb-glow" cx="50" cy="54" r="48" fill="url(#${g}u)" opacity=".35"/>
      <path class="rb-spin" d="${starPath(50, 54, 46, 30, 8, 0)}" fill="url(#${g}u)" stroke="${INK}" stroke-width="3" stroke-linejoin="round" opacity=".9"/>
      <path d="M50 14 L74 42 L50 98 L26 42 Z" fill="url(#${g}u)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M26 42 H74 M50 14 L42 42 L50 98 L58 42 Z" stroke="#fff" stroke-width="2.2" fill="none" opacity=".75" stroke-linejoin="round"/>
      <path d="M40 30 L46 22" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`;
  } else {
    body = `<path d="M50 5 L89 18 V52 C89 78 72 95 50 105 C28 95 11 78 11 52 V18 Z" fill="url(#${g}m)" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M50 13 L81 23.5 V52 C81 73 67 87 50 96 C33 87 19 73 19 52 V23.5 Z" fill="none" stroke="#fff" stroke-width="2.5" opacity=".5"/>
      <path d="M22 26 L50 16 L78 26" stroke="#fff" stroke-width="3.5" fill="none" opacity=".7" stroke-linecap="round"/>
      ${EMBLEM[r.tier](g)}${pips(r.div, '#fff')}`;
  }
  return `<svg class="rank-badge t-${r.tier} ${extraClass}" viewBox="0 0 100 110" width="${size}" height="${Math.round(size * 1.1)}" role="img" aria-label="${r.name}">${defs}${body}</svg>`;
}


export { rankBadge };
