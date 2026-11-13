/* Original, unvalidated Bayesian baseline. See SCIENCE.md for assumptions. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  function dayNumber(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Use a valid calendar date.');
    const ms = Date.parse(iso + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) throw new Error('Use a valid calendar date.');
    return ms / DAY;
  }
  function addDays(iso, days) { return new Date((dayNumber(iso) + days) * DAY).toISOString().slice(0, 10); }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function logGamma(z) {
    const p = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    let x = .9999999999998099;
    p.forEach((v, i) => { x += v / (z + i + 1); });
    const t = z + p.length - .5;
    return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
  }
  function betaFraction(a, b, x) {
    const tiny = 1e-30;
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c; h *= delta;
      if (Math.abs(delta - 1) < 3e-12) return h;
    }
    throw new Error('Prediction calculation did not converge.');
  }
  function betaI(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    return x < (a + 1) / (a + b + 2) ? factor * betaFraction(a, b, x) / a : 1 - factor * betaFraction(b, a, 1 - x) / b;
  }
  function studentCDF(t, df) {
    const v = .5 * betaI(df / (df + t * t), df / 2, .5);
    return t >= 0 ? 1 - v : v;
  }
  function fit(lengths) {
    if (!Array.isArray(lengths) || lengths.some(x => !Number.isInteger(x) || x < 1 || x > 3660)) throw new Error('Invalid cycle lengths.');
    // All eligible completed cycles are used; no automatic outlier removal.
    const n = lengths.length;
    const mean = n ? lengths.reduce((a, b) => a + b, 0) / n : 29;
    const ss = lengths.reduce((s, x) => s + (x - mean) ** 2, 0);
    const k0 = .25, mu0 = 29, a0 = 2, b0 = 25;
    const k = k0 + n, mu = (k0 * mu0 + n * mean) / k;
    const alpha = a0 + n / 2;
    const beta = b0 + ss / 2 + (k0 * n * (mean - mu0) ** 2) / (2 * k);
    const scale = Math.sqrt(beta * (k + 1) / (alpha * k)), df = 2 * alpha;
    // A continuous Student-t approximation discretized to positive calendar days.
    // Conditioning on X >= 0.5 means rounding can never produce a zero-day cycle.
    const lowerMass = studentCDF((.5 - mu) / scale, df);
    const cdf = x => Math.max(0, Math.min(1, (studentCDF((x - mu) / scale, df) - lowerMass) / (1 - lowerMass)));
    function quantile(p) {
      let lo = .5, hi = Math.max(100, mu + scale * 10);
      while (cdf(hi) < p) hi *= 2;
      for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (cdf(mid) < p) lo = mid; else hi = mid; }
      return Math.max(1, Math.round((lo + hi) / 2));
    }
    return { n, mu, scale, df, cdf, quantile, median: quantile(.5), low: quantile(.1), high: quantile(.9),
      probability: d => cdf(d + .5) - cdf(d - .5) };
  }
  function intervals(periods) {
    const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
    return sorted.slice(1).map((p, i) => ({ start: sorted[i].start, end: p.start, length: dayNumber(p.start) - dayNumber(sorted[i].start), excluded: p.excludePrevious === true }));
  }
  function forecast(periods, context = 'natural', asOf = today()) {
    const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
    const eligible = intervals(sorted).filter(x => !x.excluded).map(x => x.length);
    if (context !== 'natural') return { available: false, reason: 'Predictions are paused for this tracking context. You can still keep your records.' };
    if (eligible.length < 3) return { available: false, reason: `Log at least 4 period starts to learn from 3 completed cycles. ${eligible.length} eligible cycles so far.` };
    const model = fit(eligible), last = sorted[sorted.length - 1].start;
    const elapsed = dayNumber(asOf) - dayNumber(last);
    return { available: true, ...model, start: addDays(last, model.median), earliest: addDays(last, model.low), latest: addDays(last, model.high), elapsed,
      pastWindow: elapsed > model.high, latestStart: last };
  }
  function backtest(periods) {
    const rows = intervals(periods), previous = [], results = [];
    rows.forEach(row => {
      if (row.excluded) return;
      if (previous.length >= 3) {
        const p = fit(previous);
        const baseline = [...previous].sort((a, b) => a - b);
        const mid = Math.floor(baseline.length / 2);
        const median = baseline.length % 2 ? baseline[mid] : (baseline[mid - 1] + baseline[mid]) / 2;
        results.push({ actual: row.length, predicted: p.median, low: p.low, high: p.high, baseline: median });
      }
      previous.push(row.length);
    });
    if (!results.length) return null;
    const avg = f => results.reduce((s, r) => s + f(r), 0) / results.length;
    return { n: results.length, mae: avg(r => Math.abs(r.actual - r.predicted)), baselineMAE: avg(r => Math.abs(r.actual - r.baseline)), coverage: avg(r => +(r.actual >= r.low && r.actual <= r.high)), results };
  }
  const symptoms = ['Cramps', 'Headache', 'Bloating', 'Tender breasts', 'Fatigue', 'Acne'];
  function validate(data, asOf = today()) {
    if (!data || data.version !== 1 || !Array.isArray(data.periods) || !Array.isArray(data.entries) || !['natural', 'hormonal', 'pregnant', 'postpartum', 'other'].includes(data.context)) throw new Error('This is not a supported akaflow backup.');
    if (data.periods.length > 2000 || data.entries.length > 10000) throw new Error('Backup is too large.');
    const seen = new Set();
    const periods = data.periods.map(p => {
      dayNumber(p.start);
      if (p.start > asOf || p.start < '1900-01-01' || seen.has(p.start)) throw new Error('Period starts must be unique, past calendar dates.');
      seen.add(p.start);
      if (p.end) {
        const duration = dayNumber(p.end) - dayNumber(p.start);
        if (duration < 0 || duration > 60 || p.end > asOf) throw new Error('Check the period end date (maximum 61 recorded days).');
      }
      return { start: p.start, end: p.end || '', excludePrevious: p.excludePrevious === true };
    }).sort((a, b) => a.start.localeCompare(b.start));
    periods.forEach((p, i) => { if (i && periods[i - 1].end && periods[i - 1].end >= p.start) throw new Error('Recorded periods cannot overlap.'); });
    intervals(periods).forEach(p => { if (p.length > 3660) throw new Error('Split or remove gaps longer than 10 years.'); });
    seen.clear();
    const entries = data.entries.map(e => {
      dayNumber(e.date);
      if (e.date > asOf || e.date < '1900-01-01' || seen.has(e.date) || !Array.isArray(e.symptoms) || e.symptoms.some(s => !symptoms.includes(s)) || !['', 'Low', 'Okay', 'Good'].includes(e.mood) || typeof e.note !== 'string' || e.note.length > 1000) throw new Error('Check the daily entries in this backup.');
      seen.add(e.date);
      return { date: e.date, symptoms: [...new Set(e.symptoms)], mood: e.mood, note: e.note };
    });
    return { version: 1, context: data.context, periods, entries };
  }
  root.CycleModel = { dayNumber, addDays, today, fit, forecast, backtest, intervals, validate, symptoms, studentCDF };
})(globalThis);
