import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrainer, advance, runGeneration, runTest, testTracks, trainingTrackSeed, testTrackSeed,
  validationTracks, validationTrackSeed,
  serialize, restoreTrainer, TRACKS_PER_GEN, TEST_EVERY, ruleSet,
} from '../src/core/trainer.js';
import { RULES_FAHREN } from '../src/core/rules.js';
import { validateTrack } from '../src/core/track.js';

const small = (seed = 1) => createTrainer({ seed, evo: { popSize: 12 } });
const bytes = (g) => Array.from(new Uint8Array(g.buffer, g.byteOffset, g.byteLength));

test('Vorgaben', () => {
  const t = createTrainer();
  assert.equal(t.seed, 1);
  assert.equal(t.genomes.length, 60);
  assert.deepEqual(t.sizes, [12, 16, 16, 2]);
  assert.equal(t.gen, 0);
  assert.equal(t.difficulty, 0);
  assert.equal(t.champion, null);
  assert.equal(TRACKS_PER_GEN, 3);
  assert.equal(TEST_EVERY, 5);
  assert.ok(t.world && t.world.cars.length === 60);
});

test('gleicher Seed, identischer Verlauf; anderer Seed, anderer Verlauf', () => {
  const a = small(), b = small(), c = small(2);
  for (let i = 0; i < 3; i++) { runGeneration(a); runGeneration(b); runGeneration(c); }
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(bytes(a.champion), bytes(b.champion));
  assert.notDeepEqual(a.history, c.history);
});

test('runGeneration liefert die Statistik der Generation', () => {
  const t = small();
  const s = runGeneration(t);
  assert.equal(s.gen, 1);
  assert.equal(t.gen, 1);
  assert.equal(t.history.length, 1);
  assert.ok(s.best >= s.mean && s.mean >= 0);
  assert.ok(Number.isInteger(s.clean) && s.clean >= 0 && s.clean <= 3);
  assert.equal(t.champion.length, 514);
});

test('advance in kleinen Schritten = runGeneration', () => {
  const a = small(), b = small();
  runGeneration(a); runGeneration(a);
  let done = 0, guard = 0;
  while (done < 2 && guard++ < 1e6) if (advance(b, 7)) done++;
  assert.equal(done, 2);
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(bytes(a.champion), bytes(b.champion));
});

test('advance hält an der Generationsgrenze an', () => {
  const t = createTrainer({ seed: 1 });
  // far more steps than one generation of crashing random cars needs
  assert.equal(advance(t, 1e9), true);
  assert.equal(t.gen, 1);
  assert.equal(t.history.length, 1);
  assert.equal(t.world.steps, 0);
  assert.equal(t.trackIndex, 0);
});

test('runGeneration macht genau eine Generation', () => {
  const t = createTrainer({ seed: 1 });
  for (let i = 1; i <= 4; i++) { assert.equal(runGeneration(t).gen, i); assert.equal(t.gen, i); }
});

test('Speichern und Fortsetzen ändert nichts', () => {
  const a = small(), b = small();
  for (let i = 0; i < 4; i++) runGeneration(a);
  runGeneration(b); runGeneration(b);
  const restored = restoreTrainer(JSON.parse(JSON.stringify(serialize(b))));
  assert.ok(restored);
  runGeneration(restored); runGeneration(restored);
  assert.deepEqual(restored.history, a.history);
  assert.deepEqual(bytes(restored.champion), bytes(a.champion));
  assert.equal(restored.seed, a.seed);
  assert.equal(restored.difficulty, a.difficulty);
});

test('Speichern mitten in einer Generation setzt an deren Anfang wieder auf', () => {
  const a = small(), b = small();
  runGeneration(a); runGeneration(a);
  runGeneration(b); advance(b, 50);
  const restored = restoreTrainer(JSON.parse(JSON.stringify(serialize(b))));
  runGeneration(restored);
  assert.deepEqual(restored.history, a.history);
});

test('restoreTrainer verträgt Müll', () => {
  const good = serialize(small());
  const bad = [null, undefined, {}, { version: 99 }, 'x', 42, [], { version: 1, genomes: ['###'] },
    { ...good, genomes: good.genomes.slice(1) }, { ...good, genomes: good.genomes.map(() => 'AAAA') },
    { ...good, difficulty: 'hoch' }, { ...good, rules: 'gibt-es-nicht' }, { ...good, history: 'x' }];
  for (const d of bad) assert.equal(restoreTrainer(d), null, JSON.stringify(d)?.slice(0, 60));
  assert.ok(restoreTrainer(good));
});

test('Seed-Unsinn ergibt gültigen Trainer', () => {
  for (const s of ['', 'abc', NaN, -5, 1e20, null]) {
    const t = createTrainer({ seed: s, evo: { popSize: 4 } });
    assert.ok(Number.isInteger(t.seed) && t.seed >= 0 && t.seed <= 0xffffffff);
  }
});

