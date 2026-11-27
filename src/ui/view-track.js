// Top view of a track with its cars. The track is painted once into a buffer;
// each frame only adds the cars.
import { castRay } from '../core/track.js';
import { fitCanvas } from './theme.js';

const RAD = Math.PI / 180;

export function createTrackView(canvas, getTheme) {
  const ctx = canvas.getContext('2d');
  const buffer = document.createElement('canvas');
  let track = null;
  let view = { scale: 1, ox: 0, oy: 0 };
  let fixedBounds = null;

  const sx = (x) => view.ox + x * view.scale;
  const sy = (y) => view.oy + y * view.scale;

  function layout() {
    const b = fixedBounds ?? track?.bounds;
    if (!b) return;
    const pad = 14 * (canvas.width / Math.max(1, canvas.clientWidth));
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    const scale = Math.min((canvas.width - 2 * pad) / w, (canvas.height - 2 * pad) / h);
    view = {
      scale,
      ox: (canvas.width - w * scale) / 2 - b.minX * scale,
      oy: (canvas.height - h * scale) / 2 - b.minY * scale,
    };
  }

  function path(target) {
    target.beginPath();
    for (let i = 0; i < track.n; i++) {
      if (i === 0) target.moveTo(sx(track.xs[i]), sy(track.ys[i]));
      else target.lineTo(sx(track.xs[i]), sy(track.ys[i]));
    }
    target.closePath();
  }

  function paintBuffer() {
    buffer.width = canvas.width;
    buffer.height = canvas.height;
    const b = buffer.getContext('2d');
    const theme = getTheme();
    b.fillStyle = theme.infield;
    b.fillRect(0, 0, buffer.width, buffer.height);
    if (!track) return;
    const road = 2 * track.halfWidth * view.scale;
    b.lineJoin = 'round';
    b.lineCap = 'round';
    path(b);
    b.strokeStyle = theme.kerb;
    b.lineWidth = road + Math.max(2, 2.4 * view.scale);
    b.stroke();
    b.strokeStyle = theme.asphalt;
    b.lineWidth = road;
    b.stroke();
    // start / finish line across the road
    const s = track.start;
    const nx = -Math.sin(s.heading), ny = Math.cos(s.heading);
    b.beginPath();
    b.moveTo(sx(s.x + nx * track.halfWidth), sy(s.y + ny * track.halfWidth));
    b.lineTo(sx(s.x - nx * track.halfWidth), sy(s.y - ny * track.halfWidth));
    b.strokeStyle = theme.surface;
    b.lineWidth = Math.max(2, 1.6 * view.scale);
    b.lineCap = 'butt';
    b.stroke();
  }

  function drawCar(state, colour, size) {
    ctx.save();
    ctx.translate(sx(state.x), sy(state.y));
    ctx.rotate(state.heading);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(-size, -size * 0.5, size * 2, size, size * 0.3);
    ctx.fill();
    ctx.restore();
  }

  return {
    /** Fixed world rectangle instead of fitting to the track (used by the drawing view). */
    setBounds(bounds) { fixedBounds = bounds; fitCanvas(canvas); layout(); paintBuffer(); },
    setTrack(next) { track = next; fitCanvas(canvas); layout(); paintBuffer(); },
    get track() { return track; },
    /** Repaint the buffer, e.g. after a resize or theme change. */
    refresh() { fitCanvas(canvas); layout(); paintBuffer(); },
    toWorld(px, py) {
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      return { x: (px * ratio - view.ox) / view.scale, y: (py * ratio - view.oy) / view.scale };
    },
    toScreen(x, y) { return { x: sx(x), y: sy(y) }; },
    get context() { return ctx; },
    get scale() { return view.scale; },
    /**
     * @param {object|null} world cars to draw
     * @param {number} leader index of the highlighted car, or -1
     * @param {{rays?: boolean}} [opts]
     */
    draw(world, leader, opts = {}) {
      if (fitCanvas(canvas)) { layout(); paintBuffer(); }
      ctx.drawImage(buffer, 0, 0);
      if (!world) return;
      const theme = getTheme();
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      const size = Math.max(3.2 * ratio, 2.4 * view.scale);
      const cars = world.cars;
      for (let i = 0; i < cars.length; i++) {
        if (i !== leader && !cars[i].alive) drawCar(cars[i].state, theme['car-out'], size * 0.8);
      }
      for (let i = 0; i < cars.length; i++) {
        if (i !== leader && cars[i].alive) drawCar(cars[i].state, theme.car, size);
      }
      if (leader >= 0 && cars[leader]) {
        const car = cars[leader].state;
        if (opts.rays !== false && world.track.field) {
          ctx.strokeStyle = theme.ray;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = Math.max(1, ratio);
          ctx.beginPath();
          for (const ch of world.rules.channels) {
            if (ch.type !== 'ray') continue;
            const angle = car.heading + ch.angle * RAD;
            const d = castRay(world.track, car.x, car.y, angle, world.rules.rayRange);
            ctx.moveTo(sx(car.x), sy(car.y));
            ctx.lineTo(sx(car.x + Math.cos(angle) * d), sy(car.y + Math.sin(angle) * d));
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        drawCar(car, theme['lead-car'], size * 1.3);
      }
    },
  };
}

/** The living car that is furthest along; if none lives, the one that got furthest. */
export function leaderOf(world) {
  let best = -1, bestAlive = -1;
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    if (best < 0 || cars[i].progress > cars[best].progress) best = i;
    if (cars[i].alive && (bestAlive < 0 || cars[i].progress > cars[bestAlive].progress)) bestAlive = i;
  }
  return bestAlive >= 0 ? bestAlive : best;
}
