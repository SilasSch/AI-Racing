// Evolution: keep the best, breed the rest by tournament selection,
// uniform crossover and Gaussian mutation.

export const EVO_DEFAULTS = { popSize: 60, elites: 4, tournament: 3, crossover: 0.5, rate: 0.1, sigma: 0.15 };

function pick(score, size, rng) {
  let best = rng.int(score.length);
  for (let k = 1; k < size; k++) {
    const other = rng.int(score.length);
    if (score[other] > score[best]) best = other;
  }
  return best;
}

/**
 * @param {Float32Array[]} genomes current population (not modified)
 * @param {number[]} fitness one value per genome; NaN counts as -Infinity
 * @param {{elites:number,tournament:number,crossover:number,rate:number,sigma:number}} params
 * @param {{next():number,int(n:number):number,normal():number}} rng
 * @returns {Float32Array[]} next population of the same size, elites first
 */
export function nextGeneration(genomes, fitness, params, rng) {
  const count = genomes.length;
  const score = fitness.map((f) => (Number.isNaN(f) ? -Infinity : f));
  const order = score.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
  const next = [];
  const elites = Math.min(params.elites, count);
  for (let e = 0; e < elites; e++) next.push(Float32Array.from(genomes[order[e]]));

  while (next.length < count) {
    const mother = genomes[pick(score, params.tournament, rng)];
    const child = Float32Array.from(mother);
    if (rng.next() < params.crossover) {
      const father = genomes[pick(score, params.tournament, rng)];
      for (let i = 0; i < child.length; i++) if (rng.next() < 0.5) child[i] = father[i];
    }
    if (params.rate > 0) {
      for (let i = 0; i < child.length; i++) {
        if (rng.next() < params.rate) child[i] += rng.normal() * params.sigma;
      }
    }
    next.push(child);
  }
  return next;
}
