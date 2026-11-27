// The second net ("pit radio"). It decides once per lap: pit or stay out,
// how much fuel, new tyres or not, and how hard to push.
import { forward } from './net.js';

export const STRATEGY_SIZES = [7, 8, 4];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * What the strategy net sees. Nothing about the track, only the state of car and race.
 * @param {{fuelShare:number, wear:number, damage:number, timeLeftShare:number, lapsOfFuel:number, lastLapRatio:number}} race
 *   lapsOfFuel: laps the fuel lasts at the last lap's consumption (NaN while unknown);
 *   lastLapRatio: last lap time divided by the best lap time (NaN before the first lap)
 */
export function strategyInput(race, out) {
  out[0] = clamp(race.fuelShare, 0, 1);
  out[1] = clamp(race.wear, 0, 1);
  out[2] = clamp(race.damage, 0, 1);
  out[3] = clamp(race.timeLeftShare, 0, 1);
  out[4] = Number.isFinite(race.lapsOfFuel) ? clamp(race.lapsOfFuel / 5, 0, 1) : 1;
  out[5] = Number.isFinite(race.lastLapRatio) ? clamp(race.lastLapRatio - 1, -1, 1) : 0;
  out[6] = 1;
}

/**
 * Runs the strategy net that sits in `genome` from `offset` on.
 * @returns {{box:boolean, fuelTarget:number, tyres:boolean, pace:number}}
 *   fuelTarget: fill level to refuel to, as a share of the tank; pace in [0, 1]
 */
export function decide(genome, offset, input, scratch) {
  const o = forward(genome, STRATEGY_SIZES, input, scratch, offset);
  return { box: o[0] > 0, fuelTarget: (o[1] + 1) / 2, tyres: o[2] > 0, pace: (o[3] + 1) / 2 };
}
