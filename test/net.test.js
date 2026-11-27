import test from 'node:test';
import assert from 'node:assert/strict';
import { genomeLength, randomGenome, createScratch, forward } from '../src/core/net.js';
import { createRng } from '../src/core/rng.js';

test('Länge', () => {
  assert.equal(genomeLength([12, 16, 16, 2]), 514);
  assert.equal(genomeLength([2, 1]), 3);
});

test('Handrechnung einer Schicht', () => {
  const sizes = [2, 1];
  const g = Float32Array.from([0.5, -1, 0.25]);
  const out = forward(g, sizes, Float32Array.from([1, 2]), createScratch(sizes));
  assert.ok(Math.abs(out[0] - Math.tanh(0.5 - 2 + 0.25)) < 1e-6);
});

test('Handrechnung zweier Schichten, Layout: Gewichte dann Bias je Knoten', () => {
  const sizes = [1, 2, 1];
  // hidden0: w=1,b=0 ; hidden1: w=-1,b=0.5 ; out: w=[2,3], b=-1
  const g = Float32Array.from([1, 0, -1, 0.5, 2, 3, -1]);
  const scratch = createScratch(sizes);
  const out = forward(g, sizes, Float32Array.from([0.3]), scratch);
  const h0 = Math.tanh(0.3), h1 = Math.tanh(-0.3 + 0.5);
  assert.ok(Math.abs(scratch[0][0] - h0) < 1e-6);
  assert.ok(Math.abs(scratch[0][1] - h1) < 1e-6);
  assert.ok(Math.abs(out[0] - Math.tanh(2 * h0 + 3 * h1 - 1)) < 1e-6);
  assert.equal(out, scratch.at(-1));
});

test('Zufallsgenom: richtige Länge, Bias null, reproduzierbar', () => {
  const sizes = [12, 16, 16, 2];
  const g = randomGenome(sizes, createRng(1));
  assert.equal(g.length, 514);
  assert.equal(g[12], 0); // bias of first hidden node
  assert.deepEqual(g, randomGenome(sizes, createRng(1)));
  assert.notDeepEqual(g, randomGenome(sizes, createRng(2)));
});

test('Ausgaben liegen in [-1,1] und sind endlich', () => {
  const sizes = [12, 16, 16, 2];
  const rng = createRng(3);
  const scratch = createScratch(sizes);
  const input = new Float32Array(12);
  for (let k = 0; k < 100; k++) {
    const g = randomGenome(sizes, rng);
    for (let i = 0; i < 12; i++) input[i] = rng.range(-5, 5);
    const out = forward(g, sizes, input, scratch);
    assert.equal(out.length, 2);
    for (const v of out) assert.ok(Number.isFinite(v) && v >= -1 && v <= 1);
  }
});
