// A track from a hand-drawn stroke. The stroke is closed and smoothed,
// nothing else is corrected: a stroke that cannot be driven is rejected with a reason.
import { buildGeometry, attachField, validateTrack } from './track.js';

const CONTROL_SPACING = 25; // metres between control points taken from the stroke
const MIN_POINTS = 8;
const MIN_EXTENT = 60; // metres

export const REASON_TEXT = {
  'zu-wenig': 'Das ist noch keine Strecke. Zeichne eine große, geschlossene Schleife.',
  'zu-kurz': 'Die Strecke ist zu kurz. Eine Runde braucht mindestens 400 Meter.',
  'kreuzt-sich': 'Die Strecke kreuzt sich selbst. Kreuzungen kann das Auto nicht fahren.',
  'beruehrt-sich': 'Zwei Abschnitte liegen so dicht beieinander, dass sich die Fahrbahnen berühren. Zeichne sie weiter auseinander oder wähle eine schmalere Fahrbahn.',
  'zu-eng': 'Eine Kurve ist für diese Fahrbahnbreite zu spitz. Zeichne sie runder oder wähle eine schmalere Fahrbahn.',
};

const reject = (reason) => ({ ok: false, reason });

function resampleClosed(pts, spacing) {
  const m = pts.length;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[m];
  const count = Math.max(6, Math.round(total / spacing));
  const out = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (seg < m - 1 && cum[seg + 1] < target) seg++;
    const span = cum[seg + 1] - cum[seg];
    const f = span > 0 ? (target - cum[seg]) / span : 0;
    const a = pts[seg], b = pts[(seg + 1) % m];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

/** One pass of Chaikin corner cutting on a closed polygon. */
function chaikin(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
    out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
  }
  return out;
}

/**
 * @param {{x:number,y:number}[]} points stroke in metres, in drawing order
 * @param {number} halfWidth metres from centerline to wall
 * @returns {{ok:true, track:object} | {ok:false, reason:'zu-wenig'|'zu-kurz'|'kreuzt-sich'|'beruehrt-sich'|'zu-eng'}}
 */
export function trackFromStroke(points, halfWidth) {
  if (!Array.isArray(points) || !(halfWidth > 0) || !Number.isFinite(halfWidth)) return reject('zu-wenig');
  const clean = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length < MIN_POINTS) return reject('zu-wenig');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of clean) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (Math.max(maxX - minX, maxY - minY) < MIN_EXTENT) return reject('zu-wenig');

  const control = chaikin(chaikin(resampleClosed(clean, CONTROL_SPACING)));
  const track = buildGeometry(control, halfWidth);
  const verdict = validateTrack(track);
  if (!verdict.ok) return reject(verdict.reason);
  return { ok: true, track: attachField(track) };
}
