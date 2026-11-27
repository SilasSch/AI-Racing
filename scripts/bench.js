// Measures simulation speed: car-steps per second and time per generation.
import { createTrainer, runGeneration } from '../src/core/trainer.js';
import { generateTrack } from '../src/core/generator.js';
import { createWorld, stepWorld } from '../src/core/world.js';
import { RULES_FAHREN } from '../src/core/rules.js';
import { CAR } from '../src/core/car.js';

// 1) Raw speed: 60 cars that all stay alive (a trained population), fixed number of world steps.
const trainer = createTrainer({ seed: 1 });
for (let i = 0; i < 25; i++) runGeneration(trainer);
const track = generateTrack(1, 0.5);
const genomes = Array.from({ length: 60 }, () => trainer.champion);
let carSteps = 0;
const t0 = performance.now();
for (let round = 0; round < 5; round++) {
  const world = createWorld(track, RULES_FAHREN, CAR, trainer.sizes, genomes);
  for (let i = 0; i < 400 && !world.done; i++) {
    stepWorld(world);
    for (const car of world.cars) if (car.alive) carSteps++;
  }
}
const seconds = (performance.now() - t0) / 1000;
console.log(`car-steps/s: ${Math.round(carSteps / seconds).toLocaleString('en-US')}`);

// 2) Whole generations, as training runs them (generations 26-35 of seed 1).
const g0 = performance.now();
for (let i = 0; i < 10; i++) runGeneration(trainer);
console.log(`ms/Generation: ${Math.round((performance.now() - g0) / 10)} (Generationen 26-35, Schwierigkeit ${trainer.difficulty})`);
