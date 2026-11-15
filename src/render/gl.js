// CranGuys — WebGL2 renderer: glossy-plastic lighting, PCF shadow maps, procedural materials,
// skinned jelly-bean shader with procedural faces/patterns, sky, slime sea and sprite particles.

// ---------------- mat4 (column-major) ----------------
const m4 = {
  ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b, o = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f); return o; },
  ortho(l, r, b, t, n, f) { const o = m4.ident(); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); return o; },
  lookAt(e, c, up = [0, 1, 0]) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  trs(p, q, s = [1, 1, 1], o = new Float32Array(16)) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    o[0] = (1 - (yy + zz)) * s[0]; o[1] = (xy + wz) * s[0]; o[2] = (xz - wy) * s[0]; o[3] = 0;
    o[4] = (xy - wz) * s[1]; o[5] = (1 - (xx + zz)) * s[1]; o[6] = (yz + wx) * s[1]; o[7] = 0;
    o[8] = (xz + wy) * s[2]; o[9] = (yz - wx) * s[2]; o[10] = (1 - (xx + yy)) * s[2]; o[11] = 0;
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o;
  },
  // from a row-major 3x3 rotation + translation (sim/collide.js poses)
  fromRM(R, p, o = new Float32Array(16)) {
    o[0] = R[0]; o[1] = R[3]; o[2] = R[6]; o[3] = 0; o[4] = R[1]; o[5] = R[4]; o[6] = R[7]; o[7] = 0;
    o[8] = R[2]; o[9] = R[5]; o[10] = R[8]; o[11] = 0; o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o;
  },
  // upper-left 3x3 inverse-transpose
  nrm(m, o = new Float32Array(9)) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
    o[0] = A / det; o[1] = B / det; o[2] = C / det;
    o[3] = -(b * i - c * h) / det; o[4] = (a * i - c * g) / det; o[5] = -(a * h - b * g) / det;
    o[6] = (b * f - c * e) / det; o[7] = -(a * f - c * d) / det; o[8] = (a * e - b * d) / det;
    return o;
  },
  xform(m, v) { const x = v[0], y = v[1], z = v[2], w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; },
};

const MAT = { plain: 0, stripes: 1, conveyor: 2, ice: 3, bouncy: 4, tile: 5, door: 6, grass: 7, bricks: 8, rings: 9, arm: 10, bumper: 11, disc: 12, laser: 13, gold: 14, checker: 15, boulder: 16, cloud: 17, flagcloth: 18, slab: 19, log: 20 };

const COMMON = `
uniform vec3 uSun, uSunCol, uSky, uGnd, uFogCol, uEye; uniform vec2 uFog; uniform float uTime;
uniform highp sampler2DShadow uShadow; uniform int uShadowOn; uniform float uTexel;
float shadowAt(vec4 ls, float ndl) {
  if (uShadowOn == 0) return 1.0;
  vec3 c = ls.xyz / ls.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  float b = 0.0008 + 0.0024 * (1.0 - clamp(ndl, 0.0, 1.0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += texture(uShadow, vec3(c.xy + vec2(x, y) * uTexel * 1.1, c.z - b));
  return s / 9.0;
}
vec3 shade(vec3 base, vec3 n, vec3 w, vec4 ls, float spec, float gloss, float rimK) {
  float ndl = dot(n, uSun);
  float wrap = clamp((ndl + 0.3) / 1.3, 0.0, 1.0);
  float sh = mix(1.0, shadowAt(ls, ndl), step(0.0, ndl + 0.15));
  vec3 amb = mix(uGnd, uSky, n.y * 0.5 + 0.5);
  vec3 v = normalize(uEye - w), h = normalize(uSun + v);
  float sp = pow(max(dot(n, h), 0.0), gloss) * spec * sh;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * rimK;
  vec3 col = base * (amb * 0.66 + uSunCol * wrap * mix(0.45, 1.0, sh) * 0.78) + uSunCol * sp + uSky * rim;
  float d = length(uEye - w);
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, d) * 0.92);
  col = col * (1.0 + 0.08 * col) / (1.0 + 0.32 * col);  // gentle highlight roll-off, keeps candy colours punchy
  return col * 1.24;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float aastep(float t, float x) { float w = max(fwidth(x), 1e-4) * 0.75; return smoothstep(t - w, t + w, x); }
`;

