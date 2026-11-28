import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGY_SIZES, strategyInput, decide } from '../src/core/strategy.js';
import { forward, createScratch, genomeLength } from '../src/core/net.js';

test('forward mit offset liest das zweite Netz im Genom', () => {
  const sizes = [2, 1];
  const alone = Float32Array.from([0.5, -1, 0.25]);
  const behind = Float32Array.from([9, 9, 9, 9, 9, 0.5, -1, 0.25]);
  const input = Float32Array.from([1, 2]);
  const a = forward(alone, sizes, input, createScratch(sizes))[0];
  const b = forward(behind, sizes, input, createScratch(sizes), 5)[0];
  assert.equal(a, b);
});

test('Größe des Strategie-Netzes', () => {
  assert.deepEqual(STRATEGY_SIZES, [7, 8, 4]);
  assert.equal(genomeLength(STRATEGY_SIZES), 8 * 8 + 9 * 4);
});

test('strategyInput: 7 Werte in [-1,1], Reihenfolge wie im Design', () => {
  const out = new Float32Array(7);
  strategyInput({ fuelShare: 0.4, wear: 0.3, damage: 0.1, timeLeftShare: 0.8, lapsOfFuel: 2.5, lastLapRatio: 1.2 }, out);
  const expected = [0.4, 0.3, 0.1, 0.8, 0.5, 0.2, 1];
  expected.forEach((v, i) => assert.ok(Math.abs(out[i] - v) < 1e-6, `Eingang ${i}: ${out[i]}`));
});

test('strategyInput begrenzt Ausreißer', () => {
  const out = new Float32Array(7);
  strategyInput({ fuelShare: 1, wear: 3, damage: 1, timeLeftShare: 0, lapsOfFuel: 99, lastLapRatio: 7 }, out);
  assert.deepEqual(Array.from(out), [1, 1, 1, 0, 1, 1, 1]);
  strategyInput({ fuelShare: 0, wear: 0, damage: 0, timeLeftShare: 1, lapsOfFuel: 0, lastLapRatio: 0.2 }, out);
  assert.ok(Math.abs(out[5] + 0.8) < 1e-6);
});

test('fehlende Rundenzeit und fehlender Verbrauch ergeben 0, nie NaN', () => {
  const out = new Float32Array(7);
  strategyInput({ fuelShare: 1, wear: 0, damage: 0, timeLeftShare: 1, lapsOfFuel: NaN, lastLapRatio: NaN }, out);
  for (const v of out) assert.ok(Number.isFinite(v));
  assert.equal(out[4], 1); // unknown consumption: assume the tank lasts
  assert.equal(out[5], 0);
});

/** Strategy genome whose output biases force fixed outputs, placed behind `offset` filler weights. */
function fixedStrategy(outputs, offset = 0) {
  const g = new Float32Array(offset + genomeLength(STRATEGY_SIZES));
  const hidden = STRATEGY_SIZES[1];
  const outStart = offset + (STRATEGY_SIZES[0] + 1) * hidden;
  outputs.forEach((v, i) => { g[outStart + i * (hidden + 1) + hidden] = Math.atanh(v); });
  return g;
}

test('decide bildet die vier Ausgaben ab', () => {
  const input = new Float32Array(7).fill(0.5);
  const scratch = createScratch(STRATEGY_SIZES);
  const yes = decide(fixedStrategy([0.5, -0.5, 0.3, 0.8]), 0, input, scratch);
  assert.equal(yes.box, true);
  assert.ok(Math.abs(yes.fuelTarget - 0.25) < 1e-6);
  assert.equal(yes.tyres, true);
  assert.ok(Math.abs(yes.pace - 0.9) < 1e-6);
  const no = decide(fixedStrategy([-0.5, 0.9, -0.3, -0.999], 40), 40, input, scratch);
  assert.equal(no.box, false);
  assert.equal(no.tyres, false);
  assert.ok(no.pace < 0.01 && no.pace >= 0);
  assert.ok(no.fuelTarget > 0.9 && no.fuelTarget <= 1);
});
