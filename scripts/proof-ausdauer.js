// Stage 2 proof. For each seed: 60 generations of "fahren", then endurance from those drivers.
// Every 5th generation the best car drives one fresh race on a control track. It passes when
//   (a) it is still running at the end,  (b) it made at least one pit stop, and
//   (c) the same driver with the strategy "never pit" runs out of fuel.
// It also measures whether the learned strategy is any good, against fixed strategies with
// the same driver and the same pace. Those exist only in this script.
// usage: node scripts/proof-ausdauer.js [--seeds 6] [--gens 80] [--first 1]
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createTrainer, runGeneration, validationTracks } from '../src/core/trainer.js';
import { RULES_AUSDAUER } from '../src/core/rules.js';
import { createWorld, stepWorld } from '../src/core/world.js';

const FAHREN_GENS = 60;
const CHECK_TRACK = 50; // control track of medium difficulty
const CHECK_SECONDS = 320; // middle of the race length range
const COMPARE_TRACKS = [20, 35, 50, 65, 80, 95];
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

// Comparison strategies. They take over the pit decision right after the learned net has
// spoken and leave its pace untouched: an evolved driver has only ever seen the pace its own
// strategy net asks for, and judging it at another pace would judge the driver, not the strategy.
const STRATEGIES = {
  learned: null,
  never: () => ({ box: false }),
  everyLap: () => ({ box: true, fuelTarget: 1, tyres: true }),
  // as late as possible: pit when the fuel will not last another lap and a bit; tyres past 60 % wear
  late: (car, rules) => {
    const laps = car.fuelPerLap > 0 ? car.cond.fuel / car.fuelPerLap : car.cond.fuel / rules.endurance.tank > 0.5 ? 9 : 0;
    return { box: laps < 1.3, fuelTarget: 1, tyres: car.cond.wear > 0.6 };
  },
};

function raceOnce(genome, trainer, trackIndex, seconds, strategy = null) {
  const track = validationTracks()[trackIndex];
  const world = createWorld(track, trainer.rules, trainer.spec, trainer.sizes, [genome], { seconds });
  const car = world.cars[0];
  let seen = 0;
  while (!world.done) {
    stepWorld(world);
    if (strategy && car.decisions !== seen) {
      seen = car.decisions;
      Object.assign(car.decision, strategy(car, trainer.rules));
    }
  }
  return car;
}
const stintLengths = (car) => car.stints.map((s) => Math.round((s.end ?? car.time) - s.start));
function meanDistance(genome, trainer, strategy) {
  let sum = 0;
  for (const i of COMPARE_TRACKS) sum += Math.max(0, raceOnce(genome, trainer, i, CHECK_SECONDS, strategy).progress);
  return sum / COMPARE_TRACKS.length;
}

if (process.send) {
  process.on('message', ({ seed, gens }) => {
    const t0 = Date.now();
    const fahren = createTrainer({ seed });
    while (fahren.gen < FAHREN_GENS) runGeneration(fahren);
    const trainer = createTrainer({ seed, rules: RULES_AUSDAUER, drivers: { genomes: fahren.genomes, sizes: fahren.sizes, difficulty: fahren.difficulty } });
    let passedAt = null, passing = null, early = null;
    const reasons = {};
    while (trainer.gen < gens) {
      runGeneration(trainer);
      if (trainer.gen % 5 !== 0) continue;
      const car = raceOnce(trainer.champion, trainer, CHECK_TRACK, CHECK_SECONDS);
      if (trainer.gen === 5) early = { distance: car.progress, stops: car.stops, reason: car.endReason };
      reasons[car.endReason] = (reasons[car.endReason] ?? 0) + 1;
      if (passedAt !== null) continue;
      if (car.endReason !== 'zeit' || car.stops < 1) continue;
      const dry = raceOnce(trainer.champion, trainer, CHECK_TRACK, CHECK_SECONDS, STRATEGIES.never);
      if (dry.endReason !== 'sprit') continue;
      passedAt = trainer.gen;
      passing = { distance: car.progress, stops: car.stops, stints: stintLengths(car), genome: trainer.champion };
    }
    const final = trainer.champion;
    const compare = {};
    for (const [name, strategy] of Object.entries(STRATEGIES)) compare[name] = meanDistance(final, trainer, strategy);
    const last = trainer.history.at(-1);
    process.send({
      seed, passedAt, early, reasons, compare,
      passing: passing && { distance: passing.distance, stops: passing.stops, stints: passing.stints },
      lastStops: last.stops, lastKmh: last.best * 3.6, difficulty: trainer.difficulty,
      seconds: (Date.now() - t0) / 1000,
    });
    process.exit(0);
  });
} else {
  const seeds = arg('seeds', 6), gens = arg('gens', 80), first = arg('first', 1);
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
  const m = (v) => `${Math.round(v)} m`;
  console.log(`Nachweis Ausdauer: bis zu ${gens} Generationen, aufbauend auf ${FAHREN_GENS} Generationen "Fahren lernen"`);
  console.log(`Prüfrennen: Kontrollstrecke ${CHECK_TRACK}, ${CHECK_SECONDS} s. Bestanden heißt: Rennen beendet, mindestens ein Stopp, und ohne Box wäre der Tank leer.\n`);
  console.log('Seed | bestanden in Gen. | Stopps | Stints (s)        | Distanz  | Gen. 5: Distanz, Ende | Rechenzeit');
  console.log('-----|-------------------|--------|-------------------|----------|-----------------------|-----------');
  for (const r of results) {
    const p = r.passing;
    console.log([
      String(r.seed).padStart(4),
      (r.passedAt === null ? 'nicht bestanden' : String(r.passedAt)).padEnd(17),
      (p ? String(p.stops) : '-').padEnd(6),
      (p ? p.stints.join(' / ') : '-').padEnd(17),
      (p ? m(p.distance) : '-').padEnd(8),
      (r.early ? `${m(r.early.distance)}, ${r.early.reason}` : '-').padEnd(21),
      `${r.seconds.toFixed(0)} s`,
    ].join(' | '));
  }
  console.log(`\nIst die gelernte Strategie gut? Mittlere Distanz des letzten besten Autos auf ${COMPARE_TRACKS.length} Kontrollstrecken, ${CHECK_SECONDS} s,`);
  console.log('gegen feste Vergleichsstrategien mit demselben Fahrer und demselben Tempo:\n');
  console.log('Seed | gelernt  | jede Runde Box | so spät wie möglich | nie Box  | Stopps je Rennen (Training)');
  console.log('-----|----------|----------------|---------------------|----------|----------------------------');
  let wins = 0;
  for (const r of results) {
    const c = r.compare;
    if (c.learned >= c.late) wins++;
    console.log(`${String(r.seed).padStart(4)} | ${m(c.learned).padEnd(8)} | ${m(c.everyLap).padEnd(14)} | ${m(c.late).padEnd(19)} | ${m(c.never).padEnd(8)} | ${r.lastStops.toFixed(1)}`);
  }
  const passed = results.filter((r) => r.passedAt !== null).length;
  const needed = Math.ceil((seeds * 2) / 3);
  console.log(`\nGelernte Strategie mindestens so gut wie "so spät wie möglich": bei ${wins} von ${seeds} Startwerten.`);
  console.log(`${passed} von ${seeds} Startwerten bestanden (gefordert: ${needed}).`);
  process.exit(passed >= needed ? 0 : 1);
}
