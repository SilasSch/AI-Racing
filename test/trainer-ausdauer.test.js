import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainer, runGeneration, runTest, serialize, restoreTrainer, ruleSet, expandDriver } from '../src/core/trainer.js';
import { RULES_AUSDAUER, RULES_FAHREN } from '../src/core/rules.js';
import { genomeLength, forward, createScratch, randomGenome } from '../src/core/net.js';
import { STRATEGY_SIZES } from '../src/core/strategy.js';
import { createRng } from '../src/core/rng.js';

const small = (seed = 1, extra = {}) => createTrainer({ seed, rules: RULES_AUSDAUER, evo: { popSize: 8 }, ...extra });
const bytes = (g) => Array.from(new Uint8Array(g.buffer, g.byteOffset, g.byteLength));

test('Ausdauer-Trainer: Genom = Fahrer [15,16,16,2] + Strategie [7,8,4]', () => {
  const t = small();
  assert.deepEqual(t.sizes, [15, 16, 16, 2]);
  const expected = genomeLength([15, 16, 16, 2]) + genomeLength(STRATEGY_SIZES);
  for (const g of t.genomes) assert.equal(g.length, expected);
  assert.ok(t.genomes[0].slice(genomeLength(t.sizes)).some((v) => v !== 0), 'Strategie-Gewichte sind zufällig');
  assert.equal(ruleSet('ausdauer'), RULES_AUSDAUER);
});

test('Rennlänge je Generation liegt in [200, 320] und wechselt', () => {
  const t = small();
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    assert.ok(t.raceSeconds >= 200 && t.raceSeconds <= 320, `seconds ${t.raceSeconds}`);
    const s = runGeneration(t);
    assert.ok(s.seconds >= 200 && s.seconds <= 320);
    seen.add(s.seconds);
  }
  assert.equal(seen.size, 3);
});

test('gleicher Seed, identischer Verlauf (Ausdauer)', () => {
  const a = small(), b = small();
  runGeneration(a); runGeneration(a); runGeneration(b); runGeneration(b);
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(bytes(a.champion), bytes(b.champion));
});

test('GenStats trägt stops, retired, laps', () => {
  const t = small();
  const s = runGeneration(t);
  for (const key of ['stops', 'laps']) assert.ok(Number.isFinite(s[key]) && s[key] >= 0, key);
  assert.ok(Number.isInteger(s.retired) && s.retired >= 0 && s.retired <= 3);
});

test('fahren-Trainer hat diese Felder nicht', () => {
  const t = createTrainer({ seed: 1, evo: { popSize: 8 } });
  const s = runGeneration(t);
  assert.equal('stops' in s, false);
  assert.equal('retired' in s, false);
});

test('Speichern und Laden (Ausdauer) ändert nichts', () => {
  const a = small(), b = small();
  for (let i = 0; i < 3; i++) runGeneration(a);
  runGeneration(b);
  const restored = restoreTrainer(JSON.parse(JSON.stringify(serialize(b))));
  assert.ok(restored);
  assert.equal(restored.rules, RULES_AUSDAUER);
  runGeneration(restored); runGeneration(restored);
  assert.deepEqual(restored.history, a.history);
  assert.deepEqual(bytes(restored.champion), bytes(a.champion));
});

test('ein fahren-Stand lädt nicht als Ausdauer und umgekehrt', () => {
  const fahren = serialize(createTrainer({ seed: 1, evo: { popSize: 8 } }));
  assert.equal(restoreTrainer({ ...fahren, rules: 'ausdauer' }), null);
  const ausdauer = serialize(small());
  assert.equal(restoreTrainer({ ...ausdauer, rules: 'fahren' }), null);
});

test('runTest fährt unter den Ausdauer-Regeln eine Runde', () => {
  const t = small();
  const r = runTest(t.genomes[0], t);
  assert.equal(r.perTrack.length, 20);
  for (const p of r.perTrack) {
    assert.ok(['runde', 'schaden', 'sprit', 'stillstand', 'zeit'].includes(p.reason), p.reason);
    assert.equal(p.ok, p.reason === 'runde');
  }
});

