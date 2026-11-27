// Trainer: runs generations, raises the difficulty, and measures the champion
// on test tracks that training never uses.
import { createRng, hashSeed, normalizeSeed } from './rng.js';
import { genomeLength, randomGenome } from './net.js';
import { generateTrack } from './generator.js';
import { CAR } from './car.js';
import { RULES_FAHREN } from './rules.js';
import { createWorld, stepWorld, runToEnd } from './world.js';
import { EVO_DEFAULTS, nextGeneration } from './evolution.js';

export const TRACKS_PER_GEN = 3;
export const TEST_EVERY = 5;
export const TEST_COUNT = 20;
export const CLEAN_DISTANCE = 600; // metres a clean run must cover
export const DIFFICULTY_STEP = 0.1;
export const CLEAN_NEEDED = 2; // of TRACKS_PER_GEN: the majority
const VERSION = 1;
const RULE_SETS = { [RULES_FAHREN.id]: RULES_FAHREN };

/** Training track seeds never have the top bit set ... */
export function trainingTrackSeed(seed, gen, k) {
  return hashSeed(1, seed, gen, k) & 0x7fffffff;
}

/** ... and test track seeds always do, so the two sets cannot overlap. */
export function testTrackSeed(i) {
  return (hashSeed(2, i) | 0x80000000) >>> 0;
}

let cachedTestTracks = null;

/** The 20 fixed test tracks, easiest to hardest. Independent of any trainer seed. */
export function testTracks() {
  if (!cachedTestTracks) {
    cachedTestTracks = [];
    for (let i = 0; i < TEST_COUNT; i++) {
      cachedTestTracks.push(generateTrack(testTrackSeed(i), i / (TEST_COUNT - 1)));
    }
  }
  return cachedTestTracks;
}

function startTrack(trainer) {
  const seed = trainingTrackSeed(trainer.seed, trainer.gen, trainer.trackIndex);
  const track = generateTrack(seed, trainer.difficulty);
  trainer.world = createWorld(track, trainer.rules, trainer.spec, trainer.sizes, trainer.genomes);
}

function resetAccumulators(trainer) {
  trainer.trackIndex = 0;
  trainer.distance = new Float64Array(trainer.genomes.length);
  trainer.cleanRuns = new Uint8Array(trainer.genomes.length);
}

/**
 * @param {{seed?:unknown, rules?:object, spec?:object, hidden?:number[], evo?:object}} [opts]
 */
export function createTrainer(opts = {}) {
  const rules = opts.rules ?? RULES_FAHREN;
  const evo = { ...EVO_DEFAULTS, ...(opts.evo ?? {}) };
  const seed = normalizeSeed(opts.seed ?? 1);
  const sizes = [rules.channels.length, ...(opts.hidden ?? [16, 16]), 2];
  const rng = createRng(hashSeed(3, seed));
  const genomes = [];
  for (let i = 0; i < evo.popSize; i++) genomes.push(randomGenome(sizes, rng));
  const trainer = {
    seed, rules, spec: opts.spec ?? CAR, sizes, evo, rng,
    gen: 0, // generations completed
    difficulty: 0,
    trackIndex: 0,
    world: null,
    genomes,
    champion: null,
    history: [],
    tests: [],
    proven: null, // { genome, passed, gen }: the champion with the best test result so far
    distance: null,
    cleanRuns: null,
  };
  resetAccumulators(trainer);
  startTrack(trainer);
  return trainer;
}

function finishTrack(trainer) {
  const cars = trainer.world.cars;
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (car.progress > 0) trainer.distance[i] += car.progress;
    if (car.endReason === 'zeit' && car.progress >= CLEAN_DISTANCE) trainer.cleanRuns[i]++;
  }
  trainer.trackIndex++;
}

