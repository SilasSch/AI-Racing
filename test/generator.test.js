import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTrack, difficultyParams } from '../src/core/generator.js';
import { validateTrack } from '../src/core/track.js';

test('Parameter folgen der Schwierigkeit', () => {
  assert.deepEqual(difficultyParams(0), { halfWidth: 9, points: 7, amplitude: 0.12 });
  const hard = difficultyParams(1);
  assert.equal(hard.halfWidth, 5.5);
  assert.equal(hard.points, 14);
  assert.ok(Math.abs(hard.amplitude - 0.45) < 1e-9);
});

test('Schwierigkeit außerhalb [0,1] wird begrenzt', () => {
  assert.deepEqual(difficultyParams(7), difficultyParams(1));
  assert.deepEqual(difficultyParams(-3), difficultyParams(0));
  assert.deepEqual(difficultyParams(NaN), difficultyParams(0));
});

test('1000 Strecken über alle Schwierigkeiten sind gültig', () => {
  for (let i = 0; i < 1000; i++) {
    const t = generateTrack(i, i / 999);
    assert.deepEqual(validateTrack(t), { ok: true }, `seed ${i}`);
  }
});

test('gleicher Seed, gleiche Strecke', () => {
  assert.deepEqual(generateTrack(5, 0.5).xs, generateTrack(5, 0.5).xs);
  assert.notDeepEqual(generateTrack(5, 0.5).xs, generateTrack(6, 0.5).xs);
});

test('schwerer heißt schmaler und kurviger', () => {
  const mean = (d) => {
    let hw = 0, curv = 0;
    for (let s = 0; s < 50; s++) {
      const t = generateTrack(s, d);
      hw += t.halfWidth;
      let c = 0;
      for (let i = 0; i < t.n; i++) c += t.curv[i];
      curv += c / t.n;
    }
    return { hw: hw / 50, curv: curv / 50 };
  };
  const easy = mean(0), hard = mean(1);
  assert.ok(hard.hw < easy.hw);
  assert.ok(hard.curv > easy.curv * 1.3, `${easy.curv} -> ${hard.curv}`);
});

test('beide Fahrtrichtungen kommen vor', () => {
  let ccw = 0, cw = 0;
  for (let s = 0; s < 40; s++) {
    const t = generateTrack(s, 0.3);
    let area = 0;
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      area += t.xs[i] * t.ys[j] - t.xs[j] * t.ys[i];
    }
    if (area > 0) ccw++; else cw++;
  }
  assert.ok(ccw >= 8 && cw >= 8, `ccw ${ccw}, cw ${cw}`);
});

test('Runde ist grob 1 bis 2,5 km lang', () => {
  for (let s = 0; s < 30; s++) {
    const len = generateTrack(s, s / 29).length;
    assert.ok(len > 1000 && len < 2600, `length ${len}`);
  }
});
