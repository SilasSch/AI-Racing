// Many cars on one track. They share the track but never affect each other.
import { DT, defaultSeconds } from './rules.js';
import { sense } from './sensors.js';
import { forward, createScratch } from './net.js';
import { createCar, stepCar } from './car.js';
import { locate, wallDistance } from './track.js';
import { genomeLength } from './net.js';
import { createCondition, carCondition, wearAndBurn, hitWall, pitDuration } from './endurance.js';
import { strategyInput, decide } from './strategy.js';

/** Length of a genome under `rules`: the driver net, plus the strategy net if the rules have one. */
export function genomeLengthFor(rules, sizes) {
  return genomeLength(sizes) + (rules.strategy ? genomeLength(rules.strategy.sizes) : 0);
}

/**
 * @param {object} track
 * @param {object} rules rule set, e.g. RULES_FAHREN
 * @param {object} spec car spec, e.g. CAR
 * @param {number[]} sizes layer sizes of the driver net
 * @param {Float32Array[]} genomes one car per genome
 * @param {{untilLap?: boolean, seconds?: number}} [opts] untilLap: a car's run ends after its
 *   first full lap; seconds: driving time, instead of the rule set's default
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
  if (rules.endurance) {
    const offset = genomeLength(sizes);
    for (const car of cars) {
      car.cond = createCondition(rules.endurance);
      car.factors = { grip: 1, power: 1, mass: spec.mass };
      car.laps = 0;
      car.lapStart = 0; // time the running lap began
      car.lastLap = NaN; // seconds
      car.bestLap = NaN;
      car.fuelAtLapStart = car.cond.fuel;
      car.fuelPerLap = NaN; // kg burned in the last lap
      car.decision = null; // last answer of the strategy net
      car.decisions = 0;
      car.nextDecision = track.length - rules.strategy.decideBefore; // progress at which it decides next
      car.pit = null; // { left, fuel, tyres } while standing in the pit
      car.stops = 0;
      car.pitTime = 0; // seconds spent in the pit in total
      car.stints = [{ start: 0, end: null }];
      car.stallAt = Math.round(rules.stall.seconds / DT);
      car.strategyOffset = offset;
      car.strategyInput = new Float32Array(rules.strategy.sizes[0]);
      car.strategyScratch = createScratch(rules.strategy.sizes);
    }
  }
  return {
    track, rules, spec, sizes, cars,
    untilLap: Boolean(opts.untilLap),
    time: 0,
    steps: 0,
    done: cars.length === 0,
    spacing: track.length / track.n,
    stallSteps: Math.round(rules.stall.seconds / DT),
    maxSteps: Math.round((opts.untilLap ? rules.lapTimeout : opts.seconds ?? defaultSeconds(rules)) / DT),
  };
}

function end(car, reason) {
  car.alive = false;
  car.endReason = reason;
}

/** Asks the strategy net. The pace it names applies at once; the pit call applies at the line. */
function consultStrategy(world, car) {
  const { rules } = world;
  const tank = rules.endurance.tank;
  const left = (world.maxSteps - car.steps) * DT;
  strategyInput({
    fuelShare: car.cond.fuel / tank,
    wear: car.cond.wear,
    damage: car.cond.damage,
    timeLeftShare: left / rules.raceSeconds[1],
    lapsOfFuel: car.fuelPerLap > 0 ? car.cond.fuel / car.fuelPerLap : NaN,
    lastLapRatio: car.lastLap / car.bestLap,
  }, car.strategyInput);
  car.decision = decide(car.genome, car.strategyOffset, car.strategyInput, car.strategyScratch);
  car.decisions++;
  car.cond.pace = car.decision.pace;
}

function parkAtStart(world, car, speed) {
  const start = world.track.start;
  const state = car.state;
  state.x = start.x;
  state.y = start.y;
  state.heading = start.heading;
  state.vx = speed;
  state.vy = 0;
  state.steer = 0;
  car.index = start.index;
}