function finishGeneration(trainer) {
  const count = trainer.genomes.length;
  const seconds = trainer.rules.episodeSeconds;
  const fitness = new Array(count);
  let best = 0, sum = 0;
  for (let i = 0; i < count; i++) {
    fitness[i] = trainer.distance[i] / TRACKS_PER_GEN;
    sum += fitness[i];
    if (fitness[i] > fitness[best]) best = i;
  }
  trainer.gen++;
  // Slot 0 holds the previous generation's champion, unchanged. How it does on this
  // generation's fresh tracks is an honest measure; the best of 60 on the very tracks
  // it was picked on is not, because some car always gets lucky.
  const hasElite = trainer.gen > 1 && trainer.evo.elites > 0;
  const stats = {
    gen: trainer.gen,
    best: fitness[best] / seconds, // average speed in m/s
    mean: sum / count / seconds,
    difficulty: trainer.difficulty, // difficulty this generation was driven at
    clean: trainer.cleanRuns[best], // clean runs of this generation's best car
    eliteClean: hasElite ? trainer.cleanRuns[0] : null, // clean runs of the previous champion
  };
  trainer.history.push(stats);
  trainer.champion = Float32Array.from(trainer.genomes[best]);

  if (stats.eliteClean !== null && stats.eliteClean >= CLEAN_NEEDED) {
    trainer.difficulty = Math.min(1, Math.round((trainer.difficulty + DIFFICULTY_STEP) * 10) / 10);
  }
  if (trainer.gen % TEST_EVERY === 0) {
    const result = runTest(trainer.champion, trainer);
    trainer.tests.push({ gen: trainer.gen, passed: result.passed, meanSpeed: result.meanSpeed });
    // Champions come and go with their luck on three tracks. Keep the one that proved
    // itself best on the test tracks; on a tie the later one wins.
    if (!trainer.proven || result.passed >= trainer.proven.passed) {
      trainer.proven = { genome: Float32Array.from(trainer.champion), passed: result.passed, gen: trainer.gen };
    }
  }
  trainer.genomes = nextGeneration(trainer.genomes, fitness, trainer.evo, trainer.rng);
  resetAccumulators(trainer);
  return stats;
}

/**
 * Advances training by at most `maxSteps` simulation steps.
 * Stops early at the end of a generation, so one call never spans two generations.
 * @returns {boolean} true if a generation was completed during this call
 */
export function advance(trainer, maxSteps) {
  let left = maxSteps;
  while (left > 0) {
    if (!trainer.world.done) {
      stepWorld(trainer.world);
      left--;
    }
    if (trainer.world.done) {
      finishTrack(trainer);
      const generationDone = trainer.trackIndex >= TRACKS_PER_GEN;
      if (generationDone) finishGeneration(trainer);
      startTrack(trainer);
      if (generationDone) return true;
    }
  }
  return false;
}

/** Runs the current generation to its end and returns its statistics. */
export function runGeneration(trainer) {
  while (!advance(trainer, 4096)) { /* keep going */ }
  return trainer.history[trainer.history.length - 1];
}

/**
 * Measures `genome` on the test tracks, in two ways per track:
 * a lap attempt (ok = full lap without touching a wall), and the same measure
 * training uses (distance in the fixed episode time), so the two curves compare.
 * @returns {{passed:number, meanSpeed:number, perTrack:{ok:boolean,reason:string,speed:number}[]}}
 */
export function runTest(genome, trainer) {
  const perTrack = [];
  let passed = 0, speedSum = 0;
  for (const track of testTracks()) {
    const lap = createWorld(track, trainer.rules, trainer.spec, trainer.sizes, [genome], { untilLap: true });
    runToEnd(lap);
    const timed = createWorld(track, trainer.rules, trainer.spec, trainer.sizes, [genome]);
    runToEnd(timed);
    const speed = Math.max(0, timed.cars[0].progress) / trainer.rules.episodeSeconds;
    const ok = lap.cars[0].endReason === 'runde';
    if (ok) passed++;
    speedSum += speed;
    perTrack.push({ ok, reason: lap.cars[0].endReason, speed });
  }
  return { passed, meanSpeed: speedSum / perTrack.length, perTrack };
}