const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol; layout(location=3) in vec3 aCol2;
layout(location=4) in vec2 aUV; layout(location=5) in float aMat; layout(location=6) in float aAux;
uniform mat4 uVP, uModel, uLVP; uniform mat3 uNM; uniform float uTime; uniform sampler2D uState; uniform int uDyn;
out vec3 vW, vN, vCol, vCol2; out vec2 vUV; flat out int vMat; out float vAux, vFlash, vDis; out vec4 vLS;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0); vFlash = 0.0; vDis = 0.0;
  if (uDyn == 1) {
    int i = int(aAux + 0.5);
    vec4 st = texelFetch(uState, ivec2(i % 64, i / 64), 0);
    // doomed tiles wobble gently, then dissolve in place (no falling)
    wp.x += sin(uTime * 41.0 + float(i)) * st.r * 0.035; wp.z += cos(uTime * 37.0 + float(i) * 1.7) * st.r * 0.035;
    vFlash = st.b; vDis = st.g;
    if (st.a < 0.5) wp = vec4(0.0, -99999.0, 0.0, 1.0);
  }
  vW = wp.xyz; vN = normalize(uNM * aNrm); vCol = aCol; vCol2 = aCol2; vUV = aUV; vMat = int(aMat + 0.5); vAux = aAux;
  vLS = uLVP * wp;
  gl_Position = uVP * wp;
}`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vCol, vCol2; in vec2 vUV; flat in int vMat; in float vAux, vFlash, vDis; in vec4 vLS;
uniform vec4 uTint; uniform float uEmit;
${COMMON}
out vec4 o;
void main() {
  vec3 n = normalize(vN);
  vec3 base = vCol, c2 = vCol2; float spec = 0.42, gloss = 38.0, rim = 0.28;
  vec2 tp = abs(n.y) > 0.6 ? vW.xz : (abs(n.x) > abs(n.z) ? vW.zy : vW.xy);
  if (vMat == 1) { base = mix(base, c2, aastep(0.5, fract((tp.x + tp.y) * 0.32))); }
  else if (vMat == 2) {
    float side = step(0.86, abs(vUV.x));
    float f = fract((vUV.y - uTime * vAux) * 0.42 - abs(vUV.x) * 0.55);
    base = mix(mix(base, c2, aastep(0.62, f) * (1.0 - side)), base * 0.6, side);
    spec = 0.3;
  }
  else if (vMat == 3) {
    float streak = vnoise(tp * vec2(0.6, 3.0)) * 0.5 + vnoise(tp * 2.3) * 0.3;
    base = mix(base, vec3(1.0), smoothstep(0.55, 0.9, streak) * 0.5);
    float glit = step(0.985, hash(floor(tp * 9.0))) * (0.5 + 0.5 * sin(uTime * 7.0 + hash(floor(tp * 9.0)) * 40.0));
    base += glit * 0.6; spec = 1.1; gloss = 90.0; rim = 0.5;
  }
  else if (vMat == 4) {
    vec2 g = fract(tp * 0.9) - 0.5; float d = length(g);
    float pulse = 0.5 + 0.5 * sin(uTime * 6.0 - length(tp) * 0.8);
    base = mix(base, c2, 1.0 - aastep(0.22 + pulse * 0.06, d)); base *= 1.0 + pulse * 0.12; spec = 0.6;
  }
  else if (vMat == 5) {
    float r = length(vUV), top = step(0.5, n.y);
    base = mix(base * 0.72, base, top);
    base = mix(base, mix(base, c2, 0.55), top * (1.0 - aastep(0.72, r)));
    base = mix(base, vec3(1.0, 0.95, 0.95), top * (1.0 - aastep(0.16, abs(r - 0.92))) * 0.35);
    base = mix(base, vec3(1.0, 0.92, 0.98), vFlash * 0.45 * (0.6 + 0.4 * sin(uTime * 18.0)));
    spec = 0.55; gloss = 46.0;
  }
  else if (vMat == 6) {
    vec2 u = vUV; float frame = max(aastep(0.82, abs(u.x)), aastep(0.86, abs(u.y)));
    float win = 1.0 - aastep(0.3, length((u - vec2(0.0, 0.42)) * vec2(1.0, 1.35)));
    float knob = 1.0 - aastep(0.09, length(u - vec2(0.55, -0.05)));
    base = mix(base, c2, max(frame * 0.85, win)); base = mix(base, vec3(1.0, 0.85, 0.2), knob);
  }
  else if (vMat == 7) {
    float dots = step(0.82, hash(floor(tp * 1.7))) * (1.0 - aastep(0.18, length(fract(tp * 1.7) - 0.5)));
    base = mix(base * (0.92 + 0.12 * vnoise(tp * 0.35)), c2, dots * 0.55); spec = 0.25;
  }
  else if (vMat == 8) {
    vec2 b = tp * vec2(1.0, 2.0); b.x += step(1.0, mod(floor(b.y), 2.0)) * 0.5;
    vec2 f = fract(b); float m = max(1.0 - aastep(0.06, f.x), 1.0 - aastep(0.1, f.y));
    base = mix(base, c2, m * 0.8);
  }
  else if (vMat == 9) { base = mix(base, c2, aastep(0.5, fract(length(vW.xz) * 0.22))); }
  else if (vMat == 10) { base = mix(base, c2, aastep(0.5, fract(vUV.x * 0.9))); spec = 0.7; gloss = 60.0; }
  else if (vMat == 11) {
    float a = atan(vUV.y, vUV.x) / 6.2831853;
    base = n.y > 0.5 ? mix(c2, base, aastep(0.45, length(vUV) / max(vAux, 0.01))) : mix(base, c2, aastep(0.5, fract(a * 10.0)));
    spec = 0.8; gloss = 70.0;
  }
  else if (vMat == 12) {
    float a = atan(vUV.y, vUV.x) / 6.2831853, r = length(vUV);
    base = mix(base, c2, aastep(0.5, fract(a * 8.0)) * step(0.5, n.y)); base = mix(base, base * 0.7, aastep(0.9, r / max(vAux, 0.01)));
  }
  else if (vMat == 20) { float a = atan(vUV.y, vUV.x) / 6.2831853; base = mix(base, c2, aastep(0.5, fract(a * 8.0))); spec = 0.55; gloss = 50.0; }
  else if (vMat == 14) {
    vec3 v = normalize(uEye - vW); vec3 rf = reflect(-v, n);
    base = mix(base * 0.7, vec3(1.0, 0.95, 0.7), pow(max(rf.y * 0.5 + 0.5, 0.0), 3.0)); spec = 1.4; gloss = 80.0; rim = 0.6;
  }
  else if (vMat == 15) { vec2 q = floor(tp * 0.5); base = mix(base, c2, mod(q.x + q.y, 2.0)); }
  else if (vMat == 16) { float s = vnoise(vUV * 2.5); base = mix(base, c2, smoothstep(0.55, 0.7, s)); spec = 0.25; }
  else if (vMat == 17) { spec = 0.0; rim = 0.6; }
  else if (vMat == 18) { base = mix(base, c2, aastep(0.5, fract(vUV.y * 2.0))); spec = 0.2; }
  else if (vMat == 19) { base = mix(base, c2, aastep(0.82, max(abs(vUV.x), abs(vUV.y)))); }
  vec3 col = shade(base, n, vW, vLS, spec, gloss, rim);
  col = mix(col, base * 1.6, uEmit);
  if (vDis > 0.0) { // magical dissolve with a glowing rim
    float nz = vnoise(vW.xz * 2.6 + vW.y * 1.7) * 0.7 + vnoise(vW.xz * 7.0) * 0.3;
    float th = vDis * 1.08;
    if (nz < th) discard;
    float edge = 1.0 - smoothstep(0.0, 0.1, nz - th);
    col = mix(col, vec3(1.0, 0.85, 1.0), edge * 0.95) + vec3(1.0, 0.45, 0.85) * edge * 0.6;
  }
  o = vec4(col * uTint.rgb, uTint.a);
}`;

