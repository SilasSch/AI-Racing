// Page wiring: the two modes, controls, frame loop, statistics, saving.
import { createTrainer, advance, serialize, restoreTrainer, FREEZE_DRIVER_GENS } from '../core/trainer.js';
import { DT, RULES_FAHREN, RULES_AUSDAUER } from '../core/rules.js';
import { normalizeSeed } from '../core/rng.js';
import { saveState, loadState, clearState } from './storage.js';
import { readTheme, onThemeChange } from './theme.js';
import { createTrackView, leaderOf } from './view-track.js';
import { createNetView } from './view-net.js';
import { createChart } from './view-chart.js';
import { updateGauges } from './gauges.js';
import { initDrawMode } from './draw-mode.js';
import { initProbe } from './probe.js';

const MODES = {
  fahren: {
    key: 'rennlabor:fahren', rules: RULES_FAHREN, name: 'Fahren lernen',
    note: 'Zufallsnetze lernen, eine Strecke zu fahren. Wandkontakt beendet die Fahrt.',
  },
  ausdauer: {
    key: 'rennlabor:ausdauer', rules: RULES_AUSDAUER, name: 'Ausdauer',
    note: 'Reifen, Sprit und Schaden kommen dazu. Ein zweites Netz lernt, wann die Box lohnt.',
  },
};
const MODE_KEY = 'rennlabor:modus';
const MIN_DRIVER_GENS = 20; // generations "fahren" needs before its drivers may start endurance
const SAVE_EVERY_MS = 3000;
const MAX_FRAME_MS = 100; // a stalled tab must not trigger a catch-up race
const SLICE_MS = 12; // simulation budget per frame at "max"
const $ = (id) => document.getElementById(id);
const fmt1 = (v) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });

let theme = readTheme();
const getTheme = () => theme;
const trackView = createTrackView($('cv-track'), getTheme);
const netView = createNetView($('cv-net'), getTheme);
const chart = createChart($('chart'), $('chart-tip'), $('test-table'));

const randomSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;

/** A saved state only counts for the mode it was saved in. */
function loadTrainer(name) {
  const restored = restoreTrainer(loadState(MODES[name].key));
  return restored && restored.rules.id === name ? restored : null;
}

const trainers = {
  fahren: loadTrainer('fahren') ?? createTrainer({ seed: randomSeed() }),
  ausdauer: loadTrainer('ausdauer'), // null until the user chooses how endurance starts
};
let mode = loadState(MODE_KEY) === 'ausdauer' ? 'ausdauer' : 'fahren';
let trainer = trainers[mode];
let running = false;
let speed = '1';
let carry = 0; // simulated seconds not yet turned into steps
let lastFrame = 0;
let lastSave = 0;
let seedTyped = false;
let dirty = true;
let override = null; // a view that temporarily takes over the track canvas (test drive)

/** The car to use for test drives: the one with the best result on unknown tracks. */
export function getChampion() {
  if (!trainer) return null;
  const proven = trainer.proven;
  const genome = proven?.genome ?? trainer.champion;
  if (!genome) return null;
  // Say which car this is. It is usually not the car the "Teststrecken" tile is showing.
  const label = proven
    ? `Auto aus Generation ${proven.gen} (bisher bestes Testergebnis: ${proven.passed} von 20)`
    : `Bestes Auto aus Generation ${trainer.gen} (noch nicht getestet)`;
  return {
    genome, label, modeName: MODES[mode].name,
    sizes: trainer.sizes, rules: trainer.rules, spec: trainer.spec, difficulty: trainer.difficulty,
  };
}

function save() {
  lastSave = performance.now();
  if (trainer) saveState(MODES[mode].key, serialize(trainer));
}

function setRunning(next) {
  running = Boolean(next && trainer);
  const begun = trainer && (trainer.gen > 0 || trainer.world.steps > 0);
  $('btn-start').textContent = running ? 'Pause' : begun ? 'Weiter' : 'Start';
  $('btn-start').disabled = !trainer;
  if (!running) save();
  dirty = true;
}

