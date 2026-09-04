// mock-data.jsx — rendering helpers (colormap + seeded RNG).
//
// The data-generation functions that used to live here have moved to
// utils/mock-backend.js (which speaks the WS protocol). This file now only
// exposes the small rendering helpers the panels still need.

// Build a colormap function from a stops array. t in [0,1] → "rgb(...)"
function makeColormap(stops) {
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const cols = stops.map(hexToRgb);
  return function cmap(t) {
    const x = Math.max(0, Math.min(1, t));
    const seg = x * (cols.length - 1);
    const i = Math.floor(seg);
    const f = seg - i;
    const a = cols[i], b = cols[Math.min(cols.length - 1, i + 1)];
    const r = Math.round(lerp(a[0], b[0], f));
    const g = Math.round(lerp(a[1], b[1], f));
    const bl = Math.round(lerp(a[2], b[2], f));
    return `rgb(${r},${g},${bl})`;
  };
}

// Seeded pseudo-random (Mulberry32) — used by a couple of decorative bits.
function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Object.assign(window, { makeColormap, makeRng });