function encode(genome) {
  const bytes = new Uint8Array(genome.buffer, genome.byteOffset, genome.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(text, length) {
  if (typeof text !== 'string') return null;
  const binary = atob(text);
  if (binary.length !== length * 4) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const genome = new Float32Array(bytes.buffer);
  for (let i = 0; i < genome.length; i++) if (!Number.isFinite(genome[i])) return null;
  return genome;
}

/**
 * JSON-safe snapshot. A snapshot taken in the middle of a generation resumes
 * at the beginning of that generation.
 */
export function serialize(trainer) {
  return {
    version: VERSION,
    rules: trainer.rules.id,
    spec: { ...trainer.spec },
    seed: trainer.seed,
    sizes: [...trainer.sizes],
    evo: { ...trainer.evo },
    rngState: trainer.rng.state,
    gen: trainer.gen,
    difficulty: trainer.difficulty,
    genomes: trainer.genomes.map(encode),
    champion: trainer.champion ? encode(trainer.champion) : null,
    history: trainer.history.map((h) => ({ ...h })),
    tests: trainer.tests.map((t) => ({ ...t })),
    proven: trainer.proven
      ? { genome: encode(trainer.proven.genome), passed: trainer.proven.passed, gen: trainer.proven.gen }
      : null,
  };
}

const isCount = (v) => Number.isInteger(v) && v >= 0;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** @returns a trainer, or null if the data is from another version or damaged. Never throws. */
export function restoreTrainer(data) {
  try {
    if (!data || typeof data !== 'object' || data.version !== VERSION) return null;
    const rules = RULE_SETS[data.rules];
    if (!rules) return null;
    const { sizes, evo, spec } = data;
    if (!Array.isArray(sizes) || sizes.length < 2 || !sizes.every((s) => Number.isInteger(s) && s > 0)) return null;
    if (sizes[0] !== rules.channels.length || sizes[sizes.length - 1] !== 2) return null;
    if (!evo || typeof evo !== 'object' || !spec || typeof spec !== 'object') return null;
    for (const key of Object.keys(EVO_DEFAULTS)) if (!isNumber(evo[key])) return null;
    for (const key of Object.keys(CAR)) if (!isNumber(spec[key])) return null;
    if (!isCount(data.seed) || !isCount(data.gen) || !isCount(data.rngState)) return null;
    if (!isNumber(data.difficulty) || data.difficulty < 0 || data.difficulty > 1) return null;
    if (!Array.isArray(data.history) || !Array.isArray(data.tests)) return null;
    if (!Array.isArray(data.genomes) || data.genomes.length !== evo.popSize || evo.popSize < 1) return null;

    const length = genomeLength(sizes);
    const genomes = [];
    for (const text of data.genomes) {
      const genome = decode(text, length);
      if (!genome) return null;
      genomes.push(genome);
    }
    let champion = null;
    if (data.champion !== null) {
      champion = decode(data.champion, length);
      if (!champion) return null;
    }
    let proven = null;
    if (data.proven !== null && data.proven !== undefined) {
      const genome = decode(data.proven.genome, length);
      if (!genome || !isCount(data.proven.passed) || !isCount(data.proven.gen)) return null;
      proven = { genome, passed: data.proven.passed, gen: data.proven.gen };
    }
    const rng = createRng(0);
    rng.state = data.rngState;
    const trainer = {
      seed: data.seed, rules, spec: { ...spec }, sizes: [...sizes], evo: { ...evo }, rng,
      gen: data.gen,
      difficulty: data.difficulty,
      trackIndex: 0,
      world: null,
      genomes,
      champion,
      history: data.history.map((h) => ({ ...h })),
      tests: data.tests.map((t) => ({ ...t })),
      proven,
      distance: null,
      cleanRuns: null,
    };
    resetAccumulators(trainer);
    startTrack(trainer);
    return trainer;
  } catch {
    return null;
  }
}
