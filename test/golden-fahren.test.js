// Pins the behaviour of the "fahren" rule set. Later stages add rule sets;
// this one must keep computing exactly the same numbers for the same seed.
// The values below were recorded from the code as of stage 1 (commit cc13304).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTrainer, runGeneration } from '../src/core/trainer.js';

const GOLDEN = {
  "1": {
    "history": [
      {
        "gen": 1,
        "best": 8.888139627865737,
        "mean": 0.6946843159357806,
        "difficulty": 0,
        "clean": 1,
        "eliteClean": null
      },
      {
        "gen": 2,
        "best": 12.31431827367151,
        "mean": 1.3393537251875287,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 0
      },
      {
        "gen": 3,
        "best": 11.984658566536137,
        "mean": 1.8480384748166052,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 0
      },
      {
        "gen": 4,
        "best": 12.668626636887943,
        "mean": 1.528405078368191,
        "difficulty": 0,
        "clean": 1,
        "eliteClean": 0
      },
      {
        "gen": 5,
        "best": 13.082514991819368,
        "mean": 1.600906598573163,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 0
      },
      {
        "gen": 6,
        "best": 12.774096587083896,
        "mean": 2.2427923942062575,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 1
      }
    ],
    "tests": [
      {
        "gen": 5,
        "passed": 1,
        "meanSpeed": 7.898448463933431
      }
    ],
    "champion": "e2ca066a0d3055cf20939433b0b881e5a1a6b49ac9b708f6ee75531882587f3c"
  },
  "7": {
    "history": [
      {
        "gen": 1,
        "best": 5.453618045060933,
        "mean": 0.315413071563593,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": null
      },
      {
        "gen": 2,
        "best": 4.430401676261477,
        "mean": 0.7127161212588556,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 0
      },
      {
        "gen": 3,
        "best": 5.157067240942103,
        "mean": 1.0736511869598802,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 0
      },
      {
        "gen": 4,
        "best": 12.947733758533818,
        "mean": 1.629867111007301,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 0
      },
      {
        "gen": 5,
        "best": 16.24249936512027,
        "mean": 2.603120694769992,
        "difficulty": 0,
        "clean": 1,
        "eliteClean": 1
      },
      {
        "gen": 6,
        "best": 5.746469654255495,
        "mean": 1.2669963584323924,
        "difficulty": 0,
        "clean": 0,
        "eliteClean": 0
      }
    ],
    "tests": [
      {
        "gen": 5,
        "passed": 0,
        "meanSpeed": 7.653783813233244
      }
    ],
    "champion": "dbb26464e5cf89f38d2f0d0105dbd842f3ab715c23e1112945a5b659bc1f05b1"
  }
};

for (const seed of Object.keys(GOLDEN)) {
  test(`fahren, Seed ${seed}: sechs Generationen rechnen wie in Stufe 1`, () => {
    const t = createTrainer({ seed: Number(seed) });
    for (let i = 0; i < 6; i++) runGeneration(t);
    const expected = GOLDEN[seed];
    t.history.forEach((h, i) => {
      for (const key of ['gen', 'best', 'mean', 'difficulty', 'clean', 'eliteClean']) {
        assert.equal(h[key], expected.history[i][key], `Generation ${i + 1}, ${key}`);
      }
    });
    assert.deepEqual(t.tests, expected.tests);
    const hash = createHash('sha256').update(new Uint8Array(t.champion.buffer)).digest('hex');
    assert.equal(hash, expected.champion);
  });
}
