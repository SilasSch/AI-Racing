// Sensor channels -> net input. The net never sees position, progress or the track ahead.
import { castRay } from './track.js';

const RAD = Math.PI / 180;

/**
 * Fills `out` with one value per channel of `rules.channels`, each in [-1, 1].
 * `cond` and `factors` (condition of the car, and its grip/power/mass factors) are only
 * there in endurance rule sets; without them the car counts as fresh, empty and at full pace.
 */
export function sense(track, car, rules, spec, out, cond, factors) {
  const channels = rules.channels;
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    switch (ch.type) {
      case 'ray':
        // Square root: a metre more or less matters most close to a wall,
        // so that is where the signal gets its resolution.
        out[i] = Math.sqrt(castRay(track, car.x, car.y, car.heading + ch.angle * RAD, rules.rayRange) / rules.rayRange);
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
      case 'grip':
        out[i] = factors ? factors.grip : 1;
        break;
      case 'fuel':
        out[i] = cond ? cond.fuel / rules.endurance.tank : 0;
        break;
      case 'pace':
        out[i] = cond ? cond.pace : 1;
        break;
      default:
        out[i] = 0;
    }
  }
}