function setSpeed(next) {
  speed = next;
  for (const s of ['1', '4', '16', 'max']) $(`speed-${s}`).setAttribute('aria-pressed', String(s === speed));
  carry = 0;
}

function updateStats() {
  $('stat-gen').textContent = String(trainer ? trainer.gen : 0);
  const level = Math.round((trainer ? trainer.difficulty : 0) * 10);
  $('stat-diff').textContent = String(level);
  const meter = $('diff-meter');
  if (meter.children.length !== 10) meter.replaceChildren(...Array.from({ length: 10 }, () => document.createElement('i')));
  [...meter.children].forEach((bar, i) => bar.classList.toggle('on', i < level));
  const test = trainer?.tests.at(-1);
  $('stat-test').textContent = test ? String(test.passed) : '–';
  const last = trainer?.history.at(-1);
  $('stat-stops').textContent = last && Number.isFinite(last.stops) ? fmt1(last.stops) : '–';
  $('btn-probe').disabled = !getChampion();
  document.dispatchEvent(new CustomEvent('rennlabor:champion'));
}

function syncInputs() {
  if (!seedTyped) $('seed').value = trainer ? String(trainer.seed) : '';
  const evo = trainer?.evo ?? { rate: 0.1, sigma: 0.15 };
  $('mut-rate').value = String(evo.rate);
  $('mut-sigma').value = String(evo.sigma);
  $('mut-rate').disabled = $('mut-sigma').disabled = !trainer;
  $('mut-rate-value').textContent = `${Math.round(evo.rate * 100)} %`;
  $('mut-sigma-value').textContent = evo.sigma.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** The line beside the mode switch: what this mode is, or which phase of learning runs. */
function modeNote() {
  if (mode === 'ausdauer' && trainer && trainer.freezeGens > 0) {
    return trainer.gen < trainer.freezeGens
      ? `Phase 1 von 2: Nur der Boxenfunk lernt. Der Fahrer ist bis Generation ${trainer.freezeGens} eingefroren, alle Autos fahren gleich.`
      : 'Phase 2 von 2: Fahrer und Boxenfunk lernen gemeinsam.';
  }
  return MODES[mode].note;
}

/** The driver that endurance starts from: the car with the best test result in "fahren". */
function bestDriver() {
  const source = trainers.fahren;
  const genome = source.proven?.genome ?? source.champion;
  if (!genome) return null;
  const which = source.proven
    ? `das Auto mit dem besten Testergebnis aus „Fahren lernen“ (Generation ${source.proven.gen}, ${source.proven.passed} von 20)`
    : `das beste Auto aus Generation ${source.gen} von „Fahren lernen“`;
  return { genome, which, sizes: source.sizes, difficulty: source.difficulty };
}

function onGeneration() {
  updateStats();
  $('mode-note').textContent = modeNote();
  chart.update(trainer.history, trainer.tests, { endurance: mode === 'ausdauer' });
  if (performance.now() - lastSave > SAVE_EVERY_MS) save();
}

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function statusText(world, leader) {
  if (trainer.gen === 0 && world.steps === 0 && !running) {
    return mode === 'ausdauer'
      ? '<strong>60 Autos stehen am Start.</strong> Jedes hat einen Fahrer und einen Boxenfunk, der noch nichts weiß.'
      : '<strong>60 Zufallsnetze stehen am Start.</strong> Nach dem Start scheitern fast alle sofort. Genau daraus wird gelernt.';
  }
  let alive = 0;
  for (const car of world.cars) if (car.alive) alive++;
  const car = leader >= 0 ? world.cars[leader] : null;
  const kmh = car ? Math.round(car.state.vx * 3.6) : 0;
  const head = `Generation <strong>${trainer.gen + 1}</strong> · Strecke ${trainer.trackIndex + 1} von ${trainer.rules.tracksPerGen}`;
  if (mode === 'ausdauer') {
    const lead = car ? ` · Führender: Runde ${car.laps + 1}, ${car.stops} ${car.stops === 1 ? 'Stopp' : 'Stopps'}, ${car.pit ? 'in der Box' : `${kmh} km/h`}` : '';
    return `${head} · Rennzeit ${clock(world.time)} von ${clock(trainer.raceSeconds)} · <strong>${alive}</strong> von ${world.cars.length} im Rennen${lead}`;
  }
  return `${head} · <strong>${alive}</strong> von ${world.cars.length} Autos unterwegs · Führender ${kmh} km/h`;
}

function draw() {
  if (override) {
    override.draw();
    return;
  }
  if (!trainer) {
    if (trackView.track !== null) trackView.setTrack(null);
    trackView.draw(null, -1);
    netView.draw(MODES[mode].rules === RULES_AUSDAUER ? [15, 16, 16, 2] : [12, 16, 16, 2], null, null, null, MODES[mode].rules.channels);
    $('status').innerHTML = 'Wähle unten, womit <strong>Ausdauer</strong> beginnt.';
    return;
  }
  const world = trainer.world;
  if (trackView.track !== world.track) trackView.setTrack(world.track);
  const leader = leaderOf(world);
  trackView.draw(world, leader);
  const car = world.cars[leader];
  netView.draw(trainer.sizes, car?.genome ?? null, car?.input ?? null, car?.scratch ?? null, trainer.rules.channels);
  if (mode === 'ausdauer') {
    $('gauges-title').textContent = 'Führendes Auto';
    updateGauges(car ?? null, trainer.rules);
  }
  $('status').innerHTML = statusText(world, leader);
}

function frame(now) {
  const delta = Math.min(MAX_FRAME_MS, now - lastFrame);
  lastFrame = now;
  if (override) {
    override.step(delta, speed);
    dirty = true;
  } else if (running && trainer) {
    if (speed === 'max') {
      const start = performance.now();
      while (performance.now() - start < SLICE_MS) if (advance(trainer, 40)) onGeneration();
    } else {
      carry += (delta / 1000) * Number(speed);
      const steps = Math.floor(carry / DT);
      carry -= steps * DT;
      if (steps > 0 && advance(trainer, steps)) onGeneration();
    }
    dirty = true;
  }
  if (dirty) {
    dirty = false;
    draw();
  }
  requestAnimationFrame(frame);
}

/** The seed for a new run: what was typed, or a random one. null if the typing is no number. */
function pickSeed() {
  const raw = $('seed').value.trim();
  if (!seedTyped || raw === '') return randomSeed();
  if (/^\d+$/.test(raw)) return normalizeSeed(raw);
  $('seed-hint').hidden = false;
  return null;
}

/** Brings every mode-dependent part of the page in line with `mode` and `trainer`. */
function refresh() {
  const endurance = mode === 'ausdauer';
  for (const name of Object.keys(MODES)) $(`mode-${name}`).setAttribute('aria-pressed', String(name === mode));
  $('mode-note').textContent = modeNote();
  $('start-choice').hidden = !(endurance && !trainer);
  $('speed-16').hidden = !endurance;
  if (!endurance && speed === '16') setSpeed('4');
  $('gauges').hidden = !(endurance && trainer);
  $('tile-stops').hidden = !endurance;
  $('tiles').classList.toggle('four', endurance);
  $('explain-ausdauer').hidden = !endurance;
  $('explain-fahren').hidden = endurance;
  if (endurance && !trainer) {
    const best = bestDriver();
    const enough = trainers.fahren.gen >= MIN_DRIVER_GENS && best !== null;
    $('btn-from-drivers').disabled = !enough;
    $('drivers-why').textContent = enough
      ? `Alle 60 Autos bekommen ${best.which} als Fahrer. ${FREEZE_DRIVER_GENS} Generationen lang lernt nur der Boxenfunk, danach beide.`
      : `Dafür braucht „Fahren lernen“ mindestens ${MIN_DRIVER_GENS} Generationen. Bisher sind es ${trainers.fahren.gen}.`;
  }
  syncInputs();
  updateStats();
  chart.update(trainer?.history ?? [], trainer?.tests ?? [], { endurance: mode === 'ausdauer' });
  setRunning(false);
  trackView.refresh();
  dirty = true;
}

function setMode(next) {
  if (next === mode) return;
  override?.stop();
  save();
  mode = next;
  trainer = trainers[mode];
  carry = 0;
  seedTyped = false;
  $('seed-hint').hidden = true;
  $('start-note').hidden = true;
  saveState(MODE_KEY, mode);
  refresh();
}

function startEndurance(fromDrivers) {
  const seed = pickSeed();
  if (seed === null) return;
  $('seed-hint').hidden = true;
  seedTyped = false;
  let next = null;
  if (fromDrivers) {
    // One proven driver for every car and a frozen phase: then the cars differ only in
    // strategy, and the strategy net gets a clean signal (measured in docs/stufe-2-nachweis.md).
    const best = bestDriver();
    next = best && createTrainer({
      seed, rules: RULES_AUSDAUER, freezeDriverGens: FREEZE_DRIVER_GENS,
      drivers: { genomes: [best.genome], sizes: best.sizes, difficulty: best.difficulty },
    });
    $('start-note').hidden = Boolean(next); // tell the user if the driver did not fit
  } else {
    $('start-note').hidden = true;
  }
  trainers.ausdauer = next ?? createTrainer({ seed, rules: RULES_AUSDAUER });
  trainer = trainers.ausdauer;
  refresh();
}

function reset() {
  if (mode === 'ausdauer') {
    // Endurance starts over with the choice of how to begin; the seed is read when choosing.
    override?.stop();
    trainers.ausdauer = null;
    trainer = null;
    clearState(MODES.ausdauer.key);
    refresh();
    return;
  }
  const seed = pickSeed();
  if (seed === null) return;
  $('seed-hint').hidden = true;
  seedTyped = false;
  override?.stop();
  trainers.fahren = createTrainer({ seed });
  trainer = trainers.fahren;
  carry = 0;
  refresh();
}

function showView() {
  const view = window.location.hash === '#zeichnen' ? 'zeichnen' : 'training';
  $('view-training').hidden = view !== 'training';
  $('view-zeichnen').hidden = view !== 'zeichnen';
  for (const name of ['training', 'zeichnen']) {
    if (name === view) $(`tab-${name}`).setAttribute('aria-current', 'page');
    else $(`tab-${name}`).removeAttribute('aria-current');
  }
  if (view === 'zeichnen') {
    setRunning(false);
    override?.stop();
  }
  document.dispatchEvent(new CustomEvent('rennlabor:view', { detail: view }));
  trackView.refresh();
  chart.resize();
  dirty = true;
}

// --- wiring ---
$('btn-start').addEventListener('click', () => {
  override?.stop();
  setRunning(!running);
});
for (const s of ['1', '4', '16', 'max']) $(`speed-${s}`).addEventListener('click', () => setSpeed(s));
for (const name of Object.keys(MODES)) $(`mode-${name}`).addEventListener('click', () => setMode(name));
$('btn-from-drivers').addEventListener('click', () => startEndurance(true));
$('btn-from-zero').addEventListener('click', () => startEndurance(false));
$('btn-reset').addEventListener('click', reset);
$('seed').addEventListener('input', () => { seedTyped = true; $('seed-hint').hidden = true; });
$('mut-rate').addEventListener('input', (e) => { if (trainer) trainer.evo.rate = Number(e.target.value); syncInputs(); });
$('mut-sigma').addEventListener('input', (e) => { if (trainer) trainer.evo.sigma = Number(e.target.value); syncInputs(); });

window.addEventListener('hashchange', showView);
window.addEventListener('resize', () => { trackView.refresh(); chart.resize(); dirty = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);
onThemeChange(() => { theme = readTheme(); trackView.refresh(); dirty = true; document.dispatchEvent(new CustomEvent('rennlabor:theme')); });
document.fonts?.ready.then(() => { dirty = true; });

initProbe({
  trackView, netView, getTheme, getChampion,
  pause: () => setRunning(false),
  takeOver: (view) => { override = view; dirty = true; },
  release: () => { override = null; dirty = true; },
});
initDrawMode({ getTheme, getChampion, getSpeed: () => speed });

refresh();
showView();
requestAnimationFrame((now) => { lastFrame = now; requestAnimationFrame(frame); });
