// CranGuys — self-contained SVG icon set (no icon font / CDN needed, works offline and inside sandboxed pages).
// Markup keeps the familiar <i class="fa-solid fa-NAME"></i> form; iconize() swaps those for inline SVG.
const S = (d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
const F = (d) => `<path d="${d}" fill="currentColor"/>`;
function gear() {
  let d = ''; const n = 8;
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i / (n * 2)) * Math.PI * 2, a1 = ((i + 1) / (n * 2)) * Math.PI * 2, r = i % 2 ? 7.4 : 10;
    d += (i ? 'L' : 'M') + (12 + Math.cos(a0) * r).toFixed(2) + ' ' + (12 + Math.sin(a0) * r).toFixed(2) + 'L' + (12 + Math.cos(a1) * r).toFixed(2) + ' ' + (12 + Math.sin(a1) * r).toFixed(2);
  }
  return `<path d="${d}Z M12 8.6a3.4 3.4 0 1 0 0.01 0Z" fill="currentColor" fill-rule="evenodd"/>`;
}
function star(cx = 12, cy = 12, R = 10, r = 4.3) {
  let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2); }
  return d + 'Z';
}
const ICONS = {
  house: F('M12 3.2 2.6 10.6c-.6.5-.2 1.4.5 1.4H4.5v8a1 1 0 0 0 1 1h4.2v-6h4.6v6h4.2a1 1 0 0 0 1-1v-8h1.4c.7 0 1.1-.9.5-1.4z'),
  shirt: F('M8.2 3 2.5 6l2.4 5.2 2.6-1.1V21h9V10.1l2.6 1.1L21.5 6l-5.7-3c-.6 1.7-2 2.9-3.8 2.9S8.8 4.7 8.2 3z'),
  store: F('M4 3h16l2 5.5a3 3 0 0 1-5 2.2 3 3 0 0 1-5 0 3 3 0 0 1-5 0A3 3 0 0 1 2 8.5zM4.5 12.6a4.6 4.6 0 0 0 2.5.4V20h4v-4h2v4h4v-7a4.6 4.6 0 0 0 2.5-.4V21a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z'),
  user: F('M12 2.5a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6zM3 21.2C3.7 16.6 7.4 13.8 12 13.8s8.3 2.8 9 7.4a.8.8 0 0 1-.8.8H3.8a.8.8 0 0 1-.8-.8z'),
  users: F('M9 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM1.5 20c.6-3.8 3.6-6.2 7.5-6.2s6.9 2.4 7.5 6.2a.7.7 0 0 1-.7.8H2.2a.7.7 0 0 1-.7-.8zM16.5 4.5a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM17.8 13.4c2.6.4 4.4 2.4 4.8 5.5a.7.7 0 0 1-.7.8h-3.4c-.3-2.4-1.4-4.6-3.1-5.9.7-.3 1.5-.4 2.4-.4z'),
  gear: gear(),
  crown: F('M2.5 7.5 7.6 11 12 4l4.4 7 5.1-3.5-2 11.5h-15zM5 20.5h14v2H5z'),
  gem: F('M6.5 3h11L22 9l-10 12L2 9zM8 5 5.4 8.6h4.1zm8 0-1.5 3.6h4.1zM12 5.4 10.4 8.6h3.2zM5.6 10.6l5.2 6.2-2.2-6.2zm7.6 6.2 5.2-6.2h-3z'),
  pen: S('M4 20l1.2-4.8L16.4 4a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.8 18.8zM14.5 6l3.5 3.5'),
  ticket: F('M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5zm7 1v8h2V8z'),
  globe: S('M12 2.8a9.2 9.2 0 1 0 0 18.4 9.2 9.2 0 0 0 0-18.4zM2.8 12h18.4M12 2.8c2.6 2.6 3.8 5.6 3.8 9.2s-1.2 6.6-3.8 9.2M12 2.8C9.4 5.4 8.2 8.4 8.2 12s1.2 6.6 3.8 9.2'),
  robot: F('M11 2h2v3h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4zM8.5 9.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm7 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM9 15.5h6V17H9zM1 10h2v5H1zm20 0h2v5h-2zM8 20h3v2H8zm5 0h3v2h-3z'),
  x: S('M6 6l12 12M18 6 6 18'),
  left: S('M15 4 7 12l8 8'), right: S('M9 4l8 8-8 8'), up: S('M4 15l8-8 8 8'),
  lock: F('M7 10V7.5a5 5 0 0 1 10 0V10h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2.5 0h5V7.5a2.5 2.5 0 0 0-5 0z'),
  clock: S('M12 2.8a9.2 9.2 0 1 0 0 18.4 9.2 9.2 0 0 0 0-18.4zM12 7v5.5l3.5 2'),
  exit: S('M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8M10 12h11M17 8l4 4-4 4'),
  enter: S('M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M3 12h12M11 8l4 4-4 4'),
  door: F('M5 2h11a2 2 0 0 1 2 2v17h3v2H3v-2h2zm9 9.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z'),
  jump: S('M12 20V5M5.5 11 12 4.5 18.5 11'),
  dive: F('M4.5 13.5c0-2 1.6-3.5 3.6-3.5h9.4a3 3 0 0 1 0 6H8.1c-2 0-3.6-1.5-3.6-2.5zM14.5 11.2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM1 9h5v1.6H1zm0 3.2h3v1.6H1zm0 3.2h4V17H1z'),
  hand: F('M8.5 4a1.5 1.5 0 0 1 3 0v7h.8V2.8a1.5 1.5 0 0 1 3 0V11h.8V4.5a1.5 1.5 0 0 1 3 0V14c0 4.4-3.1 8-7.4 8-2.7 0-4.4-1.2-5.9-3.4L3.2 13.3a1.5 1.5 0 0 1 2.4-1.8L8.5 15z'),
  play: F('M7 3.8v16.4a1 1 0 0 0 1.5.9l13.2-8.2a1 1 0 0 0 0-1.8L8.5 2.9A1 1 0 0 0 7 3.8z'),
  check: S('M4.5 12.5l5 5L19.5 7'),
  star: F(star()),
  trophy: F('M6 2h12v2h3v3a5 5 0 0 1-4.3 5A6 6 0 0 1 13 15.8V18h3v3H8v-3h3v-2.2A6 6 0 0 1 7.3 12 5 5 0 0 1 3 7V4h3zm0 4H5v1a3 3 0 0 0 1.4 2.5A6 6 0 0 1 6 8zm12 0v2a6 6 0 0 1-.4 1.5A3 3 0 0 0 19 7V6z'),
  palette: F('M12 2.5C6.5 2.5 2.5 6.6 2.5 11.8c0 5 4 9.7 8.8 9.7 1.6 0 2.4-1 2.4-2.2 0-1.5-1.3-1.8-1.3-3.1 0-1.2 1-2 2.2-2h2.6c2.8 0 4.3-1.9 4.3-4.4C21.5 6 17.3 2.5 12 2.5zM7.2 13a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm2-4.8a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm5.4-.2a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm3.2 3.6a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z'),
  shapes: F('M6.5 2.5 11 10H2zM17.5 2.5a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6zM3 13.5h8v8H3zM17.5 13.2l4.6 4.3-4.6 4.3-4.6-4.3z'),
  smile: F('M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM8.6 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6.8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7.3 14a5 5 0 0 0 9.4 0z'),
  hat: F('M8 5.5c1.2-1.4 2.7-.8 4 .2 1.3-1 2.8-1.6 4 .2 1 1.6 1.6 4.4 1.8 7.4l3.4-1.4c.7-.3 1.4.5 1 1.2-1.6 3.2-5.2 5.6-10.2 5.6S3.4 16.3 1.8 13.1c-.4-.7.3-1.5 1-1.2l3.4 1.4c.2-3 .8-5.8 1.8-7.8z'),
  flag: F('M4 2h2v20H4zM7 3h14v11H7zm2 2v3h3V5zm3 3v3h3V8zm3-3v3h3V5zm-6 6v2h3v-2zm6 0v2h3v-2z'),
  umbrella: F('M12 2a10 10 0 0 1 10 10h-9v6.5a3.5 3.5 0 0 1-7 0V18h2v.5a1.5 1.5 0 0 0 3 0V12H2A10 10 0 0 1 12 2z'),
  circlecheck: F('M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm4.4 5.6-5.6 6.2-3-2.8-1.6 1.7 4.7 4.4 7.3-8z'),
  comment: F('M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.5 21l4.4-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z'),
  send: F('M2.5 3.2 22 12 2.5 20.8l2.6-7.6L14 12l-8.9-1.2z'),
  mute: S('M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6'),
  dice: F('M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.6 2.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm8.8 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM12 10.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm-4.4 4.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm8.8 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z'),
  hammer: F('M3 4.5h11a3 3 0 0 1 3 3V9h3.5v4H17v1.5a3 3 0 0 1-3 3H3zM8 17.5h3V22H8z'),
  rotate: S('M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5'),
  copy: S('M9 9h10.5v11.5H9zM5 15H4.5V4H15v.5'),
  eye: S('M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'),
  wifi: S('M2.5 9a14 14 0 0 1 19 0M5.8 12.5a9.3 9.3 0 0 1 12.4 0M9.1 16a4.6 4.6 0 0 1 5.8 0M12 19.6v.1'),
  link: S('M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1'),
  shoe: F('M2 15.5c0-2 .8-4.4 1.6-6.5.4-1 1.5-1.4 2.4-.9l3 1.7c.9.5 2 .4 2.7-.3l1.4-1.3 6 4.2c1.2.8 1.9 2.2 1.9 3.6V17H2zM2 18.5h20V20H2z'),
  swords: S('M4 4l9.5 9.5M4 4h3.5L15 11.5M4 4v3.5L11.5 15M20 4l-9.5 9.5M20 4h-3.5M20 4v3.5M13 16.5l4.5 4.5M16 13.5l4.5 4.5M17 17l-3 3M7 17l3 3M3.5 18l3-3M8 13.5 3.5 18M10.5 16 6 20.5'),
  droplet: F('M12 2.5c3.3 4.3 7 8.4 7 12.2a7 7 0 0 1-14 0c0-3.8 3.7-7.9 7-12.2zM8.6 14.5a1 1 0 0 0-1 1 4.4 4.4 0 0 0 4.4 4.4 1 1 0 0 0 0-2 2.4 2.4 0 0 1-2.4-2.4 1 1 0 0 0-1-1z'),
  bullseye: S('M12 2.8a9.2 9.2 0 1 0 0 18.4 9.2 9.2 0 0 0 0-18.4zM12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2zM12 11.5v1'),
  wall: F('M2 4h9v4H2zM13 4h9v4h-9zM2 10h4v4H2zM8 10h8v4H8zM18 10h4v4h-4zM2 16h9v4H2zM13 16h9v4h-9z'),
  ball: F('M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM9 6.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm4.6 1.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM10.6 11a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z'),
  gift: F('M3 8h18v4H3zM4.5 13h6.5v8H5.5a1 1 0 0 1-1-1zM13 13h6.5v7a1 1 0 0 1-1 1H13zM11 8h2v13h-2zM12 7.5C10.8 4.6 9 3 7.4 3.4 5.7 3.8 5.9 6.6 8 7.5zm0 0c1.2-2.9 3-4.5 4.6-4.1 1.7.4 1.5 3.2-.6 4.1z'),
  medal: F('M7 2h4l2 5-3 1.2zM17 2h-4l-1.4 3.6L14 8.2zM12 8.5a6.7 6.7 0 1 1 0 13.4 6.7 6.7 0 0 1 0-13.4zm0 2.6-1.2 2.6-2.8.3 2.1 1.9-.6 2.8 2.5-1.4 2.5 1.4-.6-2.8 2.1-1.9-2.8-.3z'),
  userplus: F('M9.5 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM1.5 20.5c.6-4 3.9-6.5 8-6.5s7.4 2.5 8 6.5a.8.8 0 0 1-.8.9H2.3a.8.8 0 0 1-.8-.9zM18.5 7h2v3h3v2h-3v3h-2v-3h-3v-2h3z'),
};
const ALIAS = {
  'fa-house': 'house', 'fa-shirt': 'shirt', 'fa-store': 'store', 'fa-user': 'user', 'fa-users': 'users', 'fa-gear': 'gear', 'fa-crown': 'crown',
  'fa-pen': 'pen', 'fa-ticket': 'ticket', 'fa-globe': 'globe', 'fa-robot': 'robot', 'fa-xmark': 'x', 'fa-chevron-left': 'left', 'fa-chevron-right': 'right',
  'fa-chevron-up': 'up', 'fa-lock': 'lock', 'fa-clock': 'clock', 'fa-door-open': 'door', 'fa-right-from-bracket': 'exit', 'fa-right-to-bracket': 'enter',
  'fa-arrow-up': 'jump', 'fa-person-swimming': 'dive', 'fa-hand': 'hand', 'fa-play': 'play', 'fa-check': 'check', 'fa-star': 'star', 'fa-trophy': 'trophy',
  'fa-palette': 'palette', 'fa-shapes': 'shapes', 'fa-face-smile': 'smile', 'fa-hat-cowboy': 'hat', 'fa-flag-checkered': 'flag', 'fa-umbrella-beach': 'umbrella',
  'fa-circle-check': 'circlecheck', 'fa-user-plus': 'userplus', 'fa-dice': 'dice', 'fa-comment': 'comment', 'fa-paper-plane': 'send', 'fa-volume-xmark': 'mute', 'fa-hammer': 'hammer', 'fa-rotate': 'rotate',
  'fa-copy': 'copy', 'fa-eye': 'eye', 'fa-wifi': 'wifi', 'fa-link': 'link', 'fa-shoe-prints': 'shoe',
  'fa-gift': 'gift', 'fa-swords': 'swords', 'fa-droplet': 'droplet', 'fa-bullseye': 'bullseye', 'fa-wall': 'wall', 'fa-bowling-ball': 'ball', 'fa-medal': 'medal', 'fa-gem': 'gem',
};
const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

function swap(i) {
  const k = [...i.classList].find((c) => ALIAS[c]);
  if (!k) return;
  const span = document.createElement('span');
  span.innerHTML = icon(ALIAS[k]);
  const svg = span.firstChild;
  if (i.getAttribute('style')) svg.setAttribute('style', i.getAttribute('style'));
  for (const c of i.classList) if (!c.startsWith('fa')) svg.classList.add(c);
  svg.classList.add(k);
  i.replaceWith(svg);
}
function iconize(root = document) { root.querySelectorAll('i[class*="fa-"]').forEach(swap); }
function watchIcons() {
  iconize();
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.tagName === 'I') swap(n); else iconize(n); } }).observe(document.body, { childList: true, subtree: true });
}


export { ICONS, icon, iconize, watchIcons };
