// Draw your own track and let the best car try it.
import { trackFromStroke, REASON_TEXT } from '../core/drawn.js';
import { createWorld } from '../core/world.js';
import { createTrackView } from './view-track.js';
import { describeRun, driveFrame } from './probe.js';

const AREA = { minX: 0, minY: 0, maxX: 700, maxY: 450 }; // metres shown on the drawing surface
const DRIVE_SPEED = '4';
const MIN_STEP = 2; // metres between recorded stroke points

export function initDrawMode({ getTheme, getChampion }) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('cv-draw');
  const view = createTrackView(canvas, getTheme);
  const message = $('draw-msg');
  const result = $('draw-result');
  const goButton = $('btn-draw-go');
  const widthInput = $('draw-width');

  let stroke = [];
  let track = null;
  let world = null;
  let pointer = null; // id of the pointer that is drawing
  let visible = false;
  let lastFrame = 0;
  const driveState = { carry: 0 };

  const halfWidth = () => Number(widthInput.value);

  function hint() {
    if (track) return getChampion() ? '' : 'Die Strecke steht. Trainiere erst ein paar Generationen, dann kann das beste Auto hier fahren.';
    return 'Zieh mit Maus oder Finger eine große, geschlossene Schleife.';
  }

  function refreshControls() {
    goButton.disabled = !(track && getChampion()) || Boolean(world && !world.done);
    $('draw-width-value').textContent = `${(2 * halfWidth()).toLocaleString('de-DE')} m`;
  }

  function paint() {
    if (!visible) return;
    view.draw(world, world ? 0 : -1);
    if (!track && stroke.length > 1) {
      const ctx = view.context;
      const theme = getTheme();
      ctx.beginPath();
      stroke.forEach((p, i) => {
        const s = view.toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = theme.lead;
      ctx.lineWidth = Math.max(2, canvas.width / Math.max(1, canvas.clientWidth) * 2.5);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  function build() {
    world = null;
    result.hidden = true;
    const outcome = trackFromStroke(stroke, halfWidth());
    if (outcome.ok) {
      track = outcome.track;
      view.setTrack(track);
      message.textContent = hint();
    } else {
      track = null;
      view.setTrack(null);
      message.textContent = REASON_TEXT[outcome.reason] ?? 'Diese Strecke kann das Auto nicht fahren.';
    }
    refreshControls();
    paint();
  }

  function clear() {
    stroke = [];
    track = null;
    world = null;
    result.hidden = true;
    view.setTrack(null);
    message.textContent = hint();
    refreshControls();
    paint();
  }

  function pointAt(event) {
    const box = canvas.getBoundingClientRect();
    const p = view.toWorld(event.clientX - box.left, event.clientY - box.top);
    return {
      x: Math.min(AREA.maxX, Math.max(AREA.minX, p.x)),
      y: Math.min(AREA.maxY, Math.max(AREA.minY, p.y)),
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (pointer !== null) return; // a second finger does not start a second stroke
    pointer = event.pointerId;
    try { canvas.setPointerCapture(pointer); } catch { /* capture is a convenience */ }
    stroke = [pointAt(event)];
    track = null;
    world = null;
    result.hidden = true;
    view.setTrack(null);
    message.textContent = '';
    refreshControls();
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    const p = pointAt(event);
    const last = stroke[stroke.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= MIN_STEP) {
      stroke.push(p);
      paint();
    }
  });
  const finish = (event) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    build();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  widthInput.addEventListener('input', () => {
    if (stroke.length) build(); else refreshControls();
  });
  $('btn-draw-clear').addEventListener('click', clear);

  goButton.addEventListener('click', () => {
    const champion = getChampion();
    if (!track || !champion) return;
    world = createWorld(track, champion.rules, champion.spec, champion.sizes, [champion.genome], { untilLap: true });
    driveState.carry = 0;
    result.hidden = true;
    message.textContent = 'Das beste Auto fährt deine Strecke zum ersten Mal.';
    refreshControls();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  });

  function frame(now) {
    if (!world || world.done || !visible) return;
    const delta = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (driveFrame(world, delta, DRIVE_SPEED, driveState)) {
      result.textContent = `Deine Strecke: ${describeRun(world.cars[0], track)}`;
      result.hidden = false;
      message.textContent = '';
      refreshControls();
    }
    paint();
    if (!world.done) requestAnimationFrame(frame);
  }

  document.addEventListener('rennlabor:view', (event) => {
    visible = event.detail === 'zeichnen';
    if (!visible) return;
    view.setBounds(AREA);
    if (track) view.setTrack(track);
    if (!message.textContent) message.textContent = hint();
    refreshControls();
    paint();
    if (world && !world.done) { lastFrame = performance.now(); requestAnimationFrame(frame); }
  });
  document.addEventListener('rennlabor:champion', () => {
    refreshControls();
    if (visible && track && (!world || world.done) && result.hidden) message.textContent = hint();
  });
  document.addEventListener('rennlabor:theme', () => { view.refresh(); paint(); });
  window.addEventListener('resize', () => { if (visible) { view.refresh(); paint(); } });

  message.textContent = hint();
  refreshControls();
}
