/* Urteaga et al., MLHC 2021 generalized-Poisson / skipped-record model.
 * JavaScript adaptation of the MIT reference implementation; attribution in
 * THIRD_PARTY_NOTICES.md. Reference defaults, NOT fitted population parameters.
 */
(function (root) {
  'use strict';
  const CONFIG = Object.freeze({ version: 'gp-skips-1', kappa: 30, gamma: 1,
    alphaXi: 1, betaXi: 1, alphaPi: 2, betaPi: 20, maxSkips: 10,
    samples: 32768, seed: 20261113, maxDay: 3660 });
  const fact = [0];
  function logGamma(z) {
    const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    z -= 1;
    let sum = .9999999999998099;
    coefficients.forEach((c, i) => { sum += c / (z + i + 1); });
    const t = z + 7.5;
    return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(sum);
  }
  function logGammaDensity(x, shape, rate) {
    return shape * Math.log(rate) - logGamma(shape) + (shape - 1) * Math.log(x) - rate * x;
  }
  function logFactorial(n) {
    for (let i = fact.length; i <= n; i++) fact.push(fact[i - 1] + Math.log(i));
    return fact[n];
  }
  function logGP(x, lambda, xi) {
    if (!Number.isInteger(x) || x < 0 || !(lambda > 0) || !(xi > -1 && xi < 1)) return -Infinity;
    if (x === 0) return -lambda;
    const term = lambda + xi * x;
    if (term <= 0) return -Infinity;
    return Math.log(lambda) + (x - 1) * Math.log(term) - term - logFactorial(x);
  }
  function logNormalizer(lambda, xi) {
    if (xi >= 0) return 0;
    const support = Math.ceil(-lambda / xi) - 1;
    // For near-zero negative xi the finite support can be enormous. The
    // numerical sum extends well beyond the mass, without allocating support.
    const mean = lambda / (1 - xi), sd = Math.sqrt(lambda / (1 - xi) ** 3);
    const end = Math.min(support, Math.ceil(mean + 16 * sd + 40));
    let total = 0;
    for (let x = 0; x <= end; x++) total += Math.exp(logGP(x, lambda, xi));
    return Math.log(total);
  }
  function skipWeights(pi, maxSkips = CONFIG.maxSkips) {
    if (!(pi >= 0 && pi < 1) || !Number.isInteger(maxSkips) || maxSkips < 0) throw new Error('Invalid skipped-record parameters.');
    const weights = [], factor = (1 - pi) / (1 - pi ** (maxSkips + 1));
    for (let s = 0; s <= maxSkips; s++) weights.push(factor * pi ** s);
    return weights;
  }
  function logSum(values) {
    let max = -Infinity;
    for (const v of values) if (v > max) max = v;
    if (!Number.isFinite(max)) return -Infinity;
    let sum = 0;
    for (const v of values) sum += Math.exp(v - max);
    return max + Math.log(sum);
  }
  function likelihood(x, particle) {
    const terms = particle.logSkip.map((q, s) => q + logGP(x, (s + 1) * particle.lambda, particle.xi) - particle.logZ[s]);
    return logSum(terms);
  }
  function particle(lambda, xi, pi, maxSkips = CONFIG.maxSkips) {
    if (!(lambda > 0 && xi > -1 && xi < 1)) throw new Error('Invalid generalized-Poisson parameters.');
    const logSkip = skipWeights(pi, maxSkips).map(Math.log);
    return { lambda, xi, pi, logSkip,
      logZ: logSkip.map((_, s) => logNormalizer((s + 1) * lambda, xi)) };
  }
  // Fixed pseudorandom seed makes records reproducible across reloads. Independent
  // particle halves provide a numerical disagreement check, not clinical coverage.
  function rng(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function drawParticles(count = CONFIG.samples, seed = CONFIG.seed, history = null) {
    if (!Number.isInteger(count) || count < 2 || count > 131072) throw new Error('Invalid particle count.');
    const random = rng(seed), uniform = () => Math.max(Number.MIN_VALUE, random());
    function gamma(shape) {
      // Marsaglia–Tsang rejection sampler, shape >= 1; rate is applied below.
      const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
      for (;;) {
        const z = Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
        const base = 1 + c * z;
        if (base <= 0) continue;
        const v = base ** 3, u = uniform();
        if (u < 1 - .0331 * z ** 4 || Math.log(u) < .5 * z * z + d * (1 - v + Math.log(v))) return d * v;
      }
    }
    const sorted = history ? [...history].sort((a, b) => a - b) : null;
    const center = sorted ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : 0;
    const spread = sorted ? Math.max(1.2, 1.5 * Math.sqrt(center / sorted.length)) : 0;
    const samples = [];
    for (let i = 0; i < count; i++) {
      const xi = 2 * uniform() - 1; // Shifted Beta(1,1), as in reference draw_params.
      const proposalMean = history ? Math.max(.01, center * (1 - xi)) : 1;
      const proposalShape = history ? Math.max(1, (proposalMean / spread) ** 2) : 1, proposalRate = proposalShape / proposalMean;
      const lambda = history && uniform() < .5 ? gamma(proposalShape) / proposalRate : gamma(CONFIG.kappa) / CONFIG.gamma;
      const a = gamma(CONFIG.alphaPi), b = gamma(CONFIG.betaPi);
      const p = particle(lambda, xi, a / (a + b));
      if (history) {
        const prior = logGammaDensity(lambda, CONFIG.kappa, CONFIG.gamma);
        const proposal = logSum([prior, logGammaDensity(lambda, proposalShape, proposalRate)]) - Math.log(2);
        p.logImportance = prior - proposal;
      }
      samples.push(p);
    }
    return samples;
  }
  function posteriorWeights(lengths, samples, observationCache) {
    const histogram = new Map();
    for (const x of lengths) histogram.set(x, (histogram.get(x) || 0) + 1);
    const logWeights = Float64Array.from(samples, p => p.logImportance || 0);
    for (const [x, count] of histogram) {
      let logs = observationCache && observationCache.get(x);
      if (!logs) {
        logs = Float64Array.from(samples, p => likelihood(x, p));
        if (observationCache) {
          if (observationCache.size >= 64) observationCache.delete(observationCache.keys().next().value);
          observationCache.set(x, logs);
        }
      }
      for (let i = 0; i < samples.length; i++) logWeights[i] += count * logs[i];
    }
    let max = -Infinity;
    for (const w of logWeights) if (w > max) max = w;
    if (!Number.isFinite(max)) throw new Error('These records are outside the numerical model support.');
    const weights = Float64Array.from(logWeights, x => Math.exp(x - max));
    const sum = weights.reduce((a, b) => a + b, 0);
    let sq = 0;
    for (let i = 0; i < weights.length; i++) { weights[i] /= sum; sq += weights[i] ** 2; }
    return { weights, ess: 1 / sq };
  }
  function summarize(pmf) {
    let total = 0;
    const cumulative = Float64Array.from(pmf, x => total += x);
    if (!(total > 0)) throw new Error('No predictive probability remains.');
    for (let i = 0; i < pmf.length; i++) { pmf[i] /= total; cumulative[i] /= total; }
    function quantile(q) {
      if (!(q > 0 && q < 1)) throw new Error('Quantiles must be between zero and one.');
      let lo = 1, hi = cumulative.length - 1;
      while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (cumulative[mid] >= q) hi = mid; else lo = mid + 1; }
      return lo;
    }
    return { pmf, total, cumulative, quantile, median: quantile(.5), low: quantile(.1), high: quantile(.9),
      cdf: x => x < 1 ? 0 : x >= cumulative.length - 1 ? 1 : cumulative[Math.floor(x)],
      probability: x => Number.isInteger(x) && x > 0 && x < pmf.length ? pmf[x] : 0 };
  }
  function infer(lengths, samples, observationCache, options = {}) {
    if (!Array.isArray(lengths) || lengths.some(x => !Number.isInteger(x) || x < 1 || x > CONFIG.maxDay)) throw new Error('Invalid cycle lengths.');
    const posterior = posteriorWeights(lengths, samples, observationCache), split = Math.floor(samples.length / 2);
    const halfMass = [0, 0], halfSquares = [0, 0];
    let expectedZero = 0, meanPi = 0;
    const active = [];
    samples.forEach((p, i) => {
      const w = posterior.weights[i], half = i < split ? 0 : 1;
      halfMass[half] += w; halfSquares[half] += w * w;
      expectedZero += w * Math.exp(-p.lambda - p.logZ[0]); meanPi += w * p.pi;
      if (w > 1e-14) active.push({ p, w, half });
    });
    if (halfMass.some(m => m === 0)) return { n: lengths.length, stable: false,
      diagnostics: { samples: samples.length, ess: posterior.ess, prior: 'reference-defaults-not-population-fitted' } };
    const positiveMass = 1 - expectedZero;
    const maxDay = options.maxDay || CONFIG.maxDay;
    const halves = [new Float64Array(maxDay + 1), new Float64Array(maxDay + 1)];
    let retained = 0, lastDay = maxDay;
    for (let x = 1; x <= maxDay; x++) {
      for (const { p, w, half } of active) halves[half][x] += w * Math.exp(logGP(x, p.lambda, p.xi) - p.logZ[0]);
      retained += halves[0][x] + halves[1][x];
      if (x >= 120 && retained / positiveMass > 1 - 1e-5) { lastDay = x; break; }
    }
    const first = summarize(halves[0].slice(0, lastDay + 1)), second = summarize(halves[1].slice(0, lastDay + 1));
    const combined = new Float64Array(lastDay + 1);
    // The two summaries have been normalized. Restore their original mass before mixing.
    for (let x = 1; x <= lastDay; x++) combined[x] = first.pmf[x] * first.total + second.pmf[x] * second.total;
    const prediction = summarize(combined);
    let disagreement = 0;
    for (let x = 1; x <= lastDay; x++) disagreement = Math.max(disagreement, Math.abs(first.cdf(x) - second.cdf(x)));
    const halfESS = halfMass.map((m, i) => m * m / halfSquares[i]);
    const retainedMass = retained / positiveMass;
    const stable = posterior.ess >= 128 && halfESS.every(n => n >= 40) && disagreement <= .05 && retainedMass >= .999;
    return { ...prediction, n: lengths.length, model: CONFIG.version, stable,
      diagnostics: { samples: samples.length, ess: posterior.ess, halfESS, disagreement, retainedMass, meanPi, prior: 'reference-defaults-not-population-fitted' } };
  }
  let defaultParticles;
  const cache = new Map(), observationCache = new Map();
  function fit(lengths) {
    if (!Array.isArray(lengths) || lengths.some(x => !Number.isInteger(x) || x < 1 || x > CONFIG.maxDay)) throw new Error('Invalid cycle lengths.');
    const key = [...lengths].sort((a, b) => a - b).join(',');
    if (cache.has(key)) return cache.get(key);
    if (!defaultParticles) defaultParticles = drawParticles();
    let result = infer(lengths, defaultParticles, observationCache);
    if (!result.stable && lengths.length) {
      // A defensive mixture proposal retains the full reference prior as half of
      // q. Correcting weights by p(theta)/q(theta) keeps the same target posterior.
      result = infer(lengths, drawParticles(65536, CONFIG.seed + 1, lengths));
      result.diagnostics.adaptiveProposal = true;
    }
    if (cache.size >= 24) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  }
  root.CycleResearch = { CONFIG, logGP, logNormalizer, skipWeights, likelihood, particle, drawParticles, posteriorWeights, summarize, infer, fit };
})(globalThis);