function enterPit(world, car) {
  const { rules } = world;
  const duration = pitDuration(car.cond, car.decision, rules);
  car.pit = { left: duration, fuel: car.decision.fuelTarget * rules.endurance.tank, tyres: car.decision.tyres };
  car.stops++;
  car.pitTime += duration;
  car.stints[car.stints.length - 1].end = car.time;
  parkAtStart(world, car, 0);
}

function leavePit(world, car) {
  const cond = car.cond;
  if (car.pit.fuel > cond.fuel) cond.fuel = car.pit.fuel;
  if (car.pit.tyres) cond.wear = 0;
  cond.damage = 0;
  car.pit = null;
  car.fuelAtLapStart = cond.fuel;
  car.stints.push({ start: car.time, end: null });
  car.stallMark = car.progress;
  car.stallAt = car.steps + world.stallSteps;
  parkAtStart(world, car, world.rules.pit.exitSpeed);
}

/** One DT for every living car under an endurance rule set. */
function stepEndurance(world) {
  const { track, rules, spec, sizes, cars, spacing } = world;
  const e = rules.endurance;
  const n = track.n;
  const half = n >> 1;
  const length = track.length;
  let alive = 0;
  for (let k = 0; k < cars.length; k++) {
    const car = cars[k];
    if (!car.alive) continue;

    if (car.pit) {
      // Standing in the pit: only time passes.
      car.steps++;
      car.time = car.steps * DT;
      car.pit.left -= DT;
      if (car.steps >= world.maxSteps) end(car, 'zeit');
      else if (car.pit.left <= 0) leavePit(world, car);
      if (car.alive) alive++;
      continue;
    }

    if (car.decision === null) consultStrategy(world, car); // once at the start
    const state = car.state;
    carCondition(car.cond, spec, e, car.factors);
    sense(track, state, rules, spec, car.input, car.cond, car.factors);
    const out = forward(car.genome, sizes, car.input, car.scratch);
    stepCar(state, out[0], out[1], spec, DT, car.factors);
    wearAndBurn(car.cond, state, e, DT);
    hitWall(car.cond, state, track, rules.carRadius, e);

    const index = locate(track, state.x, state.y, car.index);
    let delta = index - car.index;
    if (delta > half) delta -= n; else if (delta < -half) delta += n;
    car.progress += delta * spacing;
    car.index = index;
    car.steps++;
    car.time = car.steps * DT;

    if (car.cond.damage >= 1) {
      end(car, 'schaden');
    } else if (world.untilLap && car.progress >= length) {
      end(car, 'runde');
    } else if (car.steps >= world.maxSteps) {
      end(car, 'zeit');
    } else if (car.steps >= car.stallAt) {
      if (car.progress - car.stallMark < rules.stall.minProgress) end(car, car.cond.fuel <= 0 ? 'sprit' : 'stillstand');
      car.stallMark = car.progress;
      car.stallAt = car.steps + world.stallSteps;
    }
    if (!car.alive) continue;
    alive++;

    if (car.progress >= car.nextDecision) {
      consultStrategy(world, car);
      car.nextDecision += length;
    }
    if (car.progress >= (car.laps + 1) * length) {
      car.laps++;
      car.lastLap = car.time - car.lapStart;
      if (!(car.bestLap <= car.lastLap)) car.bestLap = car.lastLap;
      const burned = car.fuelAtLapStart - car.cond.fuel;
      if (burned > 0) car.fuelPerLap = burned;
      car.lapStart = car.time;
      car.fuelAtLapStart = car.cond.fuel;
      if (car.decision.box) enterPit(world, car);
    }
  }
  world.steps++;
  world.time = world.steps * DT;
  if (alive === 0) world.done = true;
}

/** Advances every living car by one DT. */
export function stepWorld(world) {
  if (world.done) return;
  if (world.rules.endurance) { stepEndurance(world); return; }
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
