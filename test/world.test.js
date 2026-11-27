import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, RULES_FAHREN } from '../src/core/rules.js';
import { sense } from '../src/core/sensors.js';
import { createWorld, stepWorld, runToEnd } from '../src/core/world.js';
import { buildTrack } from '../src/core/track.js';
import { CAR, createCar } from '../src/core/car.js';
import { genomeLength, randomGenome } from '../src/core/net.js';
import { createRng } from '../src/core/rng.js';
import { kreis, near } from './helpers.js';

const track = buildTrack(kreis(100, 24), 8);
const sizes = [RULES_FAHREN.channels.length, 4, 2];

/** Genome with all weights zero and output biases that force constant outputs. */
function constantGenome(steer, throttle) {
  const g = new Float32Array(genomeLength(sizes));
  g[g.length - 1] = Math.atanh(throttle);          // bias of output 1
  g[g.length - 1 - (sizes[1] + 1)] = Math.atanh(steer); // bias of output 0
  return g;
}

test('Regelsatz: 12 Kanäle, 9 Strahlen', () => {
  assert.equal(RULES_FAHREN.channels.length, 12);
  assert.equal(RULES_FAHREN.channels.filter((c) => c.type === 'ray').length, 9);
  assert.equal(RULES_FAHREN.wallContact, 'fatal');
  near(DT, 1 / 30, 1e-12);
});

test('sense: 12 Werte in [-1,1], Strahl nach vorn sieht weiter als die seitlichen', () => {
  const car = createCar(track.start);
  car.vx = 40; car.vy = -3; car.steer = 0.25;
  const out = new Float32Array(12);
  sense(track, car, RULES_FAHREN, CAR, out);
  for (const v of out) assert.ok(v >= -1 && v <= 1 && Number.isFinite(v));
  // rays report sqrt(distance / range): fine resolution close to a wall
  near(out[0], Math.sqrt(8 / 150), 0.02);  // -90°: straight at the wall
  near(out[8], Math.sqrt(8 / 150), 0.02);  // +90°
  assert.ok(out[4] > out[0] * 1.7); // 0°: along the track
  near(out[9], 0.5, 1e-6);
  near(out[10], -0.15, 1e-6);
  near(out[11], 0.5, 1e-6);
});

test('Geradeaus-Vollgas endet an der Wand', () => {
  const w = createWorld(track, RULES_FAHREN, CAR, sizes, [constantGenome(0, 0.999)]);
  runToEnd(w);
  const c = w.cars[0];
  assert.equal(c.endReason, 'wand');
  assert.equal(c.alive, false);
  assert.ok(c.progress > 20 && c.progress < 200, `progress ${c.progress}`);
  assert.equal(w.done, true);
});

test('Null-Ausgabe endet als Stillstand nach ~3 s', () => {
  const w = createWorld(track, RULES_FAHREN, CAR, sizes, [constantGenome(0, 0)]);
  runToEnd(w);
  assert.equal(w.cars[0].endReason, 'stillstand');
  assert.ok(w.cars[0].time >= 3 && w.cars[0].time <= 3.2, `time ${w.cars[0].time}`);
});

/**
 * Slow circle driver: at ~9 m/s the steering limit is the full lock, so a constant
 * steering output holds a constant radius. Throttle 0.02 roughly balances drag.
 */
function circleRun(opts) {
  for (let s = 0.04; s < 0.07; s += 0.001) {
    const w = createWorld(track, RULES_FAHREN, CAR, sizes, [constantGenome(s, 0.02)], opts);
    w.cars[0].state.vx = 9;
    runToEnd(w);
    if (w.cars[0].endReason !== 'wand') return w.cars[0];
  }
  return null;
}

test('Kreisfahrer überlebt bis zur Zeit', () => {
  const c = circleRun();
  assert.ok(c, 'kein konstanter Lenkwinkel hält den Kreis');
  assert.equal(c.endReason, 'zeit');
  near(c.time, RULES_FAHREN.episodeSeconds, DT);
  assert.ok(c.progress > 300, `progress ${c.progress}`);
});

test('untilLap endet nach einer Runde', () => {
  const c = circleRun({ untilLap: true });
  assert.ok(c, 'keine Runde geschafft');
  assert.equal(c.endReason, 'runde');
  assert.ok(c.progress >= track.length);
  assert.ok(c.time < RULES_FAHREN.lapTimeout);
});

test('Rückwärts zählt negativ', () => {
  const w = createWorld(track, RULES_FAHREN, CAR, sizes, [constantGenome(0, 0)]);
  const c = w.cars[0];
  c.state.heading += Math.PI; c.state.vx = 20;
  for (let i = 0; i < 20; i++) stepWorld(w);
  assert.ok(c.progress < -5, `progress ${c.progress}`);
});

test('Autos beeinflussen sich nicht', () => {
  const rng = createRng(4);
  const a = randomGenome(sizes, rng), b = randomGenome(sizes, rng);
  const both = createWorld(track, RULES_FAHREN, CAR, sizes, [a, b]);
  const alone = createWorld(track, RULES_FAHREN, CAR, sizes, [a]);
  runToEnd(both); runToEnd(alone);
  assert.equal(both.cars[0].progress, alone.cars[0].progress);
  assert.equal(both.cars[0].time, alone.cars[0].time);
  assert.equal(both.cars[0].endReason, alone.cars[0].endReason);
});

test('gleiche Eingabe, gleiches Ergebnis', () => {
  const g = randomGenome(sizes, createRng(8));
  const w1 = createWorld(track, RULES_FAHREN, CAR, sizes, [g]);
  const w2 = createWorld(track, RULES_FAHREN, CAR, sizes, [g]);
  runToEnd(w1); runToEnd(w2);
  assert.deepEqual(w1.cars[0].state, w2.cars[0].state);
});

test('Welt ohne Autos ist sofort fertig', () => {
  const w = createWorld(track, RULES_FAHREN, CAR, sizes, []);
  stepWorld(w);
  assert.equal(w.done, true);
});
