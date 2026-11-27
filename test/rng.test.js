import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed, normalizeSeed } from '../src/core/rng.js';

test('gleicher Seed, gleiche Folge', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('verschiedene Seeds, verschiedene Folgen', () => {
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('state setzen setzt die Folge fort', () => {
  const a = createRng(7); a.next(); const s = a.state; const x = a.next();
  const b = createRng(1); b.state = s; assert.equal(b.next(), x);
});

test('state beschreibt auch normal() vollständig', () => {
  const a = createRng(9); a.normal(); const s = a.state; const x = a.normal();
  const b = createRng(3); b.state = s; assert.equal(b.normal(), x);
});

test('next liegt in [0,1), normal hat Mittel ~0 und Streuung ~1', () => {
  const r = createRng(123);
  let sum = 0, sq = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const u = r.next(); assert.ok(u >= 0 && u < 1); }
  for (let i = 0; i < n; i++) { const z = r.normal(); sum += z; sq += z * z; }
  const mean = sum / n, std = Math.sqrt(sq / n - mean * mean);
  assert.ok(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert.ok(Math.abs(std - 1) < 0.03, `std ${std}`);
});

test('range und int bleiben in ihren Grenzen', () => {
  const r = createRng(5);
  for (let i = 0; i < 1000; i++) {
    const x = r.range(-2, 3); assert.ok(x >= -2 && x < 3);
    const k = r.int(7); assert.ok(Number.isInteger(k) && k >= 0 && k < 7);
  }
});

test('hashSeed trennt Reihenfolge und liefert uint32', () => {
  assert.notEqual(hashSeed(1, 2), hashSeed(2, 1));
  const h = hashSeed(1, 2, 3);
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  assert.equal(hashSeed(1, 2, 3), hashSeed(1, 2, 3));
});

test('normalizeSeed', () => {
  for (const v of ['', 'abc', NaN, undefined, null]) assert.equal(normalizeSeed(v), 0);
  assert.equal(normalizeSeed('123'), 123);
  assert.equal(normalizeSeed(-1), 4294967295);
  assert.ok(Number.isInteger(normalizeSeed(1e20)));
  assert.ok(normalizeSeed(1e20) >= 0 && normalizeSeed(1e20) <= 0xffffffff);
});
