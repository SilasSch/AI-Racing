import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, createCar, stepCar, steerLimit } from '../src/core/car.js';

const DT = 1 / 30;
const G = 9.81;
const fresh = (vx = 0) => { const c = createCar({ x: 0, y: 0, heading: 0 }); c.vx = vx; return c; };

test('createCar steht still an der Pose', () => {
  assert.deepEqual(createCar({ x: 3, y: 4, heading: 1 }), { x: 3, y: 4, heading: 1, vx: 0, vy: 0, steer: 0, load: 0, energy: 0 });
});

test('Höchsttempo ~79 m/s', () => {
  const c = fresh();
  for (let i = 0; i < 60 * 30; i++) stepCar(c, 0, 1, CAR, DT);
  assert.ok(c.vx > 75 && c.vx < 83, `vx ${c.vx}`);
  assert.ok(Math.abs(c.y) < 1e-6 && c.x > 3000);
});

test('Bremsweg aus 60 m/s', () => {
  const c = fresh(60);
  let steps = 0;
  while (c.vx > 0 && steps < 3000) { stepCar(c, 0, -1, CAR, DT); assert.ok(c.vx >= 0); steps++; }
  assert.equal(c.vx, 0);
  assert.ok(c.x > 105 && c.x < 150, `Weg ${c.x}`);
});

test('ohne Gas rollt das Auto aus und fährt nie rückwärts', () => {
  const c = fresh(20);
  for (let i = 0; i < 300 * 30; i++) stepCar(c, 0, 0, CAR, DT);
  assert.ok(c.vx >= 0 && c.vx < 0.5, `vx ${c.vx}`);
});

test('Lenkgrenze sinkt mit dem Tempo', () => {
  assert.equal(steerLimit(0, CAR), CAR.maxSteer);
  assert.equal(steerLimit(5, CAR), CAR.maxSteer);
  const fast = steerLimit(60, CAR);
  assert.ok(Math.abs(fast - Math.atan((CAR.wheelbase * CAR.overdrive * CAR.grip * G) / 3600)) < 1e-9);
  assert.ok(fast < steerLimit(30, CAR));
});

test('Lenkwinkel ändert sich nur mit begrenzter Rate', () => {
  const c = fresh(5);
  stepCar(c, 1, 0, CAR, DT);
  assert.ok(Math.abs(c.steer - CAR.steerRate * DT) < 1e-9);
});

test('langsame Kurve folgt der Lenkgeometrie', () => {
  const c = fresh(10);
  for (let i = 0; i < 30; i++) { c.vx = 10; stepCar(c, 0.5, 0, CAR, DT); } // settle steering
  const h0 = c.heading; let dist = 0;
  for (let i = 0; i < 60; i++) {
    c.vx = 10;
    const x = c.x, y = c.y;
    stepCar(c, 0.5, 0, CAR, DT);
    dist += Math.hypot(c.x - x, c.y - y);
    assert.ok(Math.abs(c.vy) < 0.3, `vy ${c.vy}`);
  }
  const radius = dist / (c.heading - h0);
  const expected = CAR.wheelbase / Math.tan(c.steer);
  assert.ok(c.steer > 0.15);
  assert.ok(Math.abs(radius - expected) / expected < 0.1, `radius ${radius} vs ${expected}`);
});

test('zu schnell in die Kurve rutscht', () => {
  const c = fresh(60);
  let px = c.x, py = c.y, pdir = 0, turned = 0, dist = 0;
  for (let i = 0; i < 30; i++) {
    stepCar(c, 1, 0, CAR, DT);
    const dir = Math.atan2(c.y - py, c.x - px);
    if (i > 0) turned += dir - pdir;
    dist += Math.hypot(c.x - px, c.y - py);
    pdir = dir; px = c.x; py = c.y;
  }
  assert.ok(Math.abs(c.vy) > 1, `vy ${c.vy}`);
  const speed = Math.hypot(c.vx, c.vy);
  const pathRadius = dist / Math.abs(turned);
  assert.ok(pathRadius > (speed * speed) / (CAR.grip * G) * 0.95, `radius ${pathRadius}`);
});

test('Bremsen in der Kurve kostet Seitenführung', () => {
  const run = (throttle) => {
    const c = fresh(40); let worst = 0;
    for (let i = 0; i < 30; i++) { stepCar(c, 0.7, throttle, CAR, DT); worst = Math.max(worst, Math.abs(c.vy)); }
    return worst;
  };
  const coasting = run(0), braking = run(-1);
  assert.ok(coasting < 0.5, `coasting ${coasting}`);
  assert.ok(braking > coasting + 1, `braking ${braking}`);
});

