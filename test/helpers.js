// Shared fixtures for tests.
export function kreis(r, n, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Figure eight (lemniscate), crosses itself at the origin. */
export function acht(size = 150, n = 32) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push({ x: size * Math.sin(a), y: size * Math.sin(a) * Math.cos(a) });
  }
  return pts;
}

/** Teardrop: wide round end, legs meeting in a sharp tip at the origin. */
export function haarnadel() {
  const pts = [{ x: 0, y: 0 }];
  const leg = [12, 60, 120, 180];
  const s = Math.sin(Math.PI / 6), c = Math.cos(Math.PI / 6);
  for (const d of leg) pts.push({ x: d * s, y: d * c });
  // round end: from the +30deg leg, over the top, to the -30deg leg
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI; // 0..pi
    pts.push({ x: 90 * Math.cos(a), y: 170 + 70 * Math.sin(a) });
  }
  for (const d of leg.slice().reverse()) pts.push({ x: -d * s, y: d * c });
  return pts;
}

/** Long thin loop: two straight legs only 10 m apart. */
export function uForm() {
  const pts = [];
  for (let x = 0; x <= 200; x += 40) pts.push({ x, y: 0 });
  pts.push({ x: 203.5, y: 1.5 }, { x: 205, y: 5 }, { x: 203.5, y: 8.5 });
  for (let x = 200; x >= 0; x -= 40) pts.push({ x, y: 10 });
  pts.push({ x: -3.5, y: 8.5 }, { x: -5, y: 5 }, { x: -3.5, y: 1.5 });
  return pts;
}

export function near(actual, expected, tol, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg} expected ${expected} ± ${tol}, got ${actual}`);
  }
}