test('Test- und Trainings-Seeds überschneiden sich nicht', () => {
  for (let i = 0; i < 20; i++) assert.ok(testTrackSeed(i) >= 0x80000000);
  for (const seed of [0, 1, 0xffffffff]) {
    for (let gen = 0; gen < 200; gen++) for (let k = 0; k < 3; k++) assert.ok(trainingTrackSeed(seed, gen, k) < 0x80000000);
  }
  assert.notEqual(trainingTrackSeed(1, 0, 0), trainingTrackSeed(1, 0, 1));
  assert.notEqual(trainingTrackSeed(1, 0, 0), trainingTrackSeed(1, 1, 0));
  assert.notEqual(trainingTrackSeed(1, 0, 0), trainingTrackSeed(2, 0, 0));
});

test('Teststrecken: 20, gültig, alle Schwierigkeiten, unabhängig vom Trainer', () => {
  const tracks = testTracks();
  assert.equal(tracks.length, 20);
  assert.equal(testTracks(), tracks);
  for (const t of tracks) assert.deepEqual(validateTrack(t), { ok: true });
  assert.equal(tracks[0].halfWidth, 9);
  assert.equal(tracks[19].halfWidth, 5.5);
});

test('runTest zählt nur volle Runden', () => {
  const t = small();
  const r = runTest(t.genomes[0], t);
  assert.equal(r.perTrack.length, 20);
  assert.equal(r.passed, r.perTrack.filter((p) => p.ok).length);
  for (const p of r.perTrack) {
    assert.equal(p.ok, p.reason === 'runde');
    assert.ok(Number.isFinite(p.speed) && p.speed >= 0);
  }
  assert.ok(Number.isFinite(r.meanSpeed));
});

test('runTest misst Tempo wie das Training: Distanz in fester Zeit', async () => {
  const { createWorld, runToEnd } = await import('../src/core/world.js');
  const t = createTrainer({ seed: 1 });
  for (let i = 0; i < 6; i++) runGeneration(t);
  const r = runTest(t.champion, t);
  let sum = 0;
  testTracks().forEach((track, i) => {
    const w = createWorld(track, t.rules, t.spec, t.sizes, [t.champion]);
    runToEnd(w);
    const speed = Math.max(0, w.cars[0].progress) / t.rules.episodeSeconds;
    assert.ok(Math.abs(r.perTrack[i].speed - speed) < 1e-9, `Strecke ${i}`);
    sum += speed;
  });
  assert.ok(Math.abs(r.meanSpeed - sum / 20) < 1e-9);
});

test('nach jeder 5. Generation wird getestet', () => {
  const t = small();
  for (let i = 0; i < 5; i++) runGeneration(t);
  assert.equal(t.tests.length, 1);
  assert.equal(t.tests[0].gen, 5);
  assert.ok(t.tests[0].passed >= 0 && t.tests[0].passed <= 20);
});

test('Lehrplan: der Beste der Vorgeneration muss sich auf neuen Strecken bewähren', () => {
  const t = createTrainer({ seed: 1 });
  let prev = 0;
  let steps = 0;
  for (let i = 0; i < 25; i++) {
    const s = runGeneration(t);
    assert.equal(s.difficulty, prev); // difficulty the generation was driven at
    if (i === 0) assert.equal(s.eliteClean, null); // no previous champion yet
    else assert.ok(Number.isInteger(s.eliteClean) && s.eliteClean >= 0 && s.eliteClean <= 3);
    const expected = s.eliteClean !== null && s.eliteClean >= 2 ? Math.min(1, Math.round((prev + 0.1) * 10) / 10) : prev;
    assert.equal(t.difficulty, expected);
    if (t.difficulty > prev) steps++;
    assert.ok(t.difficulty >= prev); // never falls
    prev = t.difficulty;
  }
  assert.ok(steps >= 1, 'in 25 Generationen stieg die Schwierigkeit nie');
});

test('evo.rate und evo.sigma von außen gelten ab der nächsten Generation', () => {
  const a = small(), b = small();
  runGeneration(a); runGeneration(b);
  b.evo.rate = 0; b.evo.sigma = 0;
  runGeneration(a); runGeneration(b);
  runGeneration(a); runGeneration(b);
  assert.notDeepEqual(a.history[2], b.history[2]);
});

test('es wird gelernt', () => {
  const t = createTrainer({ seed: 1 });
  for (let i = 0; i < 30; i++) runGeneration(t);
  const first = t.history[0].best;
  const peak = Math.max(...t.history.map((h) => h.best));
  // Speed alone does not keep rising, because the tracks get harder as the cars get better.
  assert.ok(t.difficulty >= 0.3, `difficulty ${t.difficulty}`);
  assert.ok(peak >= 2 * first, `best ${first} -> peak ${peak}`);
  assert.ok(t.tests.at(-1).passed > t.tests[0].passed, `tests ${t.tests.map((x) => x.passed)}`);
});

