// Rule sets. The simulation core takes its rules from here instead of hard-coding them,
// so later stages (endurance, teams) can add their own set.

import { ENDURANCE } from './endurance.js';
import { STRATEGY_SIZES } from './strategy.js';

export const DT = 1 / 30; // seconds per simulation step

const RAY_ANGLES = [-90, -55, -30, -12, 0, 12, 30, 55, 90];

/** Stage 1: learn to drive. Touching a wall ends the run. */
export const RULES_FAHREN = {
  id: 'fahren',
  wallContact: 'fatal',
  tracksPerGen: 3,
  episodeSeconds: 45,
  raceSeconds: [45, 45], // [min, max]; a generation draws its driving time from this range
  // A clean run: the car lasted the whole time and covered real ground.
  clean: (car) => car.endReason === 'zeit' && car.progress >= 600,
  endurance: null, // no wear, fuel or damage in this rule set
  strategy: null, // no second net
  lapTimeout: 120,
  stall: { seconds: 3, minProgress: 5 },
  rayRange: 150,
  carRadius: 1,
  // What the driver net sees. Only things a car could measure itself.
  channels: [
    ...RAY_ANGLES.map((angle) => ({ type: 'ray', angle })),
    { type: 'speed' },
    { type: 'slip' },
    { type: 'steer' },
  ],
};

/**
 * Stage 2: endurance. Tyres wear, fuel burns and weighs, walls leave damage instead of
 * ending the run, and a second net decides once per lap about the pit stop.
 */
export const RULES_AUSDAUER = {
  id: 'ausdauer',
  wallContact: 'damage',
  tracksPerGen: 3,
  raceSeconds: [200, 320],
  lapTimeout: 150,
  stall: { seconds: 4, minProgress: 5 },
  rayRange: 150,
  carRadius: 1,
  channels: [
    ...RULES_FAHREN.channels,
    { type: 'grip' }, // current grip factor: tyres and damage
    { type: 'fuel' }, // fuel on board as a share of the tank
    { type: 'pace' }, // pace the strategy net asked for
  ],
  endurance: ENDURANCE,
  // decideBefore: metres before the line at which the strategy net decides
  strategy: { sizes: STRATEGY_SIZES, decideBefore: 80 },
  // seconds: drive-through loss, per kg of fuel, tyre change, repair of full damage
  pit: { base: 14, perKg: 0.06, tyres: 6, perDamage: 20, exitSpeed: 15 },
  // A clean race: still running at the end, with at least one full lap.
  clean: (car, track) => car.endReason === 'zeit' && car.progress >= track.length,
};

/** Driving time of a world when nothing else is asked for: the middle of the range. */
export function defaultSeconds(rules) {
  return (rules.raceSeconds[0] + rules.raceSeconds[1]) / 2;
}