test('Vollgas lässt Seitenführung übrig', () => {
  const c = fresh(15);
  for (let i = 0; i < 30; i++) stepCar(c, 0.5, 1, CAR, DT);
  assert.ok(Math.abs(c.vy) < 1, `vy ${c.vy}`);
});

test('Stillstand und kaputte Kommandos bleiben endlich', () => {
  const c = createCar({ x: 0, y: 0, heading: 0 });
  for (const [s, t] of [[0, 0], [1, -1], [-1, 1], [NaN, NaN], [Infinity, -Infinity], [5, 5]]) {
    stepCar(c, s, t, CAR, DT);
    for (const k in c) assert.ok(Number.isFinite(c[k]), `${k} nach [${s},${t}]`);
  }
  assert.ok(Math.abs(c.steer) <= CAR.maxSteer);
});

// --- condition of the car: grip factor, power factor, mass ---
const NOMINAL = { grip: 1, power: 1, mass: CAR.mass };
const brakeDistance = (cond) => {
  const c = fresh(60);
  let steps = 0;
  while (c.vx > 0 && steps++ < 5000) stepCar(c, 0, -1, CAR, DT, cond);
  return c.x;
};
const topSpeed = (cond) => {
  const c = fresh();
  for (let i = 0; i < 80 * 30; i++) stepCar(c, 0, 1, CAR, DT, cond);
  return c.vx;
};

test('ohne cond rechnet stepCar wie mit dem Nennzustand', () => {
  const a = fresh(20), b = fresh(20);
  for (let i = 0; i < 300; i++) {
    const steer = Math.sin(i / 17), throttle = Math.cos(i / 29);
    stepCar(a, steer, throttle, CAR, DT);
    stepCar(b, steer, throttle, CAR, DT, NOMINAL);
  }
  for (const k of ['x', 'y', 'heading', 'vx', 'vy', 'steer']) assert.equal(a[k], b[k], k);
});

test('halbe Haftung: doppelter Bremsweg, kleinere Lenkgrenze', () => {
  const ratio = brakeDistance({ ...NOMINAL, grip: 0.5 }) / brakeDistance(NOMINAL);
  assert.ok(ratio > 1.7 && ratio < 2.1, `ratio ${ratio}`);
  assert.ok(steerLimit(40, CAR, 0.5) < steerLimit(40, CAR));
  assert.equal(steerLimit(40, CAR, 1), steerLimit(40, CAR));
});

test('weniger Leistung senkt das Höchsttempo', () => {
  const ratio = topSpeed({ ...NOMINAL, power: 0.7 }) / topSpeed(NOMINAL);
  assert.ok(ratio > 0.86 && ratio < 0.92, `ratio ${ratio}`);
});

test('keine Leistung: das Auto rollt nur noch aus', () => {
  const c = fresh(30);
  for (let i = 0; i < 60; i++) stepCar(c, 0, 1, CAR, DT, { ...NOMINAL, power: 0 });
  assert.ok(c.vx < 30);
  assert.equal(c.energy, 0);
});

test('mehr Masse beschleunigt langsamer', () => {
  const run = (mass) => { const c = fresh(30); for (let i = 0; i < 150; i++) stepCar(c, 0, 1, CAR, DT, { ...NOMINAL, mass }); return c.vx; };
  assert.ok(run(1150) < run(1000) - 0.5);
});

test('load und energy melden, was die Reifen und der Motor gerade leisten', () => {
  const still = fresh();
  stepCar(still, 0, 0, CAR, DT);
  assert.equal(still.load, 0);
  assert.equal(still.energy, 0);

  const gas = fresh(40);
  stepCar(gas, 0, 1, CAR, DT);
  assert.ok(Math.abs(gas.energy - CAR.power * DT) < CAR.power * DT * 0.02, `energy ${gas.energy}`);
  assert.ok(gas.load > 0.3 && gas.load < 0.7);

  const coast = fresh(40);
  stepCar(coast, 0, 0, CAR, DT);
  assert.equal(coast.energy, 0);

  const brake = fresh(40);
  stepCar(brake, 0, -1, CAR, DT);
  assert.equal(brake.energy, 0);
  assert.ok(Math.abs(brake.load - 1) < 0.01, `load ${brake.load}`);

  const slide = fresh(60);
  for (let i = 0; i < 15; i++) stepCar(slide, 1, 0, CAR, DT);
  assert.ok(slide.load > 0.99, `load ${slide.load}`);
});
