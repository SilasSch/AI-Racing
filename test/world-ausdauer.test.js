import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, RULES_AUSDAUER, RULES_FAHREN } from '../src/core/rules.js';
import { sense } from '../src/core/sensors.js';
import { createWorld, stepWorld, runToEnd, genomeLengthFor } from '../src/core/world.js';
import { ENDURANCE, createCondition, pitDuration } from '../src/core/endurance.js';
import { STRATEGY_SIZES } from '../src/core/strategy.js';
import { buildTrack } from '../src/core/track.js';
import { CAR, createCar } from '../src/core/car.js';
import { genomeLength, randomGenome } from '../src/core/net.js';
import { createRng } from '../src/core/rng.js';
import { kreis, near } from './helpers.js';

const track = buildTrack(kreis(100, 24), 8);
const sizes = [RULES_AUSDAUER.channels.length, 4, 2];
// The slow circle driver uses about 1.9 kW; this burn rate empties the tank in about 100 s.
const THIRSTY = { ...ENDURANCE, burn: 5.7e-4 };
const rules = (over = {}) => ({
  ...RULES_AUSDAUER,
  endurance: over.endurance ?? THIRSTY,
  pit: { ...RULES_AUSDAUER.pit, exitSpeed: 9, ...(over.pit ?? {}) },
});

/** Driver with constant outputs plus a strategy net with constant outputs. */
function genome(steer, throttle, strategy) {
  const driver = genomeLength(sizes);
  const g = new Float32Array(driver + genomeLength(STRATEGY_SIZES));
  g[driver - 1] = Math.atanh(throttle);
  g[driver - 1 - (sizes[1] + 1)] = Math.atanh(steer);
  const hidden = STRATEGY_SIZES[1];
  const outStart = driver + (STRATEGY_SIZES[0] + 1) * hidden;
  strategy.forEach((v, i) => { g[outStart + i * (hidden + 1) + hidden] = Math.atanh(v); });
  return g;
}
const NEVER = [-0.9, 0.99, -0.9, 0.999]; // stay out, full pace
const ALWAYS = [0.9, 0.999, 0.9, 0.999]; // pit every lap, fill up, new tyres, full pace
const STEER = 0.052; // holds the 100 m circle at 9 m/s

function race(strategy, opts = {}, over = {}) {
  const w = createWorld(track, rules(over), CAR, sizes, [genome(STEER, 0.02, strategy)], opts);
  w.cars[0].state.vx = 9;
  return w;
}

test('Regelsatz ausdauer: 15 Kanäle, Wandkontakt als Schaden, Strategie-Netz', () => {
  assert.equal(RULES_AUSDAUER.id, 'ausdauer');
  assert.equal(RULES_AUSDAUER.channels.length, 15);
  assert.deepEqual(RULES_AUSDAUER.channels.slice(12).map((c) => c.type), ['grip', 'fuel', 'pace']);
  assert.deepEqual(RULES_AUSDAUER.channels.slice(0, 12), RULES_FAHREN.channels);
  assert.equal(RULES_AUSDAUER.wallContact, 'damage');
  assert.deepEqual(RULES_AUSDAUER.raceSeconds, [400, 560]);
  assert.deepEqual(RULES_AUSDAUER.strategy.sizes, STRATEGY_SIZES);
  assert.equal(RULES_AUSDAUER.clean({ endReason: 'zeit', progress: 700 }, { length: 628 }), true);
  assert.equal(RULES_AUSDAUER.clean({ endReason: 'zeit', progress: 600 }, { length: 628 }), false);
  assert.equal(RULES_AUSDAUER.clean({ endReason: 'sprit', progress: 900 }, { length: 628 }), false);
});

test('Genomlänge: Fahrer plus Strategie, im Modus fahren nur der Fahrer', () => {
  assert.equal(genomeLengthFor(RULES_AUSDAUER, sizes), genomeLength(sizes) + genomeLength(STRATEGY_SIZES));
  assert.equal(genomeLengthFor(RULES_FAHREN, [12, 16, 16, 2]), 514);
});

