// Random closed tracks, harder with rising difficulty.
import { createRng, hashSeed } from './rng.js';
import { buildGeometry, attachField, validateTrack } from './track.js';

const BASE_RADIUS = 190; // metres

/** Difficulty 0..1 -> track parameters. Out-of-range values are clamped. */
export function difficultyParams(d) {
  const t = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0;
  return {
    halfWidth: 9 + (5.5 - 9) * t,
    points: Math.round(7 + 7 * t),
    amplitude: 0.12 + (0.45 - 0.12) * t,
  };
}

function controlPoints(rng, count, amplitude) {
  const step = (2 * Math.PI) / count;
  const raw = [];
  for (let i = 0; i < count; i++) {
    const a = i * step + rng.range(-0.35, 0.35) * step;
    const r = BASE_RADIUS * (1 + amplitude * rng.range(-1, 1));
    raw.push({ a, r });
  }
  const stretch = rng.range(1, 1.5);
  const rot = rng.range(0, 2 * Math.PI);
  const mirror = rng.next() < 0.5;
  const reverse = rng.next() < 0.5;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const pts = raw.map(({ a, r }) => {
    let x = r * Math.cos(a) * stretch;
    const y = r * Math.sin(a);
    if (mirror) x = -x;
    return { x: x * cr - y * sr, y: x * sr + y * cr };
  });
  if (reverse) pts.reverse();
  return pts;
}

/** Always returns a valid track. Same seed and difficulty give the same track. */
export function generateTrack(seed, difficulty) {
  const params = difficultyParams(difficulty);
  for (let attempt = 0; ; attempt++) {
    const rng = createRng(hashSeed(seed, attempt));
    // After 10 failed attempts the shape gets tamer by 5 % per attempt, so this terminates.
    const amplitude = params.amplitude * (attempt >= 10 ? 0.95 ** (attempt - 9) : 1);
    const track = buildGeometry(controlPoints(rng, params.points, amplitude), params.halfWidth);
    if (validateTrack(track).ok) return attachField(track);
  }
}
