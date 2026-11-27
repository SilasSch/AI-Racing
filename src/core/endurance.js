// What makes a race long: tyres wear, fuel burns and weighs, walls leave damage.
import { wallDistance } from './track.js';

/**
 * Rates calibrated against how trained cars really drive (docs/stufe-2-nachweis.md):
 * they use about 25 kW of 300 and a lap takes 50 to 90 s. At full pace a tank lasts about
 * 100 s, in economy about twice that but much slower, so every race needs a stop.
 * Tyres reach the cliff after about 220 s.
 */
export const ENDURANCE = {
  tank: 110, // kg of fuel when full
  idle: 0.36, // kg per second just for running the engine
  burn: 3e-5, // kg per joule of engine work
  paceBurn: 0.1, // at pace 0 a joule costs this much less fuel
  minPower: 0.06, // engine power at pace 0, as a share of full power
  wearBase: 0.0016, // tyre wear per second just for rolling
  wearLoad: 0.009, // extra wear per second at full tyre load
  wearSlip: 0.001, // extra wear per second per m/s of sideways sliding
  cliff: 0.75, // wear at which the grip starts to fall steeply
  gripWorn: 0.94, // grip factor at the cliff
  gripFloor: 0.6, // grip factor of a finished tyre
  damageBase: 0.02, // damage of any wall contact
  damagePerSpeed: 0.012, // damage per m/s of impact speed
  damageGrip: 0.3, // grip lost at full damage
  damagePower: 0.4, // power lost at full damage
  bounce: 0.6, // share of the speed along the wall that survives a contact
};

/** Condition of a car at the start: full tank, fresh tyres, no damage, full pace. */
export function createCondition(e) {
  return { fuel: e.tank, wear: 0, damage: 0, pace: 1 };
}

/** Grip factor of a tyre: falls slowly up to the cliff, then steeply, then stays at the floor. */
export function tyreGrip(wear, e) {
  if (wear <= 0) return 1;
  if (wear <= e.cliff) return 1 - ((1 - e.gripWorn) * wear) / e.cliff;
  if (wear >= 1) return e.gripFloor;
  return e.gripWorn - ((e.gripWorn - e.gripFloor) * (wear - e.cliff)) / (1 - e.cliff);
}

/** Fills `out` with what stepCar needs: grip factor, power factor, mass. */
export function carCondition(cond, spec, e, out) {
  out.grip = tyreGrip(cond.wear, e) * (1 - e.damageGrip * cond.damage);
  out.power = cond.fuel > 0 ? (e.minPower + (1 - e.minPower) * cond.pace) * (1 - e.damagePower * cond.damage) : 0;
  out.mass = spec.mass + cond.fuel;
  return out;
}

/** Applies one step of tyre wear and fuel burn, from what the car just did. */
export function wearAndBurn(cond, car, e, dt) {
  const slip = car.vy < 0 ? -car.vy : car.vy;
  cond.wear += (e.wearBase + e.wearLoad * car.load * car.load + e.wearSlip * slip) * dt;
  const fuel = cond.fuel - e.idle * dt - e.burn * car.energy * (1 - e.paceBurn * (1 - cond.pace));
  cond.fuel = fuel > 0 ? fuel : 0;
}

/**
 * Wall contact as damage instead of the end of the run. If the car is in the wall,
 * it is pushed back onto the road, loses the speed towards the wall and part of the rest,
 * and takes damage by how hard it hit.
 * @returns {boolean} whether the car touched the wall
 */
export function hitWall(cond, car, track, radius, e) {
  const d = wallDistance(track, car.x, car.y);
  if (d > radius) return false;

  // Direction back onto the road: uphill on the wall-distance field.
  let gx = wallDistance(track, car.x + 1, car.y) - wallDistance(track, car.x - 1, car.y);
  let gy = wallDistance(track, car.x, car.y + 1) - wallDistance(track, car.x, car.y - 1);
  const ch = Math.cos(car.heading), sh = Math.sin(car.heading);
  let vx = car.vx * ch - car.vy * sh;
  let vy = car.vx * sh + car.vy * ch;
  let g = Math.hypot(gx, gy);
  if (g < 1e-6) { gx = -vx; gy = -vy; g = Math.hypot(gx, gy); } // flat field: go back where it came from
  if (g < 1e-6) { gx = 1; gy = 0; g = 1; }
  gx /= g; gy /= g;

  const towards = -(vx * gx + vy * gy); // speed into the wall
  if (towards > 0) {
    vx += towards * gx;
    vy += towards * gy;
    vx *= e.bounce;
    vy *= e.bounce;
    const damage = cond.damage + e.damageBase + e.damagePerSpeed * towards;
    cond.damage = damage < 1 ? damage : 1;
  }
  const push = radius - d + 0.2;
  car.x += gx * push;
  car.y += gy * push;

  // What is left of the motion runs along the wall; the car straightens into it.
  const speed = Math.hypot(vx, vy);
  if (speed > 2) {
    car.heading = Math.atan2(vy, vx);
    car.vx = speed;
    car.vy = 0;
  } else {
    car.vx = 0;
    car.vy = 0;
  }
  return true;
}

/**
 * Seconds a pit stop takes: the drive-through, then fuel by the amount added,
 * then tyres if asked for, then repair by the damage. One after the other.
 */
export function pitDuration(cond, decision, rules) {
  const pit = rules.pit;
  const added = decision.fuelTarget * rules.endurance.tank - cond.fuel;
  return pit.base + pit.perKg * (added > 0 ? added : 0) + (decision.tyres ? pit.tyres : 0) + pit.perDamage * cond.damage;
}