test('proven: das Auto mit dem besten Testergebnis bleibt erhalten', () => {
  const t = small();
  assert.equal(t.proven, null);
  for (let i = 0; i < 4; i++) runGeneration(t);
  assert.equal(t.proven, null); // no test yet
  let bestSoFar = -1;
  for (let i = 4; i < 20; i++) {
    runGeneration(t);
    if (t.gen % 5 !== 0) continue;
    const latest = t.tests.at(-1);
    if (latest.passed >= bestSoFar) {
      bestSoFar = latest.passed;
      assert.equal(t.proven.gen, latest.gen);
      assert.deepEqual(bytes(t.proven.genome), bytes(t.champion));
    }
    assert.equal(t.proven.passed, bestSoFar);
    assert.equal(runTest(t.proven.genome, t).passed, t.proven.passed);
  }
});

test('proven übersteht Speichern und Laden', () => {
  const t = small();
  for (let i = 0; i < 5; i++) runGeneration(t);
  const r = restoreTrainer(JSON.parse(JSON.stringify(serialize(t))));
  assert.equal(r.proven.gen, t.proven.gen);
  assert.equal(r.proven.passed, t.proven.passed);
  assert.deepEqual(bytes(r.proven.genome), bytes(t.proven.genome));
  const broken = { ...serialize(t), proven: { gen: 5, passed: 3, genome: '###' } };
  assert.equal(restoreTrainer(broken), null);
});

test('Kontrollsatz: 100 Strecken, die weder Training noch Auswahl je sehen', () => {
  const tracks = validationTracks();
  assert.equal(tracks.length, 100);
  assert.equal(validationTracks(), tracks);
  const testSeeds = new Set(Array.from({ length: 20 }, (_, i) => testTrackSeed(i)));
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const seed = validationTrackSeed(i);
    assert.ok(seed >= 0x80000000, 'höchstes Bit gesetzt: nie eine Trainingsstrecke');
    assert.ok(!testSeeds.has(seed), 'nicht im Testsatz');
    assert.ok(!seen.has(seed));
    seen.add(seed);
  }
  for (const t of tracks) assert.deepEqual(validateTrack(t), { ok: true });
  assert.equal(tracks[0].halfWidth, 9);
  assert.equal(tracks[99].halfWidth, 5.5);
});

test('runTest fährt auf Wunsch einen anderen Streckensatz', () => {
  const t = small();
  const few = validationTracks().slice(0, 7);
  const r = runTest(t.genomes[0], t, few);
  assert.equal(r.perTrack.length, 7);
  assert.equal(runTest(t.genomes[0], t).perTrack.length, 20);
});

test('Regelsatz fahren trägt Kriterium und Fahrzeit', () => {
  assert.equal(RULES_FAHREN.tracksPerGen, 3);
  assert.deepEqual(RULES_FAHREN.raceSeconds, [45, 45]);
  assert.equal(RULES_FAHREN.endurance, null);
  assert.equal(RULES_FAHREN.strategy, null);
  const track = { length: 1200 };
  assert.equal(RULES_FAHREN.clean({ endReason: 'zeit', progress: 600 }, track), true);
  assert.equal(RULES_FAHREN.clean({ endReason: 'zeit', progress: 599 }, track), false);
  assert.equal(RULES_FAHREN.clean({ endReason: 'wand', progress: 900 }, track), false);
});

test('Fahrzeit der Generation steht im Trainer und in der Statistik', () => {
  const t = small();
  assert.equal(t.raceSeconds, 45);
  const s = runGeneration(t);
  assert.equal(s.seconds, 45);
  assert.equal(t.raceSeconds, 45);
});

test('alter gespeicherter Stand ohne neue Felder lädt und läuft identisch weiter', () => {
  const a = small(), b = small();
  for (let i = 0; i < 4; i++) runGeneration(a);
  runGeneration(b); runGeneration(b);
  const old = JSON.parse(JSON.stringify(serialize(b)));
  for (const h of old.history) delete h.seconds; // as saved before stage 2
  const restored = restoreTrainer(old);
  assert.ok(restored);
  runGeneration(restored); runGeneration(restored);
  assert.deepEqual(restored.history.slice(2), a.history.slice(2));
  assert.deepEqual(bytes(restored.champion), bytes(a.champion));
});

test('ruleSet kennt fahren, unbekannte id ergibt undefined', () => {
  assert.equal(ruleSet('fahren'), RULES_FAHREN);
  assert.equal(ruleSet('gibt-es-nicht'), undefined);
  assert.equal(ruleSet('toString'), undefined);
});
