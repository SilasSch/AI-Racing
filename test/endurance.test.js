import test from 'node:test';
import assert from 'node:assert/strict';
import { ENDURANCE as E, createCondition, tyreGrip, carCondition, wearAndBurn, hitWall } from '../src/core/endurance.js';
import { CAR, createCar } from '../src/core/car.js';
import { buildTrack, wallDistance } from '../src/core/track.js';
import { kreis, near } from './helpers.js';

const track = buildTrack(kreis(100, 24), 8);
const RADIUS = 1;

test('neuer Zustand: voller Tank, frische Reifen, kein Schaden, volles Tempo', () => {
  assert.deepEqual(createCondition(E), { fuel: E.tank, wear: 0, damage: 0, pace: 1 });
});

test('Reifenkurve: 1, am Knick 0.94, bei 1 der Boden, darüber konstant, monoton fallend', () => {
  assert.equal(tyreGrip(0, E), 1);
  near(tyreGrip(E.cliff, E), E.gripWorn, 1e-9);
  near(tyreGrip(1, E), E.gripFloor, 1e-9);
  assert.equal(tyreGrip(1.7, E), E.gripFloor);
  let prev = 2;
  for (let w = 0; w <= 1.5; w += 0.01) { const g = tyreGrip(w, E); assert.ok(g <= prev + 1e-12); prev = g; }
  assert.ok(tyreGrip(0.9, E) < tyreGrip(0.75, E) - 0.1, 'hinter dem Knick fällt es steil');
});

test('carCondition: voller Tank wiegt, Schaden kostet Haftung und Leistung', () => {
  const cond = createCondition(E);
  const out = carCondition(cond, CAR, E, {});
  assert.deepEqual(out, { grip: 1, power: 1, mass: CAR.mass + E.tank });
  cond.damage = 0.5; cond.wear = E.cliff; cond.fuel = 10;
  carCondition(cond, CAR, E, out);
  near(out.grip, E.gripWorn * (1 - E.damageGrip * 0.5), 1e-9);
  near(out.power, 1 - E.damagePower * 0.5, 1e-9);
  assert.equal(out.mass, CAR.mass + 10);
});

test('leerer Tank heißt keine Leistung', () => {
  const cond = createCondition(E); cond.fuel = 0;
  assert.equal(carCondition(cond, CAR, E, {}).power, 0);
});

test('Tempovorgabe 0 senkt die Leistung auf minPower und den Verbrauch überproportional', () => {
  const full = createCondition(E), eco = createCondition(E);
  eco.pace = 0;
  near(carCondition(eco, CAR, E, {}).power, E.minPower, 1e-9);
  const car = createCar({ x: 0, y: 0, heading: 0 });
  car.energy = 1e6; car.load = 0;
  wearAndBurn(full, car, E, 1 / 30);
  wearAndBurn(eco, car, E, 1 / 30);
  const idle = E.idle / 30; // the engine burns this much just for running
  const burnFull = E.tank - full.fuel - idle, burnEco = E.tank - eco.fuel - idle;
  near(burnFull, E.burn * 1e6, 1e-6);
  near(burnEco / burnFull, 1 - E.paceBurn, 1e-6);
});

test('Leerlauf verbraucht auch: selbst ohne Motorarbeit reicht ein Tank nicht ewig', () => {
  const cond = createCondition(E);
  const car = createCar({ x: 0, y: 0, heading: 0 });
  for (let i = 0; i < 300; i++) wearAndBurn(cond, car, E, 1 / 30);
  near(E.tank - cond.fuel, E.idle * 10, 1e-6);
  assert.ok(E.tank / E.idle < 400, 'ein Tank im Leerlauf muss kürzer halten als das längste Rennen');
});

test('Verschleiß wächst mit der Last und beim Rutschen schneller', () => {
  const run = (load, vy) => {
    const cond = createCondition(E);
    const car = createCar({ x: 0, y: 0, heading: 0 });
    car.load = load; car.vy = vy;
    for (let i = 0; i < 300; i++) wearAndBurn(cond, car, E, 1 / 30);
    return cond.wear;
  };
  const idle = run(0, 0), cornering = run(1, 0), sliding = run(1, 6);
  near(idle, E.wearBase * 10, 1e-9);
  assert.ok(cornering > idle * 2);
  assert.ok(sliding > cornering * 1.3);
});

test('Sprit wird nie negativ, Werte bleiben endlich', () => {
  const cond = createCondition(E); cond.fuel = 0.001;
  const car = createCar({ x: 0, y: 0, heading: 0 });
  car.energy = 1e9; car.load = 1.5; car.vy = 30;
  for (let i = 0; i < 1e4; i++) wearAndBurn(cond, car, E, 1 / 30);
  assert.equal(cond.fuel, 0);
  assert.ok(Number.isFinite(cond.wear) && cond.wear > 1);
  assert.ok(tyreGrip(cond.wear, E) === E.gripFloor);
});

/** Car on the centerline at (100, 0), moving with `speed` at `angle` from the outward normal. */
function crash(speed, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const car = createCar({ x: 100, y: 0, heading: a });
  car.vx = speed;
  const cond = createCondition(E);
  let hit = false, guard = 0;
  while (!hit && guard++ < 400) {
    car.x += Math.cos(car.heading) * car.vx / 30;
    car.y += Math.sin(car.heading) * car.vx / 30;
    hit = hitWall(cond, car, track, RADIUS, E);
  }
  return { car, cond, hit };
}

test('Wandtreffer: Auto ist danach wieder auf der Fahrbahn, langsamer, mit Schaden', () => {
  const { car, cond, hit } = crash(30, 0);
  assert.equal(hit, true);
  assert.ok(wallDistance(track, car.x, car.y) > RADIUS, 'wieder auf der Fahrbahn');
  assert.ok(Math.hypot(car.vx, car.vy) < 20, `Tempo ${Math.hypot(car.vx, car.vy)}`);
  near(cond.damage, E.damageBase + E.damagePerSpeed * 30, 0.05);
});

test('Streifen kostet wenig, Frontalaufprall viel', () => {
  const head = crash(30, 0).cond.damage;
  const graze = crash(30, 80).cond.damage;
  assert.ok(graze < head * 0.5, `graze ${graze} head ${head}`);
  assert.ok(graze >= E.damageBase);
});

test('nach dem Streifen fährt das Auto weiter entlang der Wand', () => {
  const { car } = crash(30, 80);
  assert.ok(Math.hypot(car.vx, car.vy) > 10);
});

test('kein Treffer, kein Schaden', () => {
  const car = createCar({ x: 100, y: 0, heading: Math.PI / 2 });
  car.vx = 20;
  const cond = createCondition(E);
  assert.equal(hitWall(cond, car, track, RADIUS, E), false);
  assert.equal(cond.damage, 0);
  assert.equal(car.vx, 20);
});

test('Schaden wird nie größer als 1', () => {
  const { car, cond } = crash(79, 0);
  for (let i = 0; i < 20; i++) { car.x = 107.5; car.y = 0; car.vx = 79; car.vy = 0; car.heading = 0; hitWall(cond, car, track, RADIUS, E); }
  assert.equal(cond.damage, 1);
  for (const k of ['x', 'y', 'vx', 'vy', 'heading']) assert.ok(Number.isFinite(car[k]));
});
