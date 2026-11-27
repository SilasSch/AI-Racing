// Seeded randomness. Nothing under src/core may use Math.random().

/** Mixes any number of integers into one uint32. Order matters. */
export function hashSeed(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    h = (h + 0x9e3779b9) >>> 0;
  }
  return h >>> 0;
}

/** Turns anything into a uint32 seed. Non-numbers become 0. */
export function normalizeSeed(value) {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n) >>> 0;
}

/** mulberry32: one uint32 of state, so `state` describes the generator fully. */
export function createRng(seed) {
  let s = seed >>> 0;
  const rng = {
    get state() { return s; },
    set state(v) { s = v >>> 0; },
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) { return a + (b - a) * rng.next(); },
    int(n) { return Math.floor(rng.next() * n); },
    // Box-Muller without a cached second value.
    normal() {
      const u = 1 - rng.next();
      const v = rng.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return rng;
}