test('sense liefert Haftung, Tankanteil, Tempovorgabe', () => {
  const car = createCar(track.start);
  const out = new Float32Array(15);
  const cond = createCondition(ENDURANCE);
  cond.fuel = ENDURANCE.tank / 4; cond.pace = 0.6;
  sense(track, car, RULES_AUSDAUER, CAR, out, cond, { grip: 0.8, power: 1, mass: 1000 });
  near(out[12], 0.8, 1e-6); near(out[13], 0.25, 1e-6); near(out[14], 0.6, 1e-6);
  sense(track, car, RULES_AUSDAUER, CAR, out);
  assert.deepEqual([out[12], out[13], out[14]], [1, 0, 1]);
});

test('leerer Tank ist sofort Ausfall: kein Ausrollen, keine Rettung in der Box', () => {
  const w = race(NEVER, { seconds: 320 });
  const c = w.cars[0];
  let before = null;
  while (!w.done) { before = { fuel: c.cond.fuel, progress: c.progress }; stepWorld(w); }
  assert.equal(c.endReason, 'sprit');
  assert.equal(c.cond.fuel, 0);
  assert.ok(before.fuel > 0, 'im Schritt davor war noch Sprit da');
  assert.ok(c.progress - before.progress < 1, 'kein Ausrollen nach dem letzten Tropfen');
  assert.equal(c.stops, 0);
  assert.ok(c.time > 60 && c.time < 160, `time ${c.time}`);
});

test('Tank leer kurz vor der Linie trotz Boxenwunsch: kein Service, Ausfall', () => {
  const w = race(ALWAYS, { seconds: 320 });
  const c = w.cars[0];
  // let it decide to pit, then leave it with fuel for only a few more seconds
  while (c.progress < track.length - 60) stepWorld(w);
  assert.equal(c.decision.box, true);
  c.cond.fuel = 0.002;
  runToEnd(w);
  assert.equal(c.endReason, 'sprit');
  assert.equal(c.stops, 0);
  assert.equal(c.pit, null);
  assert.ok(c.progress < track.length);
});

test('kein Tank reicht für das kürzeste Rennen, auch nicht im Leerlauf', () => {
  const e = RULES_AUSDAUER.endurance;
  assert.ok(e.tank / e.idle < RULES_AUSDAUER.raceSeconds[0], `${e.tank / e.idle} s gegen ${RULES_AUSDAUER.raceSeconds[0]} s`);
});

test('mit Box in jeder Runde: Stopps, voller Tank, Rennen endet mit der Zeit', () => {
  const w = race(ALWAYS, { seconds: 320 });
  runToEnd(w);
  const c = w.cars[0];
  assert.equal(c.endReason, 'zeit');
  assert.ok(c.stops >= 2, `stops ${c.stops}`);
  assert.equal(c.laps, c.stops);
  assert.ok(c.cond.fuel > 0);
  assert.equal(c.stints.length, c.stops + 1);
  assert.ok(c.pitTime > c.stops * RULES_AUSDAUER.pit.base);
});

test('Stopp dauert so lange wie pitDuration, und das Auto steht dabei', () => {
  const w = race(ALWAYS, { seconds: 320 });
  const c = w.cars[0];
  while (!c.pit && !w.done) stepWorld(w);
  assert.ok(c.pit, 'kein Stopp');
  const expected = c.pit.left;
  const progress = c.progress;
  let steps = 0;
  while (c.pit) { stepWorld(w); steps++; assert.equal(c.progress, progress); assert.equal(c.state.vx, c.pit ? 0 : c.state.vx); }
  near(steps * DT, expected, DT * 1.5);
  assert.equal(c.state.vx, 9); // released at the exit speed
});

test('pitDuration: Grundzeit, Tanken nach Menge, Reifen, Reparatur', () => {
  const r = RULES_AUSDAUER, e = ENDURANCE;
  const cond = { fuel: 10, wear: 0.5, damage: 0.5, pace: 1 };
  near(pitDuration(cond, { box: true, fuelTarget: 1, tyres: true, pace: 1 }, r),
    r.pit.base + r.pit.perKg * (e.tank - 10) + r.pit.tyres + r.pit.perDamage * 0.5, 1e-9);
  near(pitDuration({ ...cond, damage: 0 }, { box: true, fuelTarget: 0, tyres: false, pace: 1 }, r), r.pit.base, 1e-9);
});

