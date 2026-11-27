// Rule sets. The simulation core takes its rules from here instead of hard-coding them,
// so later stages (endurance, teams) can add their own set.

export const DT = 1 / 30; // seconds per simulation step

const RAY_ANGLES = [-90, -55, -30, -12, 0, 12, 30, 55, 90];

/** Stage 1: learn to drive. Touching a wall ends the run. */
export const RULES_FAHREN = {
  id: 'fahren',
  wallContact: 'fatal',
  episodeSeconds: 45,
  lapTimeout: 120,
  stall: { seconds: 3, minProgress: 5 },
  rayRange: 150,
  carRadius: 1,
  // What the driver net sees. Only things a car could measure itself.
  channels: [
    ...RAY_ANGLES.map((angle) => ({ type: 'ray', angle })),
    { type: 'speed' },
    { type: 'slip' },
    { type: 'steer' },
  ],
};
