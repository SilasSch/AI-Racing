// Closed race track: centerline + half width, bounded by walls.
// A distance field on a grid answers "how far is the wall" quickly.

export const SAMPLE = 2; // metres between centerline samples
const CELL = 2; // metres per distance-field cell
const FIELD_EXTRA = 6; // field is exact up to halfWidth + FIELD_EXTRA from the centerline

/** Closed centripetal Catmull-Rom through `points`, densely sampled. */
function splineDense(points) {
  const pts = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push(p);
  }
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= 1e-6) pts.pop();
  }
  const m = pts.length;
  const dx = [], dy = [];
  if (m < 3) {
    for (const p of pts) { dx.push(p.x); dy.push(p.y); }
    return { dx, dy };
  }
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y));
    const t2 = t1 + Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const t3 = t2 + Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y));
    const steps = Math.max(8, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y)));
    for (let k = 0; k < steps; k++) {
      const t = t1 + ((t2 - t1) * k) / steps;
      // Barry-Goldman pyramid
      const a1x = ((t1 - t) * p0.x + (t - t0) * p1.x) / (t1 - t0), a1y = ((t1 - t) * p0.y + (t - t0) * p1.y) / (t1 - t0);
      const a2x = ((t2 - t) * p1.x + (t - t1) * p2.x) / (t2 - t1), a2y = ((t2 - t) * p1.y + (t - t1) * p2.y) / (t2 - t1);
      const a3x = ((t3 - t) * p2.x + (t - t2) * p3.x) / (t3 - t2), a3y = ((t3 - t) * p2.y + (t - t2) * p3.y) / (t3 - t2);
      const b1x = ((t2 - t) * a1x + (t - t0) * a2x) / (t2 - t0), b1y = ((t2 - t) * a1y + (t - t0) * a2y) / (t2 - t0);
      const b2x = ((t3 - t) * a2x + (t - t1) * a3x) / (t3 - t1), b2y = ((t3 - t) * a2y + (t - t1) * a3y) / (t3 - t1);
      dx.push(((t2 - t) * b1x + (t - t1) * b2x) / (t2 - t1));
      dy.push(((t2 - t) * b1y + (t - t1) * b2y) / (t2 - t1));
    }
  }
  return { dx, dy };
}

/** Resamples a closed polyline to points about SAMPLE metres apart. */
function resampleClosed(dx, dy) {
  const m = dx.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    cum[i + 1] = cum[i] + Math.hypot(dx[j] - dx[i], dy[j] - dy[i]);
  }
  const total = cum[m];
  const n = Math.max(8, Math.round(total / SAMPLE));
  const xs = new Float32Array(n), ys = new Float32Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    while (seg < m - 1 && cum[seg + 1] < target) seg++;
    const span = cum[seg + 1] - cum[seg];
    const f = span > 0 ? (target - cum[seg]) / span : 0;
    const j = (seg + 1) % m;
    xs[i] = dx[seg] + (dx[j] - dx[seg]) * f;
    ys[i] = dy[seg] + (dy[j] - dy[seg]) * f;
  }
  return { xs, ys, n };
}

function buildField(xs, ys, n, halfWidth) {
  const cap = halfWidth + FIELD_EXTRA;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const ox = minX - cap - CELL, oy = minY - cap - CELL;
  const w = Math.ceil((maxX + cap + CELL - ox) / CELL) + 1;
  const h = Math.ceil((maxY + cap + CELL - oy) / CELL) + 1;
  const data = new Float32Array(w * h).fill(cap);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = xs[i], ay = ys[i], bx = xs[j], by = ys[j];
    const ex = bx - ax, ey = by - ay;
    const len2 = ex * ex + ey * ey || 1e-12;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - cap - ox) / CELL));
    const c1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + cap - ox) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - cap - oy) / CELL));
    const r1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + cap - oy) / CELL));
    for (let r = r0; r <= r1; r++) {
      const py = oy + r * CELL;
      for (let c = c0; c <= c1; c++) {
        const px = ox + c * CELL;
        let u = ((px - ax) * ex + (py - ay) * ey) / len2;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        const qx = ax + u * ex - px, qy = ay + u * ey - py;
        const d = Math.sqrt(qx * qx + qy * qy);
        const k = r * w + c;
        if (d < data[k]) data[k] = d;
      }
    }
  }
  return { ox, oy, w, h, data, cap };
}

function curvatures(xs, ys, n) {
  const curv = new Float32Array(n);
  const k = Math.min(2, Math.floor((n - 1) / 2));
  for (let i = 0; i < n; i++) {
    const a = (i - k + n) % n, c = (i + k) % n;
    const abx = xs[i] - xs[a], aby = ys[i] - ys[a];
    const bcx = xs[c] - xs[i], bcy = ys[c] - ys[i];
    const acx = xs[c] - xs[a], acy = ys[c] - ys[a];
    const cross = Math.abs(abx * acy - aby * acx);
    const denom = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(acx, acy);
    curv[i] = denom > 1e-9 ? (2 * cross) / denom : 0;
  }
  return curv;
}

function pickStart(xs, ys, curv, n) {
  const window = Math.min(n, Math.round(120 / SAMPLE));
  let best = 0, bestVal = Infinity;
  for (let i = 0; i < n; i++) {
    let worst = 0;
    for (let k = 0; k < window; k++) {
      const c = curv[(i + k) % n];
      if (c > worst) worst = c;
    }
    if (worst < bestVal - 1e-9) { bestVal = worst; best = i; }
  }
  const j = (best + 1) % n;
  return { x: xs[best], y: ys[best], heading: Math.atan2(ys[j] - ys[best], xs[j] - xs[best]), index: best };
}

