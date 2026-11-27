import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, createCar, stepCar, steerLimit } from '../src/core/car.js';

const DT = 1 / 30;
const G = 9.81;
const fresh = (vx = 0) => { const c = createCar({ x: 0, y: 0, heading: 0 }); c.vx = vx; return c; };

test('createCar steht still an der Pose', () => {
  assert.deepEqual(createCar({ x: 3, y: 4, heading: 1 }), { x: 3, y: 4, heading: 1, vx: 0, vy: 0, steer: 0 });
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
