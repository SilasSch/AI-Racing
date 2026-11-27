// Page wiring for the training view: controls, frame loop, statistics, saving.
import { createTrainer, advance, serialize, restoreTrainer, TRACKS_PER_GEN } from '../core/trainer.js';
import { DT } from '../core/rules.js';
import { normalizeSeed } from '../core/rng.js';
import { saveState, loadState } from './storage.js';
import { readTheme, onThemeChange } from './theme.js';
import { createTrackView, leaderOf } from './view-track.js';
import { createNetView } from './view-net.js';
import { createChart } from './view-chart.js';
import { initDrawMode } from './draw-mode.js';
import { initProbe } from './probe.js';

const STORAGE_KEY = 'rennlabor:fahren';
const SAVE_EVERY_MS = 3000;
const MAX_FRAME_MS = 100; // a stalled tab must not trigger a catch-up race
const SLICE_MS = 12; // simulation budget per frame at "max"
const $ = (id) => document.getElementById(id);

let theme = readTheme();
const getTheme = () => theme;
const trackView = createTrackView($('cv-track'), getTheme);
const netView = createNetView($('cv-net'), getTheme);
const chart = createChart($('chart'), $('chart-tip'), $('test-table'));

const randomSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;
let trainer = restoreTrainer(loadState(STORAGE_KEY)) ?? createTrainer({ seed: randomSeed() });
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
  const genome = trainer.proven?.genome ?? trainer.champion;
  if (!genome) return null;
  return { genome, sizes: trainer.sizes, rules: trainer.rules, spec: trainer.spec, difficulty: trainer.difficulty };
}

function save() {
  lastSave = performance.now();
  saveState(STORAGE_KEY, serialize(trainer));
}

function setRunning(next) {
  running = next;
  $('btn-start').textContent = running ? 'Pause' : trainer.gen > 0 || trainer.world.steps > 0 ? 'Weiter' : 'Start';
  if (!running) save();
  dirty = true;
}

function setSpeed(next) {
  speed = next;
  for (const s of ['1', '4', 'max']) $(`speed-${s}`).setAttribute('aria-pressed', String(s === speed));
  carry = 0;
}

function updateStats() {
  $('stat-gen').textContent = String(trainer.gen);
  const level = Math.round(trainer.difficulty * 10);
  $('stat-diff').textContent = String(level);
  const meter = $('diff-meter');
  if (meter.children.length !== 10) meter.replaceChildren(...Array.from({ length: 10 }, () => document.createElement('i')));
  [...meter.children].forEach((bar, i) => bar.classList.toggle('on', i < level));
  const test = trainer.tests.at(-1);
  $('stat-test').textContent = test ? String(test.passed) : '–';
  $('btn-probe').disabled = !getChampion();
  document.dispatchEvent(new CustomEvent('rennlabor:champion'));
}

function syncInputs() {
  if (!seedTyped) $('seed').value = String(trainer.seed);
  $('mut-rate').value = String(trainer.evo.rate);
  $('mut-sigma').value = String(trainer.evo.sigma);
  $('mut-rate-value').textContent = `${Math.round(trainer.evo.rate * 100)} %`;
  $('mut-sigma-value').textContent = trainer.evo.sigma.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function onGeneration() {
  updateStats();
  chart.update(trainer.history, trainer.tests);
  if (performance.now() - lastSave > SAVE_EVERY_MS) save();
}

function statusText(world, leader) {
  if (trainer.gen === 0 && world.steps === 0 && !running) {
    return '<strong>60 Zufallsnetze stehen am Start.</strong> Nach dem Start scheitern fast alle sofort. Genau daraus wird gelernt.';
  }
  let alive = 0;
  for (const car of world.cars) if (car.alive) alive++;
  const kmh = leader >= 0 ? Math.round(world.cars[leader].state.vx * 3.6) : 0;
  return `Generation <strong>${trainer.gen + 1}</strong> · Strecke ${trainer.trackIndex + 1} von ${TRACKS_PER_GEN} · <strong>${alive}</strong> von ${world.cars.length} Autos unterwegs · Führender ${kmh} km/h`;
}

function draw() {
  if (override) {
    override.draw();
    return;
  }
  const world = trainer.world;
  if (trackView.track !== world.track) trackView.setTrack(world.track);
  const leader = leaderOf(world);
  trackView.draw(world, leader);
  const car = world.cars[leader];
  netView.draw(trainer.sizes, car?.genome ?? null, car?.input ?? null, car?.scratch ?? null, trainer.rules.channels);
  $('status').innerHTML = statusText(world, leader);
}

function frame(now) {
  const delta = Math.min(MAX_FRAME_MS, now - lastFrame);
  lastFrame = now;
  if (override) {
    override.step(delta, speed);
    dirty = true;
  } else if (running) {
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

function reset() {
  const raw = $('seed').value.trim();
  let seed;
  if (!seedTyped || raw === '') {
    seed = randomSeed();
  } else if (/^\d+$/.test(raw)) {
    seed = normalizeSeed(raw);
  } else {
    $('seed-hint').hidden = false;
    return;
  }
  $('seed-hint').hidden = true;
  seedTyped = false;
  override?.stop();
  trainer = createTrainer({ seed });
  carry = 0;
  setRunning(false);
  syncInputs();
  updateStats();
  chart.update(trainer.history, trainer.tests);
  save();
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
for (const s of ['1', '4', 'max']) $(`speed-${s}`).addEventListener('click', () => setSpeed(s));
$('btn-reset').addEventListener('click', reset);
$('seed').addEventListener('input', () => { seedTyped = true; $('seed-hint').hidden = true; });
$('mut-rate').addEventListener('input', (e) => { trainer.evo.rate = Number(e.target.value); syncInputs(); });
$('mut-sigma').addEventListener('input', (e) => { trainer.evo.sigma = Number(e.target.value); syncInputs(); });

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

syncInputs();
updateStats();
chart.update(trainer.history, trainer.tests);
setRunning(false);
showView();
requestAnimationFrame((now) => { lastFrame = now; requestAnimationFrame(frame); });
