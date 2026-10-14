export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const clamp01 = (value) => clamp(value, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/* 0 before `a`, 1 after `b`, eased in between. */
export const smoothRange = (value, a, b) => smoothstep((value - a) / (b - a));

/* Deterministic PRNG (mulberry32) so scenery is identical on every visit. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const parseHex = (hex) => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/* Blend two #rrggbb colors; returns an rgb() string. */
export function mixColor(a, b, t) {
  const from = parseHex(a);
  const to = parseHex(b);
  const k = clamp01(t);
  const [r, g, bl] = from.map((channel, i) => Math.round(lerp(channel, to[i], k)));
  return `rgb(${r}, ${g}, ${bl})`;
}

export function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}
