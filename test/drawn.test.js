import test from 'node:test';
import assert from 'node:assert/strict';
import { trackFromStroke, REASON_TEXT } from '../src/core/drawn.js';
import { validateTrack, wallDistance } from '../src/core/track.js';
import { createRng } from '../src/core/rng.js';
import { acht } from './helpers.js';

/** A hand-drawn-looking circle: many points with a little jitter. */
function wobblyCircle(radius = 120, n = 200, noise = 2) {
  const rng = createRng(11);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push({ x: 350 + (radius + rng.range(-noise, noise)) * Math.cos(a), y: 225 + (radius + rng.range(-noise, noise)) * Math.sin(a) });
  }
  return pts;
}

test('verwackelter Kreis wird angenommen', () => {
  const r = trackFromStroke(wobblyCircle(), 8);
  assert.equal(r.ok, true);
  assert.deepEqual(validateTrack(r.track), { ok: true });
  assert.ok(Math.abs(r.track.length - 2 * Math.PI * 120) < 40, `length ${r.track.length}`);
  assert.equal(r.track.halfWidth, 8);
});

test('angenommene Strecke ist fahrbar: Start liegt auf der Fahrbahn', () => {
  const { track } = trackFromStroke(wobblyCircle(), 8);
  assert.ok(wallDistance(track, track.start.x, track.start.y) > 6);
  assert.ok(Number.isFinite(track.start.heading));
});

test('offener Strich wird geschlossen', () => {
  const open = wobblyCircle().slice(0, 180); // 10 % missing
  assert.equal(trackFromStroke(open, 8).ok, true);
});

test('ein Punkt, leere Liste, kein Array, winziger Kringel', () => {
  const kringel = Array.from({ length: 30 }, (_, i) => ({ x: 100 + 5 * Math.cos(i / 4), y: 100 + 5 * Math.sin(i / 4) }));
  for (const p of [[], [{ x: 0, y: 0 }], null, undefined, 'x', kringel]) {
    assert.deepEqual(trackFromStroke(p, 8), { ok: false, reason: 'zu-wenig' });
  }
});

test('NaN-Punkte und kaputte Einträge werden ignoriert', () => {
  const pts = wobblyCircle();
  pts.splice(10, 0, { x: NaN, y: 3 }, { x: 5, y: Infinity }, null, {});
  assert.equal(trackFromStroke(pts, 8).ok, true);
});

test('Acht wird abgelehnt', () => {
  const pts = acht(160, 120).map((p) => ({ x: p.x + 350, y: p.y + 225 }));
  assert.deepEqual(trackFromStroke(pts, 8), { ok: false, reason: 'kreuzt-sich' });
});

test('spitze Ecke wird abgelehnt, nicht heimlich entschärft', () => {
  // long thin triangle: the tip is far too tight for the width
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push({ x: 50 + i * 10, y: 100 + i * 1.5 });
  for (let i = 40; i >= 0; i--) pts.push({ x: 50 + i * 10, y: 220 - i * 1.5 });
  const r = trackFromStroke(pts, 8);
  assert.equal(r.ok, false);
  assert.ok(['zu-eng', 'beruehrt-sich'].includes(r.reason), r.reason);
});

test('ungültige Breite wird abgelehnt', () => {
  for (const w of [NaN, 0, -3, undefined]) assert.equal(trackFromStroke(wobblyCircle(), w).ok, false);
});

test('jede Ablehnung hat einen deutschen Satz', () => {
  for (const reason of ['zu-wenig', 'zu-kurz', 'kreuzt-sich', 'beruehrt-sich', 'zu-eng']) {
    assert.ok(typeof REASON_TEXT[reason] === 'string' && REASON_TEXT[reason].length > 20, reason);
  }
});
