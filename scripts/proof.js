// Learning proof: does a typical run reach 16 of 20 unseen tracks within 150 generations?
// usage: node scripts/proof.js [--seeds 10] [--gens 150] [--first 1]
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createTrainer, runGeneration, runTest, validationTracks } from '../src/core/trainer.js';

const NEEDED = 16;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

if (process.send) {
  // child: one seed
  process.on('message', ({ seed, gens }) => {
    const trainer = createTrainer({ seed });
    const t0 = Date.now();
    let passedAt = null, bestPassed = 0;
    while (trainer.gen < gens && passedAt === null) {
      runGeneration(trainer);
      const test = trainer.tests.at(-1);
      if (test && test.gen === trainer.gen) {
        bestPassed = Math.max(bestPassed, test.passed);
        if (test.passed >= NEEDED) passedAt = trainer.gen;
      }
    }
    // The car that passed was picked because of its test result, so that result flatters it.
    // The control set was used for nothing, which makes this number an honest one.
    const control = passedAt === null ? null : runTest(trainer.champion, trainer, validationTracks()).passed;
    process.send({ seed, passedAt, bestPassed, control, difficulty: trainer.difficulty, gens: trainer.gen, seconds: (Date.now() - t0) / 1000 });
    process.exit(0);
  });
} else {
  const seeds = arg('seeds', 10), gens = arg('gens', 150), first = arg('first', 1);
  const queue = Array.from({ length: seeds }, (_, i) => first + i);
  const results = [];
  const workers = Math.max(1, Math.min(os.availableParallelism?.() ?? 2, seeds));
  await new Promise((resolve) => {
    let running = 0;
    const launch = () => {
      if (!queue.length) { if (!running) resolve(); return; }
      const seed = queue.shift();
      running++;
      const child = fork(fileURLToPath(import.meta.url));
      child.on('message', (r) => results.push(r));
      child.on('exit', () => { running--; launch(); });
      child.send({ seed, gens });
    };
    for (let i = 0; i < workers; i++) launch();
  });
  results.sort((a, b) => a.seed - b.seed);
  console.log(`Lernnachweis: mindestens ${NEEDED} von 20 unbekannten Strecken innerhalb von ${gens} Generationen\n`);
  console.log('Seed | bestanden in Generation | Testsatz (20) | Kontrollsatz (100) | Schwierigkeit am Ende | Rechenzeit');
  console.log('-----|-------------------------|---------------|--------------------|-----------------------|-----------');
  for (const r of results) {
    const when = r.passedAt === null ? 'nicht bestanden' : String(r.passedAt);
    const control = r.control === null ? '-' : `${r.control}/100`;
    console.log(`${String(r.seed).padStart(4)} | ${when.padEnd(23)} | ${`${r.bestPassed}/20`.padEnd(13)} | ${control.padEnd(18)} | ${String(r.difficulty).padEnd(21)} | ${r.seconds.toFixed(0)} s`);
  }
  const measured = results.filter((r) => r.control !== null);
  if (measured.length) {
    const mean = measured.reduce((sum, r) => sum + r.control, 0) / measured.length;
    const worst = Math.min(...measured.map((r) => r.control));
    console.log(`\nKontrollsatz: Das Auto, das den Test als erstes bestand, schafft im Mittel ${mean.toFixed(0)} von 100 Strecken, die weder Training noch Auswahl je gesehen haben (schlechtester Startwert: ${worst}).`);
  }
  const passed = results.filter((r) => r.passedAt !== null).length;
  const needed = Math.ceil(seeds * 0.8);
  console.log(`${passed} von ${seeds} Startwerten bestanden (gefordert: ${needed}).`);
  process.exit(passed >= needed ? 0 : 1);
}
