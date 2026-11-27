// Feedforward net on a flat genome.
// Layout: layer by layer; for each output node its `in` weights, then its bias.

export function genomeLength(sizes) {
  let n = 0;
  for (let l = 1; l < sizes.length; l++) n += (sizes[l - 1] + 1) * sizes[l];
  return n;
}

export function randomGenome(sizes, rng) {
  const g = new Float32Array(genomeLength(sizes));
  let p = 0;
  for (let l = 1; l < sizes.length; l++) {
    const nin = sizes[l - 1];
    const scale = 1 / Math.sqrt(nin);
    for (let j = 0; j < sizes[l]; j++) {
      for (let i = 0; i < nin; i++) g[p++] = rng.normal() * scale;
      g[p++] = 0;
    }
  }
  return g;
}

/** One activation buffer per layer after the input layer. */
export function createScratch(sizes) {
  const scratch = [];
  for (let l = 1; l < sizes.length; l++) scratch.push(new Float32Array(sizes[l]));
  return scratch;
}

/** Returns scratch.at(-1). Activations of every layer stay readable in scratch. */
export function forward(genome, sizes, input, scratch) {
  let prev = input;
  let p = 0;
  for (let l = 1; l < sizes.length; l++) {
    const nin = sizes[l - 1];
    const nout = sizes[l];
    const out = scratch[l - 1];
    for (let j = 0; j < nout; j++) {
      let sum = 0;
      for (let i = 0; i < nin; i++) sum += genome[p++] * prev[i];
      sum += genome[p++];
      out[j] = Math.tanh(sum);
    }
    prev = out;
  }
  return prev;
}
