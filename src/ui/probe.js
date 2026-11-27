// Test drive: the best car on a freshly generated track that training can never use.
import { generateTrack } from '../core/generator.js';
import { createWorld, stepWorld } from '../core/world.js';
import { DT } from '../core/rules.js';

const SLICE_MS = 12;
const fmt = (v, digits = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** One sentence on how a single car's run ended. */
export function describeRun(car, track) {
  const metres = Math.max(0, Math.round(car.progress));
  const lap = Math.round(track.length);
  switch (car.endReason) {
    case 'runde':
      return `Runde geschafft in ${fmt(car.time, 1)} s, im Schnitt ${fmt((track.length / car.time) * 3.6)} km/h.`;
    case 'wand':
      return `Wandkontakt nach ${fmt(metres)} von ${fmt(lap)} Metern.`;
    case 'stillstand':
      return `Stehen geblieben nach ${fmt(metres)} von ${fmt(lap)} Metern.`;
    default:
      return `Zeit abgelaufen nach ${fmt(metres)} von ${fmt(lap)} Metern.`;
  }
}

/** Steps a world forward for one frame. Returns true once the world is done. */
export function driveFrame(world, deltaMs, speed, state) {
  if (speed === 'max') {
    const start = performance.now();
    while (!world.done && performance.now() - start < SLICE_MS) stepWorld(world);
  } else {
    state.carry += (deltaMs / 1000) * Number(speed);
    let steps = Math.floor(state.carry / DT);
    state.carry -= steps * DT;
    while (steps-- > 0 && !world.done) stepWorld(world);
  }
  return world.done;
}

/** Seeds with the top bit set are never used for training tracks. */
const unseenSeed = () => ((Math.floor(Math.random() * 4294967296) | 0x80000000) >>> 0);

export function initProbe({ trackView, netView, getChampion, pause, takeOver, release }) {
  const button = document.getElementById('btn-probe');
  const message = document.getElementById('probe-msg');
  const status = document.getElementById('status');

  button.addEventListener('click', () => {
    const champion = getChampion();
    if (!champion) return;
    pause();
    const track = generateTrack(unseenSeed(), champion.difficulty);
    const world = createWorld(track, champion.rules, champion.spec, champion.sizes, [champion.genome], { untilLap: true });
    const state = { carry: 0 };
    const level = Math.round(champion.difficulty * 10);
    message.hidden = true;
    trackView.setTrack(track);

    takeOver({
      step(deltaMs, speed) {
        if (world.done) return;
        if (driveFrame(world, deltaMs, speed, state)) {
          message.textContent = `${champion.label} auf einer neuen Strecke, Schwierigkeit ${level} von 10: ${describeRun(world.cars[0], track)}`;
          message.hidden = false;
        }
      },
      draw() {
        const car = world.cars[0];
        trackView.draw(world, 0);
        netView.draw(champion.sizes, car.genome, car.input, car.scratch, champion.rules.channels);
        status.innerHTML = world.done
          ? 'Probefahrt beendet. <strong>Weiter</strong> setzt das Training fort.'
          : `<strong>Probefahrt</strong> auf einer Strecke, die im Training nie vorkam · ${Math.round(car.state.vx * 3.6)} km/h`;
      },
      stop() {
        message.hidden = true;
        release();
      },
    });
  });
}