const BEAN_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aLP; layout(location=3) in float aBone; layout(location=4) in float aReg;
uniform mat4 uVP, uLVP; uniform mat4 uB[5]; uniform vec4 uSq; uniform vec3 uWob;
out vec3 vW, vN, vLP; out float vReg; out vec4 vLS;
void main() {
  int b = int(aBone + 0.5);
  vec3 p = aPos, n = aNrm;
  if (b == 0) {
    float sy = uSq.x, sx = uSq.y;
    float hgt = p.y + 0.66;
    p = vec3(p.x * sx, p.y * sy, p.z * sx);
    p.xz += uWob.xz * hgt * hgt * 0.55;
    n = normalize(vec3(n.x / sx, n.y / sy, n.z / sx));
  }
  vec4 wp = uB[b] * vec4(p, 1.0);
  vW = wp.xyz; vN = normalize(mat3(uB[b]) * n); vLP = aLP; vReg = aReg; vLS = uLVP * wp;
  gl_Position = uVP * wp;
}`;

const BEAN_FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vLP; in float vReg; in vec4 vLS;
uniform vec3 uColA, uColB; uniform int uPat, uFace, uExpr; uniform float uBlink, uRainbow, uMetal, uHit, uFx; uniform vec4 uTint;
${COMMON}
out vec4 o;
vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0) * 0.75 + 0.25; }
float sdStar(vec2 p, float r) { float a = atan(p.y, p.x), k = 0.5 + 0.5 * cos(a * 5.0); return length(p) - r * (0.55 + 0.45 * k); }
float sdHeart(vec2 p, float s) { p /= s; p.y = -p.y + 0.25; p.x = abs(p.x); float a = p.y - p.x * 0.75; return (length(vec2(p.x, a)) - 0.55) * s; }
vec2 h22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float eye(vec2 e, int face, float blink, bool right) {
  // returns 1 where ink (dark) should be drawn
  if (uExpr == 1) { vec2 q = abs(e); return 1.0 - aastep(0.014, min(abs(q.x - q.y), 99.0) * step(q.x, 0.055) * step(q.y, 0.055) + step(0.055, max(q.x, q.y))); }
  if (uExpr == 2 || face == 1 || (face == 6 && right)) { float d = abs(length(e - vec2(0.0, -0.035)) - 0.055); return (1.0 - aastep(0.013, d)) * step(-0.01, e.y); }
  if (face == 2) { return (1.0 - aastep(0.012, abs(e.y + 0.01))) * step(abs(e.x), 0.055); }
  if (face == 4) return 1.0 - aastep(0.0, sdHeart(e, 0.09));
  if (face == 7) return 1.0 - aastep(0.0, sdStar(e, 0.065));
  if (face == 8) { float r = length(e), a = atan(e.y, e.x) / 6.2831853; return (1.0 - aastep(0.2, abs(fract(r * 26.0 - a) - 0.5))) * (1.0 - aastep(0.062, r)); } // spirals
  if (face == 9) { vec2 q = right ? e / vec2(0.032, 0.045 * max(blink, 0.08)) : e / vec2(0.058, 0.078 * max(blink, 0.08)); return 1.0 - aastep(1.0, length(q)); } // one big, one small
  if (face == 10) { vec2 q = e / vec2(0.056, 0.084 * max(blink, 0.08)); return 1.0 - aastep(1.0, length(q)); } // big shiny eyes
  vec2 q = e / vec2(0.047, 0.07 * max(blink, 0.08));
  return 1.0 - aastep(1.0, length(q));
}
void main() {
  vec3 n = normalize(vN);
  vec3 lp = vLP;
  vec3 A = uRainbow > 0.5 ? hsv(fract(uTime * 0.12 + lp.y * 0.35 + atan(lp.x, lp.z) * 0.08)) : uColA, B = uColB;
  float u = atan(lp.x, lp.z) / 6.2831853;
  float pm = 0.0; // 0 = main colour, 1 = pattern colour
  if (vReg < 0.5) {
    if (uPat == 1) pm = aastep(0.5, fract(lp.y * 4.2 + 0.25));
    else if (uPat == 2) { vec2 g = vec2(u * 9.0, lp.y * 5.2); g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5; pm = 1.0 - aastep(0.26, length(fract(g) - 0.5)); }
    else if (uPat == 3) pm = aastep(0.5, fract(lp.y * 3.8 + abs(fract(u * 7.0) - 0.5) * 1.1));
    else if (uPat == 4) { vec2 g = vec2(u * 8.0, lp.y * 4.5); pm = aastep(0.0, sin(g.x * 3.14159) * sin(g.y * 3.14159)); }
    else if (uPat == 5) pm = aastep(0.0, lp.x);
    else if (uPat == 6) { vec2 g = vec2(u * 7.0, lp.y * 4.0); g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5; pm = 1.0 - aastep(0.0, sdStar(fract(g) - 0.5, 0.28)); }
    else if (uPat == 7) pm = aastep(0.5, fract(u * 3.0 + lp.y * 1.6));
    else if (uPat == 8) pm = smoothstep(-0.55, 0.65, lp.y);
    else if (uPat == 9) { vec2 g = vec2(u * 8.0, lp.y * 4.6); g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5; pm = 1.0 - aastep(0.0, sdHeart(fract(g) - 0.5, 0.36)); }
    else if (uPat == 10) pm = 0.5 * (aastep(0.62, fract(u * 10.0)) + aastep(0.62, fract(lp.y * 5.5))); // plaid
    else if (uPat == 11) pm = aastep(0.5, fract(lp.y * 4.0 + sin(u * 6.2831853 * 4.0) * 0.14)); // waves
    else if (uPat == 12) { vec2 g = vec2(u * 9.0, lp.y * 5.0), c = floor(g), o = h22(c) * 0.36 - 0.18; float d = length(fract(g) - 0.5 - o); pm = (1.0 - aastep(0.25, d)) * aastep(0.13, d) + (1.0 - aastep(0.07, length(fract(g + 0.5) - 0.5 + o * 0.5))) ; pm = clamp(pm, 0.0, 1.0); } // leopard
    else if (uPat == 13) { vec2 g = vec2(u * 8.0, lp.y * 4.0); float d = abs(fract(g.x) - 0.5) + abs(fract(g.y) - 0.5); pm = aastep(0.0, 0.5 - d) * 0.8 + (1.0 - aastep(0.012, abs(fract(g.x + g.y) - 0.5))) * 0.4; pm = clamp(pm, 0.0, 1.0); } // argyle
    else if (uPat == 14) { float nz = vnoise(vec2(u * 14.0, lp.y * 7.0)) * 0.65 + vnoise(vec2(u * 30.0, lp.y * 15.0)) * 0.35; pm = aastep(0.52, nz) * 0.6 + aastep(0.68, nz) * 0.4; } // camo
    else if (uPat == 15) pm = 0.5 + 0.5 * sin(u * 6.2831853 * 2.0 + lp.y * 9.0 + sin(u * 6.2831853 * 6.0 + lp.y * 4.0) * 1.3); // tie-dye
  }
  vec3 base = mix(A, B, pm);
  if (uPat != 8 && uPat != 15 && vReg < 0.5) base *= 1.0 - pm * (1.0 - pm) * 0.55;          // printed edge between the two colours
  if (vReg > 1.5) base = A * 0.86; else if (vReg > 0.5) base = mix(A, B, uPat == 5 ? step(0.0, lp.x) : 0.0) * 0.97;
  float glossK = 1.0 + uMetal * 0.6, isVisor = 0.0;
  // face visor + eyes (front of the body, local +z)
  if (vReg < 0.5 && lp.z > 0.0) {
    vec2 fp = vec2(lp.x, lp.y - 0.42);
    float r = length(fp / vec2(0.285, 0.205));
    float vis = 1.0 - aastep(1.0, r);
    if (vis > 0.0) {
      vec3 visor = vec3(1.0, 0.965, 0.94) * (0.93 + 0.09 * smoothstep(-0.2, 0.18, fp.y)); // soft top-lit dome
      visor *= 1.0 - smoothstep(0.72, 1.0, r) * 0.13;                                        // recessed rim
      float ink = 0.0;
      bool shades = uFace == 3 && uExpr == 0;
      if (shades) {
        vec2 q = abs(fp - vec2(0.0, 0.02)); float g = 1.0 - aastep(0.0, max(q.x - 0.2, q.y - 0.055) - 0.02);
        ink = g; float glint = (1.0 - aastep(0.012, abs(fp.x - fp.y * 1.2 + 0.1))) * g + (1.0 - aastep(0.008, abs(fp.x - fp.y * 1.2 + 0.16))) * g * 0.6;
        visor = mix(visor, mix(vec3(0.05, 0.04, 0.12), vec3(0.22, 0.12, 0.42), smoothstep(-0.05, 0.08, fp.y)), ink); visor += glint * 0.75;
      } else {
        vec2 el = fp - vec2(-0.105, 0.015), er = fp - vec2(0.105, 0.015);
        if (uFace == 11 && uExpr == 0) { el = fp - vec2(0.0, 0.02); er = vec2(9.0); ink = 1.0 - aastep(1.0, length(el / vec2(0.085, 0.1 * max(uBlink, 0.08)))); } // cyclops
        else ink = max(eye(el, uFace, uBlink, false), eye(er, uFace, uBlink, true));
        vec3 inkc = (uFace == 4 && uExpr == 0) ? vec3(1.0, 0.22, 0.42) : (uFace == 7 && uExpr == 0) ? vec3(1.0, 0.72, 0.08) : mix(vec3(0.22, 0.12, 0.4), vec3(0.06, 0.03, 0.12), smoothstep(-0.05, 0.04, fp.y - 0.015));
        visor = mix(visor, inkc, ink);
        if (uFace == 0 || uFace == 5 || uFace == 6 || uFace == 4 || uFace == 7 || uFace == 9 || uFace == 10 || uFace == 11) { // two glossy catch-lights per eye
          float hl = (1.0 - aastep(0.017, length(el - vec2(0.016, 0.026)))) + (1.0 - aastep(0.009, length(el - vec2(-0.015, -0.022))));
          if (uFace != 6) hl += (1.0 - aastep(0.017, length(er - vec2(0.016, 0.026)))) + (1.0 - aastep(0.009, length(er - vec2(-0.015, -0.022))));
          visor = mix(visor, vec3(1.0), clamp(hl, 0.0, 1.0) * ink * step(0.5, uBlink));
        }
        if (uFace == 5 || uExpr == 3) { // brows
          float s = uExpr == 3 ? -1.0 : 1.0;
          float br = (1.0 - aastep(0.011, abs(fp.y - 0.1 - s * 0.35 * (abs(fp.x) - 0.1)))) * step(abs(abs(fp.x) - 0.1), 0.065);
          visor = mix(visor, vec3(0.1, 0.06, 0.18), br);
        }
        if (uFace == 1 || uFace == 4 || uFace == 6 || uFace == 7 || uExpr == 2) { // rosy cheeks
          float ch = (1.0 - smoothstep(0.0, 1.0, length((vec2(abs(fp.x), fp.y) - vec2(0.18, -0.07)) / vec2(0.06, 0.035))));
          visor = mix(visor, vec3(1.0, 0.55, 0.66), ch * 0.55 * (1.0 - ink));
        }
      }
      base = mix(base, visor, vis); isVisor = vis;
    }
  }
  // ---- jelly-candy lighting ----
  vec3 v = normalize(uEye - vW);
  float ndl = dot(n, uSun), ndv = max(dot(n, v), 0.0);
  float sh = mix(1.0, shadowAt(vLS, ndl), step(0.0, ndl + 0.15));
  float wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);
  float ao = vReg < 0.5 ? mix(0.7, 1.0, smoothstep(-0.66, -0.12, lp.y)) : vReg > 1.5 ? 0.85 : 0.95;  // darker toward the feet
  vec3 amb = mix(uGnd, uSky, n.y * 0.5 + 0.5);
  vec3 sss = base * base * (1.0 - isVisor * 0.6);                                              // colour bleeds into the shade side
  vec3 col = base * (amb * 0.6 * ao + uSunCol * wrap * mix(0.48, 1.0, sh) * 0.8) + sss * (1.0 - wrap) * 0.42 * ao;
  float back = pow(clamp(dot(v, -uSun) * 0.5 + 0.5, 0.0, 1.0), 4.0) * pow(1.0 - ndv, 2.0);      // light glowing through the edges
  col += base * back * 0.55;
  vec3 h = normalize(uSun + v); float nh = max(dot(n, h), 0.0);
  float spec = (pow(nh, 16.0) * 0.12 + pow(nh, 120.0 + isVisor * 60.0) * 0.95) * sh * glossK;
  col += uSunCol * spec;
  float fr = pow(1.0 - ndv, 3.0);
  col += mix(uSky, base + 0.25, 0.45) * fr * (0.42 + uMetal * 0.3);
  if (uMetal > 0.0) { // polished gold: reflect the sky, the ground and the sun
    vec3 rf = reflect(-v, n);
    vec3 env = mix(uGnd * 0.7, uSky * 1.15, smoothstep(-0.4, 0.6, rf.y)) + uSunCol * pow(max(dot(rf, uSun), 0.0), 28.0) * 2.2;
    col = mix(col, base * env * 1.45 + vec3(1.0, 0.92, 0.6) * (pow(fr, 1.5) * 0.45 + pow(nh, 60.0) * 0.8), uMetal * 0.72 * (1.0 - isVisor));
  }
  if (uFx > 0.5 && isVisor < 0.5) { // legendary: tiny glitter that twinkles
    vec2 gq = vec2(u * 60.0, lp.y * 40.0), gp = floor(gq), gf = fract(gq) - 0.5;
    float tw = hash(gp), ph = fract(tw * 13.0 + uTime * (0.6 + tw));
    float star = max(0.0, 1.0 - length(gf) * 3.4) + max(0.0, 1.0 - abs(gf.x) * 16.0) * max(0.0, 1.0 - abs(gf.y) * 2.6) + max(0.0, 1.0 - abs(gf.y) * 16.0) * max(0.0, 1.0 - abs(gf.x) * 2.6);
    col += vec3(1.0, 0.95, 0.8) * step(0.94, tw) * pow(1.0 - abs(ph * 2.0 - 1.0), 5.0) * star * 1.3;
  }
  float d = length(uEye - vW);
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, d) * 0.92);
  col = col * (1.0 + 0.08 * col) / (1.0 + 0.32 * col);
  col *= 1.24;
  col = mix(col, vec3(1.0, 1.0, 1.0), uHit * 0.5);
  o = vec4(col * uTint.rgb, uTint.a);
}`;

