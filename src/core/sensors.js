// Sensor channels -> net input. The net never sees position, progress or the track ahead.
import { castRay } from './track.js';

const RAD = Math.PI / 180;

/** Fills `out` with one value per channel of `rules.channels`, each in [-1, 1]. */
export function sense(track, car, rules, spec, out) {
  const channels = rules.channels;
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    switch (ch.type) {
      case 'ray':
        out[i] = castRay(track, car.x, car.y, car.heading + ch.angle * RAD, rules.rayRange) / rules.rayRange;
        break;
      case 'speed':
        out[i] = Math.min(1, car.vx / 80);
        break;
      case 'slip':
        out[i] = Math.max(-1, Math.min(1, car.vy / 20));
        break;
      case 'steer':
        out[i] = car.steer / spec.maxSteer;
        break;
      default:
        out[i] = 0;
    }
  }
}
