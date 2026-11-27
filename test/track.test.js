import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, wallDistance, castRay, locate, validateTrack } from '../src/core/track.js';
import { kreis, acht, haarnadel, uForm, near } from './helpers.js';

const t = buildTrack(kreis(100, 24), 8);

test('Länge ~ Kreisumfang, Abtastung ~2 m', () => {
  near(t.length, 2 * Math.PI * 100, 6);
  near(t.length / t.n, 2, 0.05);
  assert.equal(t.xs.length, t.n);
});

test('Wandabstand: Mitte, Rand, außen', () => {
  near(wallDistance(t, 100, 0), 8, 0.6);
  near(wallDistance(t, 107, 0), 1, 0.6);
  near(wallDistance(t, 93, 0), 1, 0.6);
  assert.ok(wallDistance(t, 112, 0) <= 0);
  assert.ok(wallDistance(t, 0, 0) <= 0);
  assert.ok(wallDistance(t, 1e6, -1e6) <= 0);
});

test('Strahl quer trifft nach ~8 m, entlang nach Sehnenlänge', () => {
  near(castRay(t, 100, 0, 0, 150), 8, 0.8);
  near(castRay(t, 100, 0, Math.PI, 150), 8, 0.8);
  near(castRay(t, 100, 0, Math.PI / 2, 150), Math.sqrt(108 ** 2 - 100 ** 2), 2);
});

test('Strahl ohne Wand in Reichweite gibt range zurück', () => {
  near(castRay(t, 100, 0, Math.PI / 2, 10), 10, 1e-6);
});

test('Strahl von außerhalb der Fahrbahn gibt 0', () => {
  assert.equal(castRay(t, 0, 0, 0, 150), 0);
});

test('locate folgt dem Auto um den Kreis', () => {
  let idx = locate(t, 100, 0, 0);
  let total = 0;
  for (let k = 1; k <= 360; k++) {
    const a = (k / 360) * 2 * Math.PI;
    const next = locate(t, 100 * Math.cos(a), 100 * Math.sin(a), idx);
    const step = (next - idx + t.n) % t.n;
    assert.ok(step >= 0 && step <= 3, `step ${step} at ${k}`);
    total += step;
    idx = next;
  }
  assert.equal(total, t.n);
});

test('Start liegt auf der Mittellinie und zeigt in Fahrtrichtung', () => {
  const s = t.start;
  near(Math.hypot(s.x, s.y), 100, 0.5);
  // counter-clockwise circle: heading is the tangent
  const tangent = Math.atan2(s.x, -s.y);
  near(Math.cos(s.heading - tangent), 1, 0.01);
  assert.ok(s.index >= 0 && s.index < t.n);
});

test('Start bevorzugt die Gerade', () => {
  // stadium: long straights along x, tight ends
  const pts = [];
  for (let x = -200; x <= 200; x += 50) pts.push({ x, y: -60 });
  pts.push({ x: 245, y: -42 }, { x: 260, y: 0 }, { x: 245, y: 42 });
  for (let x = 200; x >= -200; x -= 50) pts.push({ x, y: 60 });
  pts.push({ x: -245, y: 42 }, { x: -260, y: 0 }, { x: -245, y: -42 });
  const s = buildTrack(pts, 8).start;
  assert.ok(Math.abs(s.x) < 150, `start x ${s.x}`);
  near(Math.abs(s.y), 60, 2);
});

test('Gültigkeit', () => {
  assert.deepEqual(validateTrack(t), { ok: true });
  assert.equal(validateTrack(buildTrack(acht(), 8)).reason, 'kreuzt-sich');
  assert.equal(validateTrack(buildTrack(kreis(100, 24), 60)).ok, true);
  assert.equal(validateTrack(buildTrack(kreis(15, 12), 14)).reason, 'zu-kurz');
  assert.equal(validateTrack(buildTrack(haarnadel(), 8)).reason, 'zu-eng');
  assert.equal(validateTrack(buildTrack(uForm(), 8)).reason, 'beruehrt-sich');
});

test('doppelte Kontrollpunkte stören nicht', () => {
  const pts = kreis(100, 24);
  pts.splice(3, 0, { ...pts[3] });
  const d = buildTrack(pts, 8);
  for (const v of d.xs) assert.ok(Number.isFinite(v));
  near(d.length, 2 * Math.PI * 100, 6);
});