test('Tankziel unter aktuellem Stand: keine negative Standzeit, Tank bleibt', () => {
  const w = race([0.9, -0.999, -0.9, 0.999], { seconds: 150 });
  const c = w.cars[0];
  while (!c.pit && !w.done) stepWorld(w);
  assert.ok(c.pit);
  near(c.pit.left, RULES_AUSDAUER.pit.base, DT);
  const before = c.cond.fuel;
  while (c.pit) stepWorld(w);
  assert.equal(c.cond.fuel, before);
});

test('Reifenwechsel nur wenn gewählt; Reparatur setzt Schaden zurück', () => {
  const run = (tyres) => {
    const w = race([0.9, 0.999, tyres, 0.999], { seconds: 150 });
    const c = w.cars[0];
    while (!c.pit && !w.done) stepWorld(w);
    c.cond.damage = 0.4;
    const wear = c.cond.wear;
    while (c.pit) stepWorld(w);
    return { c, wear };
  };
  const fresh = run(0.9), kept = run(-0.9);
  assert.ok(fresh.c.cond.wear < 0.001);
  assert.ok(Math.abs(kept.c.cond.wear - kept.wear) < 0.001);
  assert.equal(fresh.c.cond.damage, 0);
  assert.equal(kept.c.cond.damage, 0);
});

test('Entscheidung fällt einmal am Start und einmal pro Runde', () => {
  const frugal = { ...ENDURANCE, idle: 0, burn: 1e-6 }; // a tank that lasts the whole race
  const w = race(NEVER, { seconds: 320 }, { endurance: frugal });
  runToEnd(w);
  const c = w.cars[0];
  assert.equal(c.endReason, 'zeit');
  assert.ok(c.laps >= 3, `laps ${c.laps}`);
  assert.ok(c.decisions === c.laps + 1 || c.decisions === c.laps + 2, `decisions ${c.decisions}, laps ${c.laps}`);
  assert.ok(c.lastLap > 60 && c.lastLap < 95, `lastLap ${c.lastLap}`); // a full tank makes the slow circle a little slower
  assert.ok(c.bestLap <= c.lastLap);
  assert.ok(c.fuelPerLap > 0);
});

test('Tempovorgabe wirkt: pace 0 fährt langsamer und verbraucht weniger', () => {
  const wide = buildTrack(kreis(1000, 60), 40); // almost straight for a few seconds
  const s = [15, 4, 2];
  const run = (pace) => {
    const g = new Float32Array(genomeLength(s) + genomeLength(STRATEGY_SIZES));
    g[genomeLength(s) - 1] = Math.atanh(0.999); // full throttle, no steering
    const hidden = STRATEGY_SIZES[1];
    const outStart = genomeLength(s) + (STRATEGY_SIZES[0] + 1) * hidden;
    [-0.9, 0.9, -0.9, pace].forEach((v, i) => { g[outStart + i * (hidden + 1) + hidden] = Math.atanh(v); });
    const w = createWorld(wide, RULES_AUSDAUER, CAR, s, [g], { seconds: 5 });
    w.cars[0].state.vx = 40;
    runToEnd(w);
    return { distance: w.cars[0].progress, burned: ENDURANCE.tank - w.cars[0].cond.fuel, pace: w.cars[0].cond.pace };
  };
  const full = run(0.999), eco = run(-0.999);
  assert.ok(full.pace > 0.99 && eco.pace < 0.01);
  assert.ok(eco.distance < full.distance - 2, `${eco.distance} vs ${full.distance}`);
  assert.ok(eco.burned < full.burned * 0.6, `${eco.burned} vs ${full.burned}`);
});

