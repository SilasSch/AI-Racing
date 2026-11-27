// Many cars on one track. They share the track but never affect each other.
import { DT } from './rules.js';
import { sense } from './sensors.js';
import { forward, createScratch } from './net.js';
import { createCar, stepCar } from './car.js';
import { locate, wallDistance } from './track.js';

/**
 * @param {object} track
 * @param {object} rules rule set, e.g. RULES_FAHREN
 * @param {object} spec car spec, e.g. CAR
 * @param {number[]} sizes layer sizes of the driver net
 * @param {Float32Array[]} genomes one car per genome
 * @param {{untilLap?: boolean}} [opts] untilLap: a car's run ends after its first full lap
 */
export function createWorld(track, rules, spec, sizes, genomes, opts = {}) {
  const cars = genomes.map((genome) => ({
    state: createCar(track.start),
    genome,
    alive: true,
    endReason: null, // 'wand' | 'stillstand' | 'zeit' | 'runde'
    progress: 0, // metres along the centerline since the start; negative when driving backwards
    time: 0,
    steps: 0,
    index: track.start.index,
    stallMark: 0,
    input: new Float32Array(sizes[0]),
    scratch: createScratch(sizes),
  }));
  return {
    track, rules, spec, sizes, cars,
    untilLap: Boolean(opts.untilLap),
    time: 0,
    steps: 0,
    done: cars.length === 0,
    spacing: track.length / track.n,
    stallSteps: Math.round(rules.stall.seconds / DT),
    maxSteps: Math.round((opts.untilLap ? rules.lapTimeout : rules.episodeSeconds) / DT),
  };
}

function end(car, reason) {
  car.alive = false;
  car.endReason = reason;
}

/** Advances every living car by one DT. */
export function stepWorld(world) {
  if (world.done) return;
  const { track, rules, spec, sizes, cars, spacing } = world;
  const n = track.n;
  const half = n >> 1;
  let alive = 0;
  for (let k = 0; k < cars.length; k++) {
    const car = cars[k];
    if (!car.alive) continue;
    const state = car.state;

    sense(track, state, rules, spec, car.input);
    const out = forward(car.genome, sizes, car.input, car.scratch);
    stepCar(state, out[0], out[1], spec, DT);

    const index = locate(track, state.x, state.y, car.index);
    let delta = index - car.index;
    if (delta > half) delta -= n; else if (delta < -half) delta += n;
    car.progress += delta * spacing;
    car.index = index;
    car.steps++;
    car.time = car.steps * DT;

    if (wallDistance(track, state.x, state.y) <= rules.carRadius) {
      end(car, 'wand');
    } else if (world.untilLap && car.progress >= track.length) {
      end(car, 'runde');
    } else if (car.steps >= world.maxSteps) {
      end(car, 'zeit');
    } else if (car.steps % world.stallSteps === 0) {
      if (car.progress - car.stallMark < rules.stall.minProgress) end(car, 'stillstand');
      car.stallMark = car.progress;
    }
    if (car.alive) alive++;
  }
  world.steps++;
  world.time = world.steps * DT;
  if (alive === 0) world.done = true;
}

export function runToEnd(world) {
  while (!world.done) stepWorld(world);
}