const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=6) in float aAux;
uniform mat4 uLVP, uModel; uniform sampler2D uState; uniform int uDyn;
void main() { vec4 wp = uModel * vec4(aPos, 1.0);
  if (uDyn == 1) { int i = int(aAux + 0.5); vec4 st = texelFetch(uState, ivec2(i % 64, i / 64), 0); if (st.a < 0.5 || st.g > 0.45) wp = vec4(0.0, -99999.0, 0.0, 1.0); }
  gl_Position = uLVP * wp; }`;
const DEPTH_BEAN_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=3) in float aBone;
uniform mat4 uLVP; uniform mat4 uB[5]; uniform vec4 uSq;
void main() { int b = int(aBone + 0.5); vec3 p = aPos; if (b == 0) p = vec3(p.x * uSq.y, p.y * uSq.x, p.z * uSq.y); gl_Position = uLVP * uB[b] * vec4(p, 1.0); }`;
const DEPTH_FS = `#version 300 es
precision mediump float; void main() {}`;

const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP; uniform mat4 uInvVP; out vec3 vDir;
void main() { vec4 p = uInvVP * vec4(aP, 1.0, 1.0); vDir = p.xyz / p.w; gl_Position = vec4(aP, 0.9999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir; uniform vec3 uTop, uHor, uBot, uSun, uSunCol, uEye; uniform float uTime;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir - uEye);
  float y = d.y;
  vec3 col = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHor, uBot, pow(clamp(-y * 2.5, 0.0, 1.0), 0.7));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(sd, 400.0) * 1.2 + pow(sd, 18.0) * 0.22);
  if (y > 0.02) {
    vec2 cp = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.012, 0.0);
    float c = fbm(cp);
    float cl = smoothstep(0.52, 0.78, c) * smoothstep(0.02, 0.25, y);
    vec3 cc = mix(vec3(1.0), uHor, 0.18) + uSunCol * 0.08;
    col = mix(col, cc, cl * 0.85);
  }
  o = vec4(col, 1.0);
}`;

const SLIME_VS = `#version 300 es
layout(location=0) in vec2 aP; uniform mat4 uVP; uniform float uY, uTime; uniform vec3 uEye; out vec3 vW;
void main() { vec3 p = vec3(aP.x + uEye.x, uY, aP.y + uEye.z);
  p.y += sin(p.x * 0.18 + uTime * 1.3) * 0.35 + cos(p.z * 0.21 + uTime * 1.1) * 0.35;
  vW = p; gl_Position = uVP * vec4(p, 1.0); }`;
const SLIME_FS = `#version 300 es
precision highp float;
in vec3 vW; uniform vec3 uEye, uSun, uSunCol, uFogCol, uSlime, uSlime2; uniform vec2 uFog; uniform float uTime;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vW.xz;
  float w1 = vn(p * 0.12 + uTime * 0.1), w2 = vn(p * 0.31 - uTime * 0.13);
  vec3 n = normalize(vec3((w1 - 0.5) * 0.6 + (w2 - 0.5) * 0.4, 1.0, (w2 - 0.5) * 0.6));
  vec3 base = mix(uSlime, uSlime2, smoothstep(0.35, 0.75, w1 * 0.6 + w2 * 0.4));
  float bub = step(0.93, hash(floor(p * 0.9 + vec2(0.0, floor(uTime * 0.7))))) * (1.0 - smoothstep(0.1, 0.35, length(fract(p * 0.9) - 0.5)));
  base = mix(base, vec3(1.0, 0.85, 0.95), bub * 0.6);
  vec3 v = normalize(uEye - vW), h = normalize(uSun + v);
  float sp = pow(max(dot(n, h), 0.0), 90.0) * 1.2;
  float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 col = base * (0.72 + 0.35 * max(dot(n, uSun), 0.0)) + uSunCol * sp + fr * 0.25;
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, length(uEye - vW)));
  o = vec4(col * 1.1, 1.0);
}`;

const SPR_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol;
uniform mat4 uVP; out vec2 vUV; out vec4 vCol;
void main() { vUV = aUV; vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
const SPR_FS = `#version 300 es
precision mediump float; in vec2 vUV; in vec4 vCol; uniform sampler2D uTex; out vec4 o;
void main() { vec4 t = texture(uTex, vUV); o = vec4(t.rgb * vCol.rgb, t.a * vCol.a); if (o.a < 0.004) discard; }`;

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl = gl; this.ok = !!gl;
    if (!gl) return;
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.getExtension('OES_standard_derivatives');
    this.P = {
      world: this.prog(WORLD_VS, WORLD_FS), bean: this.prog(BEAN_VS, BEAN_FS),
      depth: this.prog(DEPTH_VS, DEPTH_FS), depthBean: this.prog(DEPTH_BEAN_VS, DEPTH_FS),
      sky: this.prog(SKY_VS, SKY_FS), slime: this.prog(SLIME_VS, SLIME_FS), spr: this.prog(SPR_VS, SPR_FS),
    };
    this.ok = Object.values(this.P).every(Boolean);
    // fullscreen triangle + slime grid
    this.tri = this.vao2([-1, -1, 3, -1, -1, 3]);
    const g = [], N = 64, S = 900;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = (i / N - 0.5) * S, x1 = ((i + 1) / N - 0.5) * S, z0 = (j / N - 0.5) * S, z1 = ((j + 1) / N - 0.5) * S;
      g.push(x0, z0, x0, z1, x1, z0, x1, z0, x0, z1, x1, z1);
    }
    this.slimeVAO = this.vao2(g); this.slimeN = g.length / 2;
    // sprite dynamic buffer
    this.sprVAO = gl.createVertexArray(); this.sprBuf = gl.createBuffer();
    gl.bindVertexArray(this.sprVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.sprBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 9 * 6 * 6000, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
    gl.bindVertexArray(null);
    // dynamic-object state texture (tiles/doors): 64 x 32 RGBA8
    this.stateData = new Uint8Array(64 * 32 * 4);
    this.stateTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.stateData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.shadowSize = 0; this.setShadow(2048);
    this.ident = m4.ident(); this.identN = m4.nrm(this.ident);
    this.lvp = m4.ident(); this.vp = m4.ident();
    this.theme = null; this.time = 0;
    this.stats = { draws: 0 };
  }

  prog(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s), src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n')); return null; } return s; };
    const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  vao2(arr) {
    const gl = this.gl, vao = gl.createVertexArray(), b = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null); return vao;
  }

  setShadow(size) {
    const gl = this.gl;
    if (size === this.shadowSize) return;
    if (this.shadowTex) { gl.deleteTexture(this.shadowTex); gl.deleteFramebuffer(this.shadowFB); this.shadowTex = null; }
    this.shadowSize = size;
    if (!size) return;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Interleaved world mesh: 16 floats/vertex (pos3 nrm3 col3 col2_3 uv2 mat aux)
  mesh(verts, idx, layout = 'world') {
    const gl = this.gl, vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts instanceof Float32Array ? verts : new Float32Array(verts), gl.STATIC_DRAW);
    if (layout === 'world') {
      const S = 64, at = (loc, n, off) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off); };
      at(0, 3, 0); at(1, 3, 12); at(2, 3, 24); at(3, 3, 36); at(4, 2, 48); at(5, 1, 56); at(6, 1, 60);
    } else { // bean: pos3 nrm3 lp3 bone region = 11 floats
      const S = 44, at = (loc, n, off) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off); };
      at(0, 3, 0); at(1, 3, 12); at(2, 3, 24); at(3, 1, 36); at(4, 1, 40);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx instanceof Uint32Array ? idx : new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, n: idx.length, vb, ib, free: () => { gl.deleteVertexArray(vao); gl.deleteBuffer(vb); gl.deleteBuffer(ib); } };
  }

  texture(canvas) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  uploadState() { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.stateTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 32, gl.RGBA, gl.UNSIGNED_BYTE, this.stateData); }

  resize(scale = 1, dprCap = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap) * scale;
    const w = Math.max(2, Math.round(this.cv.clientWidth * dpr)), h = Math.max(2, Math.round(this.cv.clientHeight * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.w = w; this.h = h; this.aspect = w / h;
  }

  // ---------- frame ----------
  setCamera(eye, target, fov, near = 0.3, far = 900) {
    this.eye = eye; this.view = m4.lookAt(eye, target); this.proj = m4.persp(fov, this.aspect, near, far);
    this.vp = m4.mul(this.proj, this.view);
    this.invVP = invert4(this.vp);
  }
  setTheme(t) { this.theme = t; }
  setLight(center, radius = 38) {
    const t = this.theme, s = t.sun;
    const S = this.shadowSize || 1024, texel = (radius * 2) / S;
    const c = [Math.round(center[0] / texel) * texel, Math.round(center[1] / texel) * texel, Math.round(center[2] / texel) * texel];
    const eye = [c[0] + s[0] * 80, c[1] + s[1] * 80, c[2] + s[2] * 80];
    const view = m4.lookAt(eye, c, Math.abs(s[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0]);
    const proj = m4.ortho(-radius, radius, -radius, radius, 1, 200);
    this.lvp = m4.mul(proj, view);
    this.texel = 1 / S;
  }

  beginShadow() {
    const gl = this.gl;
    if (!this.shadowSize) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 3.0);
    gl.cullFace(gl.FRONT);
    this.pass = 'shadow'; return true;
  }
  endShadow() { const gl = this.gl; gl.disable(gl.POLYGON_OFFSET_FILL); gl.cullFace(gl.BACK); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }

  // render into an offscreen RGBA target with a transparent background (locker & shop thumbnails)
  offscreen(w, h) {
    const gl = this.gl;
    if (!this.offFB || this.offW !== w || this.offH !== h) {
      if (this.offFB) { gl.deleteFramebuffer(this.offFB); gl.deleteRenderbuffer(this.offC); gl.deleteRenderbuffer(this.offD); }
      this.offFB = gl.createFramebuffer(); this.offC = gl.createRenderbuffer(); this.offD = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.offC); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.offD); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.offFB);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.offC);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.offD);
      this.offW = w; this.offH = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.offFB); gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.pass = 'main'; this.cur = null; this.noShadow = true;
  }
  readOffscreen() {
    const gl = this.gl, w = this.offW, h = this.offH, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.noShadow = false; this.cur = null;
    return px;
  }

  beginMain() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0.5, 0.6, 0.9, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.pass = 'main'; this.stats.draws = 0;
  }

  common(P) {
    const gl = this.gl, t = this.theme, u = P.u;
    gl.uniform3fv(u.uSun, t.sun); gl.uniform3fv(u.uSunCol, t.sunCol); gl.uniform3fv(u.uSky, t.sky); gl.uniform3fv(u.uGnd, t.gnd);
    gl.uniform3fv(u.uFogCol, t.fog); gl.uniform2fv(u.uFog, t.fogR); gl.uniform3fv(u.uEye, this.eye); gl.uniform1f(u.uTime, this.time);
    gl.uniform1i(u.uShadowOn, this.shadowSize && !this.noShadow ? 1 : 0); gl.uniform1f(u.uTexel, this.texel || 1 / 1024);
    gl.uniformMatrix4fv(u.uLVP, false, this.lvp); gl.uniformMatrix4fv(u.uVP, false, this.vp);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowSize ? this.shadowTex : null); gl.uniform1i(u.uShadow, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.stateTex); gl.uniform1i(u.uState, 2);
    gl.activeTexture(gl.TEXTURE0);
  }

  // draw a world mesh (static or with model matrix). opts: {dyn, tint, emit, blend}
  draw(mesh, model = null, opts = {}) {
    const gl = this.gl;
    if (this.pass === 'shadow') {
      if (opts.noShadow) return;
      const P = this.P.depth; if (this.cur !== P) { gl.useProgram(P.p); this.cur = P; gl.uniformMatrix4fv(P.u.uLVP, false, this.lvp); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.stateTex); gl.uniform1i(P.u.uState, 2); }
      gl.uniformMatrix4fv(P.u.uModel, false, model || this.ident); gl.uniform1i(P.u.uDyn, opts.dyn ? 1 : 0);
      gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0); return;
    }
    const P = this.P.world;
    if (this.cur !== P) { gl.useProgram(P.p); this.cur = P; this.common(P); }
    gl.uniformMatrix4fv(P.u.uModel, false, model || this.ident);
    gl.uniformMatrix3fv(P.u.uNM, false, model ? m4.nrm(model) : this.identN);
    gl.uniform1i(P.u.uDyn, opts.dyn ? 1 : 0);
    gl.uniform4fv(P.u.uTint, opts.tint || [1, 1, 1, 1]); gl.uniform1f(P.u.uEmit, opts.emit || 0);
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
    this.stats.draws++;
  }

  // bones: Float32Array(5*16); sq: [sy, sx, 0, 0]; wob: [wx, 0, wz]
  drawBean(mesh, bones, b) {
    const gl = this.gl;
    if (this.pass === 'shadow') {
      const P = this.P.depthBean; if (this.cur !== P) { gl.useProgram(P.p); this.cur = P; gl.uniformMatrix4fv(P.u.uLVP, false, this.lvp); }
      gl.uniformMatrix4fv(P.u.uB, false, bones); gl.uniform4fv(P.u.uSq, b.sq);
      gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0); return;
    }
    const P = this.P.bean;
    if (this.cur !== P) { gl.useProgram(P.p); this.cur = P; this.common(P); }
    const u = P.u;
    gl.uniformMatrix4fv(u.uB, false, bones); gl.uniform4fv(u.uSq, b.sq); gl.uniform3fv(u.uWob, b.wob);
    gl.uniform3fv(u.uColA, b.colA); gl.uniform3fv(u.uColB, b.colB); gl.uniform1i(u.uPat, b.pat); gl.uniform1i(u.uFace, b.face); gl.uniform1i(u.uExpr, b.expr);
    gl.uniform1f(u.uBlink, b.blink); gl.uniform1f(u.uRainbow, b.rainbow ? 1 : 0); gl.uniform1f(u.uMetal, b.metal || 0); gl.uniform1f(u.uHit, b.hit || 0); gl.uniform1f(u.uFx, b.fx || 0);
    gl.uniform4fv(u.uTint, b.tint || [1, 1, 1, 1]);
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
    this.stats.draws++;
  }

  drawSky() {
    const gl = this.gl, P = this.P.sky, t = this.theme; gl.useProgram(P.p); this.cur = P;
    gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
    gl.uniformMatrix4fv(P.u.uInvVP, false, this.invVP); gl.uniform3fv(P.u.uTop, t.top); gl.uniform3fv(P.u.uHor, t.hor); gl.uniform3fv(P.u.uBot, t.bot);
    gl.uniform3fv(P.u.uSun, t.sun); gl.uniform3fv(P.u.uSunCol, t.sunCol); gl.uniform3fv(P.u.uEye, this.eye); gl.uniform1f(P.u.uTime, this.time);
    gl.bindVertexArray(this.tri); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  drawSlime(y) {
    const gl = this.gl, P = this.P.slime, t = this.theme; gl.useProgram(P.p); this.cur = P;
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp); gl.uniform1f(P.u.uY, y); gl.uniform1f(P.u.uTime, this.time); gl.uniform3fv(P.u.uEye, this.eye);
    gl.uniform3fv(P.u.uSun, t.sun); gl.uniform3fv(P.u.uSunCol, t.sunCol); gl.uniform3fv(P.u.uFogCol, t.fog); gl.uniform2fv(P.u.uFog, t.fogR);
    gl.uniform3fv(P.u.uSlime, t.slime); gl.uniform3fv(P.u.uSlime2, t.slime2);
    gl.disable(gl.CULL_FACE); gl.bindVertexArray(this.slimeVAO); gl.drawArrays(gl.TRIANGLES, 0, this.slimeN); gl.enable(gl.CULL_FACE);
  }
  // sprites: Float32Array of (pos3 uv2 col4) * 6 per quad
  drawSprites(data, count, tex, additive) {
    if (!count) return;
    const gl = this.gl, P = this.P.spr; gl.useProgram(P.p); this.cur = P;
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u.uTex, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.sprVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.sprBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 54);
    gl.drawArrays(gl.TRIANGLES, 0, count * 6);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  blend(on, additive) { const gl = this.gl; if (on) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); } }
  project(p) { const v = m4.xform(this.vp, p); return { x: (v[0] * 0.5 + 0.5) * this.cv.clientWidth, y: (0.5 - v[1] * 0.5) * this.cv.clientHeight, z: v[2], behind: v[3] < 0 }; }
}

function invert4(m) {
  const inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  det = det ? 1 / det : 0;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}


export { m4, MAT, Renderer, invert4 };