test('Wand macht Schaden statt Ende; genug Schaden ist Ausfall', () => {
  const w = createWorld(track, RULES_AUSDAUER, CAR, sizes, [genome(0, 0.999, NEVER)], { seconds: 60 });
  runToEnd(w);
  const c = w.cars[0];
  assert.ok(c.cond.damage > 0, 'kein Schaden');
  assert.ok(['schaden', 'stillstand', 'zeit'].includes(c.endReason), c.endReason);
  assert.notEqual(c.endReason, 'wand');
  const brutal = { ...ENDURANCE, damageBase: 1 };
  const w2 = createWorld(track, { ...RULES_AUSDAUER, endurance: brutal }, CAR, sizes, [genome(0, 0.999, NEVER)], { seconds: 60 });
  runToEnd(w2);
  assert.equal(w2.cars[0].endReason, 'schaden');
  assert.equal(w2.cars[0].cond.damage, 1);
});

test('Zeit läuft während des Stopps ab: Ende mit zeit, Distanz bis zur Einfahrt', () => {
  const probe = race(ALWAYS, { seconds: 320 });
  while (!probe.cars[0].pit) stepWorld(probe);
  const entry = probe.cars[0].time;
  const w = race(ALWAYS, { seconds: entry + 3 });
  runToEnd(w);
  const c = w.cars[0];
  assert.equal(c.endReason, 'zeit');
  assert.ok(c.pit, 'steht noch in der Box');
  near(c.progress, track.length, 3);
});

test('untilLap endet an der Linie ohne Stopp', () => {
  const w = race(ALWAYS, { untilLap: true });
  runToEnd(w);
  const c = w.cars[0];
  assert.equal(c.endReason, 'runde');
  assert.equal(c.stops, 0);
  assert.equal(c.pit, null);
});

test('Autos beeinflussen sich nicht, und gleiche Eingabe gibt gleiches Ergebnis', () => {
  const rng = createRng(21);
  const len = genomeLengthFor(RULES_AUSDAUER, [15, 16, 16, 2]);
  const make = () => { const g = randomGenome([len - 1, 1], rng); return g.slice(0, len); };
  const a = make(), b = make();
  const s = [15, 16, 16, 2];
  const both = createWorld(track, RULES_AUSDAUER, CAR, s, [a, b], { seconds: 60 });
  const alone = createWorld(track, RULES_AUSDAUER, CAR, s, [a], { seconds: 60 });
  const again = createWorld(track, RULES_AUSDAUER, CAR, s, [a], { seconds: 60 });
  runToEnd(both); runToEnd(alone); runToEnd(again);
  assert.equal(both.cars[0].progress, alone.cars[0].progress);
  assert.equal(both.cars[0].endReason, alone.cars[0].endReason);
  assert.deepEqual(alone.cars[0].state, again.cars[0].state);
  assert.deepEqual(alone.cars[0].cond, again.cars[0].cond);
});

test('nie NaN: 200 Zufallsgenome fahren ein Rennen', () => {
  const rng = createRng(33);
  const s = [15, 16, 16, 2];
  const len = genomeLengthFor(RULES_AUSDAUER, s);
  const genomes = Array.from({ length: 200 }, () => { const g = new Float32Array(len); for (let i = 0; i < len; i++) g[i] = rng.normal() * 0.6; return g; });
  const w = createWorld(track, RULES_AUSDAUER, CAR, s, genomes, { seconds: 200 });
  runToEnd(w);
  const reasons = new Set();
  for (const c of w.cars) {
    reasons.add(c.endReason);
    for (const k of ['x', 'y', 'heading', 'vx', 'vy', 'steer']) assert.ok(Number.isFinite(c.state[k]), k);
    assert.ok(c.cond.fuel >= 0 && c.cond.fuel <= ENDURANCE.tank);
    assert.ok(c.cond.damage >= 0 && c.cond.damage <= 1);
    assert.ok(Number.isFinite(c.cond.wear) && Number.isFinite(c.progress));
    assert.ok(c.pitTime >= 0);
  }
  for (const r of reasons) assert.ok(['schaden', 'sprit', 'stillstand', 'zeit'].includes(r), r);
});

test('Welt im Modus fahren kennt keinen Zustand und keine Box', () => {
  const g = new Float32Array(genomeLength([12, 4, 2]));
  const w = createWorld(track, RULES_FAHREN, CAR, [12, 4, 2], [g]);
  assert.equal(w.cars[0].cond, undefined);
  assert.equal(w.cars[0].pit, undefined);
});
