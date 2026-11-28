import test from 'node:test';
import assert from 'node:assert/strict';
import { EVO_DEFAULTS, nextGeneration } from '../src/core/evolution.js';
import { createRng } from '../src/core/rng.js';

/** Population where genome i is filled with the value i. */
function population(n = 60, len = 20) {
  return Array.from({ length: n }, (_, i) => new Float32Array(len).fill(i));
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test('Vorgaben', () => {
  assert.deepEqual(EVO_DEFAULTS, { popSize: 60, elites: 4, tournament: 3, crossover: 0.5, rate: 0.1, sigma: 0.15 });
});

test('Größe bleibt, Eliten sind die Besten, unverändert und Kopien', () => {
  const pop = population();
  const fitness = pop.map((_, i) => i); // genome 59 is best
  const next = nextGeneration(pop, fitness, EVO_DEFAULTS, createRng(1));
  assert.equal(next.length, 60);
  for (let e = 0; e < 4; e++) {
    assert.ok(same(next[e], pop[59 - e]), `Elite ${e}`);
    assert.notEqual(next[e], pop[59 - e]);
  }
});

test('Eltern werden nicht verändert', () => {
  const pop = population();
  const before = pop.map((g) => Float32Array.from(g));
  nextGeneration(pop, pop.map((_, i) => i), EVO_DEFAULTS, createRng(2));
  pop.forEach((g, i) => assert.ok(same(g, before[i])));
});

test('rate 0 und crossover 0 ergibt nur Kopien vorhandener Genome', () => {
  const pop = population();
  const next = nextGeneration(pop, pop.map((_, i) => i), { ...EVO_DEFAULTS, rate: 0, crossover: 0 }, createRng(3));
  for (const child of next) assert.ok(pop.some((g) => same(g, child)));
});

test('Mischen nimmt jedes Gewicht von einem der beiden Eltern', () => {
  const pop = population();
  const next = nextGeneration(pop, pop.map((_, i) => i), { ...EVO_DEFAULTS, rate: 0, crossover: 1 }, createRng(4));
  let mixed = 0;
  for (const child of next.slice(4)) {
    const values = new Set(child);
    assert.ok(values.size <= 2);
    for (const v of values) assert.ok(Number.isInteger(v) && v >= 0 && v < 60);
    if (values.size === 2) mixed++;
  }
  assert.ok(mixed > 20, `mixed ${mixed}`);
});

test('Mutation trifft etwa rate der Gewichte mit Streuung sigma', () => {
  const pop = Array.from({ length: 60 }, () => new Float32Array(500));
  const next = nextGeneration(pop, pop.map(() => 1), { ...EVO_DEFAULTS, crossover: 0, rate: 0.1, sigma: 0.15 }, createRng(5));
  let changed = 0, total = 0, sq = 0;
  for (const child of next.slice(4)) for (const v of child) { total++; if (v !== 0) { changed++; sq += v * v; } }
  const share = changed / total;
  assert.ok(share > 0.08 && share < 0.12, `share ${share}`);
  const std = Math.sqrt(sq / changed);
  assert.ok(std > 0.13 && std < 0.17, `std ${std}`);
});

test('Auswahl bevorzugt hohe Fitness', () => {
  const pop = population();
  const fitness = pop.map((_, i) => (i === 7 ? 100 : 0));
  const next = nextGeneration(pop, fitness, { ...EVO_DEFAULTS, rate: 0, crossover: 0 }, createRng(6));
  const copies = next.filter((g) => same(g, pop[7])).length;
  // 1 elite + tournament wins: P(best among 3 of 60) is about 5 %, far above 1/60
  assert.ok(copies >= 2 && copies < 15, `copies ${copies}`);
});

test('stärkerer Selektionsdruck bei klarer Rangfolge', () => {
  const pop = population();
  const next = nextGeneration(pop, pop.map((_, i) => i), { ...EVO_DEFAULTS, rate: 0, crossover: 0 }, createRng(7));
  const meanParent = next.reduce((s, g) => s + g[0], 0) / next.length;
  assert.ok(meanParent > 40, `mean ${meanParent}`); // random choice would give 29.5
});

test('gleicher rng-Zustand, gleiche Kinder', () => {
  const pop = population();
  const f = pop.map((_, i) => i % 7);
  const a = nextGeneration(pop, f, EVO_DEFAULTS, createRng(9));
  const b = nextGeneration(pop, f, EVO_DEFAULTS, createRng(9));
  a.forEach((g, i) => assert.ok(same(g, b[i])));
});

test('Fitness NaN zählt als -Infinity', () => {
  const pop = population(10);
  const fitness = [NaN, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const next = nextGeneration(pop, fitness, { ...EVO_DEFAULTS, popSize: 10, rate: 0, crossover: 0 }, createRng(10));
  assert.ok(same(next[0], pop[9]));
  assert.ok(!next.some((g) => same(g, pop[0])), 'NaN-Genom darf nie gewinnen');
});

test('from: Gewichte vor dieser Stelle bleiben die der Mutter, dahinter wird gemischt und mutiert', () => {
  const pop = Array.from({ length: 60 }, (_, i) => { const g = new Float32Array(40); g.fill(i, 0, 25); g.fill(100 + i, 25); return g; });
  const next = nextGeneration(pop, pop.map((_, i) => i), { ...EVO_DEFAULTS, crossover: 1, rate: 0.5, sigma: 0.2, from: 25 }, createRng(11));
  let changedTail = 0;
  for (const child of next.slice(4)) {
    const head = new Set(child.subarray(0, 25));
    assert.equal(head.size, 1, 'der vordere Teil stammt unverändert von genau einem Elternteil');
    const parent = [...head][0];
    assert.ok(Number.isInteger(parent) && parent >= 0 && parent < 60);
    if (child.subarray(25).some((v) => !Number.isInteger(v))) changedTail++;
  }
  assert.ok(changedTail > 50, `hinterer Teil mutiert: ${changedTail}`);
});

test('from 0 oder fehlend verhält sich wie bisher', () => {
  const pop = population();
  const f = pop.map((_, i) => i % 7);
  const a = nextGeneration(pop, f, EVO_DEFAULTS, createRng(9));
  const b = nextGeneration(pop, f, { ...EVO_DEFAULTS, from: 0 }, createRng(9));
  a.forEach((g, i) => assert.ok(same(g, b[i])));
});