/**
 * Centerline only, without the distance field. Enough for validateTrack.
 * @param {{x:number,y:number}[]} points control points of the closed loop, in driving order
 * @param {number} halfWidth metres from centerline to wall
 */
export function buildGeometry(points, halfWidth) {
  const { dx, dy } = splineDense(points);
  const { xs, ys, n } = resampleClosed(dx, dy);
  let length = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    length += Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
  }
  const curv = curvatures(xs, ys, n);
  return {
    n, xs, ys, length, halfWidth, curv, field: null,
    bounds: { minX: minX - halfWidth, minY: minY - halfWidth, maxX: maxX + halfWidth, maxY: maxY + halfWidth },
    start: pickStart(xs, ys, curv, n),
  };
}

/** Adds the distance field that wallDistance and castRay need. */
export function attachField(track) {
  if (!track.field) track.field = buildField(track.xs, track.ys, track.n, track.halfWidth);
  return track;
}

/** Full track: centerline plus distance field. */
export function buildTrack(points, halfWidth) {
  return attachField(buildGeometry(points, halfWidth));
}

/** Distance to the nearest wall: positive on the road, <= 0 outside. */
export function wallDistance(track, x, y) {
  const f = track.field;
  const gx = (x - f.ox) / CELL, gy = (y - f.oy) / CELL;
  if (!(gx >= 0 && gy >= 0 && gx < f.w - 1 && gy < f.h - 1)) return track.halfWidth - f.cap;
  const c = gx | 0, r = gy | 0;
  const fx = gx - c, fy = gy - r;
  const k = r * f.w + c;
  const d = f.data;
  const top = d[k] + (d[k + 1] - d[k]) * fx;
  const bottom = d[k + f.w] + (d[k + f.w + 1] - d[k + f.w]) * fx;
  return track.halfWidth - (top + (bottom - top) * fy);
}

/** Distance along the ray until it meets a wall, at most `range`. */
export function castRay(track, x, y, angle, range) {
  const cx = Math.cos(angle), cy = Math.sin(angle);
  let tPrev = 0;
  let dPrev = wallDistance(track, x, y);
  if (dPrev <= 0) return 0;
  let t = 0;
  for (;;) {
    t = tPrev + (dPrev > 0.5 ? dPrev : 0.5);
    if (t > range) t = range;
    const d = wallDistance(track, x + cx * t, y + cy * t);
    if (d <= 0) return tPrev + ((t - tPrev) * dPrev) / (dPrev - d);
    if (t >= range) return range;
    tPrev = t;
    dPrev = d;
  }
}

/** Index of the nearest centerline sample, searched around `hint`. */
export function locate(track, x, y, hint) {
  const { xs, ys, n } = track;
  const reach = Math.min(20, (n - 1) >> 1);
  let best = hint, bestD = Infinity;
  for (let k = -reach; k <= reach; k++) {
    const i = (((hint + k) % n) + n) % n;
    const ex = xs[i] - x, ey = ys[i] - y;
    const d = ex * ex + ey * ey;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(cx, cy, dx, dy, ax, ay), d2 = o(cx, cy, dx, dy, bx, by);
  const d3 = o(ax, ay, bx, by, cx, cy), d4 = o(ax, ay, bx, by, dx, dy);
  // Non-strict on purpose: a crossing that runs exactly through a sample point still counts.
  return ((d1 >= 0 && d2 <= 0) || (d1 <= 0 && d2 >= 0)) && ((d3 >= 0 && d4 <= 0) || (d3 <= 0 && d4 >= 0));
}

/**
 * @returns {{ok:true}|{ok:false,reason:'zu-kurz'|'kreuzt-sich'|'beruehrt-sich'|'zu-eng'}}
 */
export function validateTrack(track) {
  const { xs, ys, n, halfWidth, length, curv } = track;
  if (length < 400) return { ok: false, reason: 'zu-kurz' };

  const spacing = length / n;
  const minSep = Math.ceil((6 * halfWidth) / spacing); // samples apart along the track
  const touch2 = (2 * halfWidth + 2) ** 2;
  const close2 = (2.5 * spacing) ** 2;
  let touches = false;
  for (let i = 0; i < n; i++) {
    for (let j = i + minSep; j < n; j++) {
      if (n - (j - i) < minSep) break; // too close going the other way round
      const ex = xs[j] - xs[i], ey = ys[j] - ys[i];
      const d2 = ex * ex + ey * ey;
      if (d2 >= touch2) continue;
      touches = true;
      if (d2 < close2) {
        for (let a = -2; a <= 1; a++) {
          const a0 = (i + a + n) % n, a1 = (a0 + 1) % n;
          for (let b = -2; b <= 1; b++) {
            const b0 = (j + b + n) % n, b1 = (b0 + 1) % n;
            if (segmentsCross(xs[a0], ys[a0], xs[a1], ys[a1], xs[b0], ys[b0], xs[b1], ys[b1])) {
              return { ok: false, reason: 'kreuzt-sich' };
            }
          }
        }
      }
    }
  }
  if (touches) return { ok: false, reason: 'beruehrt-sich' };

  let maxCurv = 0;
  for (let i = 0; i < n; i++) if (curv[i] > maxCurv) maxCurv = curv[i];
  if (maxCurv > 1 / (halfWidth + 4)) return { ok: false, reason: 'zu-eng' };
  return { ok: true };
}