test('expandDriver: alte Gewichte bleiben, neue Eingaben wiegen 0', () => {
  const from = [12, 16, 16, 2], to = [15, 16, 16, 2];
  const rng = createRng(5);
  const g = randomGenome(from, rng);
  const big = expandDriver(g, from, to);
  assert.equal(big.length, genomeLength(to));
  const inSmall = new Float32Array(12), inBig = new Float32Array(15);
  for (let k = 0; k < 20; k++) {
    for (let i = 0; i < 12; i++) inSmall[i] = inBig[i] = rng.range(-1, 1);
    for (let i = 12; i < 15; i++) inBig[i] = rng.range(-1, 1);
    const a = Array.from(forward(g, from, inSmall, createScratch(from)));
    const b = Array.from(forward(big, to, inBig, createScratch(to)));
    assert.deepEqual(a, b);
  }
});

test('expandDriver lehnt unpassende Netze ab', () => {
  const g = new Float32Array(genomeLength([12, 16, 16, 2]));
  assert.equal(expandDriver(g, [12, 16, 16, 2], [15, 8, 2]), null);
  assert.equal(expandDriver(g, [12, 16, 16, 2], [15, 16, 16, 3]), null);
  assert.equal(expandDriver(g, [12, 16, 16, 2], [11, 16, 16, 2]), null);
  assert.equal(expandDriver(g.slice(1), [12, 16, 16, 2], [15, 16, 16, 2]), null);
  assert.equal(expandDriver(null, [12, 16, 16, 2], [15, 16, 16, 2]), null);
});

test('Start aus unpassenden Fahrern ergibt null', () => {
  const good = { genomes: [new Float32Array(514)], sizes: [12, 16, 16, 2], difficulty: 0.4 };
  assert.ok(small(1, { drivers: good }));
  for (const drivers of [
    { ...good, genomes: [] },
    { ...good, sizes: [12, 8, 2] },
    { ...good, genomes: [new Float32Array(100)] },
    { ...good, genomes: 'x' },
    { ...good, difficulty: NaN },
    { ...good, genomes: [Float32Array.from({ length: 514 }, () => NaN)] },
  ]) assert.equal(small(1, { drivers }), null);
});

test('Start aus Fahrern übernimmt Schwierigkeit und verteilt die Fahrer reihum', () => {
  const a = new Float32Array(514).fill(0.25), b = new Float32Array(514).fill(-0.5);
  const t = small(1, { drivers: { genomes: [a, b], sizes: [12, 16, 16, 2], difficulty: 0.4 } });
  assert.equal(t.difficulty, 0.4);
  assert.equal(t.genomes.length, 8);
  assert.equal(t.genomes[0][0], 0.25);
  assert.equal(t.genomes[1][0], -0.5);
  assert.equal(t.genomes[2][0], 0.25);
  assert.equal(t.genomes[0][12], 0); // weight of the first new input
  // each car gets its own random strategy net
  const tail = (g) => Array.from(g.slice(genomeLength(t.sizes)));
  assert.notDeepEqual(tail(t.genomes[0]), tail(t.genomes[2]));
});

test('Start aus trainierten Fahrern: die Population fährt sofort', () => {
  const fahren = createTrainer({ seed: 2 });
  for (let i = 0; i < 25; i++) runGeneration(fahren);
  const t = createTrainer({ seed: 2, rules: RULES_AUSDAUER, drivers: { genomes: fahren.genomes, sizes: fahren.sizes, difficulty: fahren.difficulty } });
  const s = runGeneration(t);
  assert.ok(s.best * s.seconds >= 600, `beste Distanz ${s.best * s.seconds}`);
  const scratch = small(2);
  const cold = runGeneration(scratch);
  assert.ok(s.best > cold.best, `${s.best} vs ${cold.best}`);
});
