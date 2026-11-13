/* Date, record, and evaluation adapter for the research model. See SCIENCE.md. */
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
  const fit = lengths => CycleResearch.fit(lengths);
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
    if (!model.stable) return { available: false, reason: 'The numerical prediction is not stable enough for these records. Keep tracking and review incomplete intervals; no date is shown.', diagnostics: model.diagnostics };
    const elapsed = dayNumber(asOf) - dayNumber(last);
    return { available: true, ...model, start: addDays(last, model.median), earliest: addDays(last, model.low), latest: addDays(last, model.high), elapsed,
      pastWindow: elapsed > model.high, latestStart: last };
  }
  function backtest(periods) {
    const rows = intervals(periods), previous = [], results = [];
    let skipped = 0;
    rows.forEach(row => {
      if (row.excluded) return;
      if (previous.length >= 3) {
        const p = fit(previous);
        const baseline = [...previous].sort((a, b) => a - b);
        const mid = Math.floor(baseline.length / 2);
        const median = baseline.length % 2 ? baseline[mid] : (baseline[mid - 1] + baseline[mid]) / 2;
        if (p.stable) results.push({ actual: row.length, predicted: p.median, low: p.low, high: p.high, baseline: median });
        else skipped++;
      }
      previous.push(row.length);
    });
    if (!results.length) return skipped ? { n: 0, skipped, results: [] } : null;
    const avg = f => results.reduce((s, r) => s + f(r), 0) / results.length;
    return { n: results.length, skipped, mae: avg(r => Math.abs(r.actual - r.predicted)), baselineMAE: avg(r => Math.abs(r.actual - r.baseline)), coverage: avg(r => +(r.actual >= r.low && r.actual <= r.high)), results };
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
  root.CycleModel = { dayNumber, addDays, today, fit, forecast, backtest, intervals, validate, symptoms };
})(globalThis);
