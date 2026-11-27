// Car physics: power-limited drive, drag, and a friction circle that the
// longitudinal and lateral tyre forces share. Exceed it and the car slides.

const G = 9.81;

/** SI units. `drag` multiplies v^2, `brake` and `traction` are shares of the grip. */
export const CAR = {
  mass: 1000,
  power: 300000,
  drag: 0.6,
  rolling: 150,
  grip: 1.4,
  brake: 1.0,
  traction: 0.7,
  wheelbase: 2.6,
  maxSteer: 0.5,
  steerRate: 2.5,
  overdrive: 1.3,
};

/** vx is along the car, vy across it (positive to the left). */
export function createCar(pose) {
  return { x: pose.x, y: pose.y, heading: pose.heading, vx: 0, vy: 0, steer: 0 };
}

/**
 * Largest steering angle at this speed. It allows asking for `overdrive` times
 * the available grip, so a car can be overdriven into a slide but not spun on the spot.
 */
export function steerLimit(speed, spec) {
  if (speed < 1) return spec.maxSteer;
  const a = Math.atan((spec.wheelbase * spec.overdrive * spec.grip * G) / (speed * speed));
  return a < spec.maxSteer ? a : spec.maxSteer;
}

function command(v) {
  if (!(v > -1)) return v === v ? -1 : 0; // NaN -> 0, <= -1 -> -1
  return v > 1 ? 1 : v;
}

/** Advances `car` by dt. Commands are in [-1, 1]; throttle < 0 brakes. */
export function stepCar(car, steerCmd, throttleCmd, spec, dt) {
  const steerIn = command(steerCmd);
  const throttle = command(throttleCmd);
  const aMax = spec.grip * G;

  // Steering follows the command at a limited rate and never exceeds the speed limit.
  const limit = steerLimit(Math.hypot(car.vx, car.vy), spec);
  const target = steerIn * limit;
  const maxDelta = spec.steerRate * dt;
  let delta = target - car.steer;
  if (delta > maxDelta) delta = maxDelta; else if (delta < -maxDelta) delta = -maxDelta;
  let steer = car.steer + delta;
  if (steer > limit) steer = limit; else if (steer < -limit) steer = -limit;
  car.steer = steer;

  // Longitudinal tyre force (as acceleration).
  let aLong;
  if (throttle >= 0) {
    const drive = spec.power / (car.vx > 5 ? car.vx : 5) / spec.mass;
    const cap = spec.traction * aMax;
    aLong = throttle * (drive < cap ? drive : cap);
  } else {
    aLong = throttle * spec.brake * aMax;
  }
  const resist = car.vx > 0 ? (spec.drag * car.vx * car.vx + spec.rolling) / spec.mass : 0;

  // Friction circle: what the tyres spend lengthwise is missing sideways.
  const latAvail = Math.sqrt(Math.max(0, aMax * aMax - aLong * aLong));

  // The car turns; its velocity keeps pointing where it was going.
  const dTheta = (car.vx / spec.wheelbase) * Math.tan(steer) * dt;
  const c = Math.cos(dTheta), s = Math.sin(dTheta);
  let vx = car.vx * c + car.vy * s;
  let vy = -car.vx * s + car.vy * c;
  const heading = car.heading + dTheta;

  // Tyres pull the sideways motion back, as far as the remaining grip allows.
  const maxDv = latAvail * dt;
  if (vy > maxDv) vy -= maxDv; else if (vy < -maxDv) vy += maxDv; else vy = 0;

  vx += (aLong - resist) * dt;
  if (vx < 0) vx = 0; // no reversing

  const ch = Math.cos(heading), sh = Math.sin(heading);
  car.x += (vx * ch - vy * sh) * dt;
  car.y += (vx * sh + vy * ch) * dt;
  car.heading = heading;
  car.vx = vx;
  car.vy = vy;
}
