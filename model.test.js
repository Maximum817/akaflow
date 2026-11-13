/* Runs with Node or JavaScriptCore, no packages required. */
if (typeof require === 'function') require('./model.js');
else load('model.js');
const M = CycleModel;
let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); passed++; }
function near(a, b, epsilon, message) { assert(Math.abs(a - b) < epsilon, `${message}: ${a} != ${b}`); }
function rejects(fn, message) { let failed = false; try { fn(); } catch (_) { failed = true; } assert(failed, message); }
function periods(lengths) {
  let start = '2020-01-01';
  return [{ start, end: '', excludePrevious: false }, ...lengths.map(d => ({ start: start = M.addDays(start, d), end: '', excludePrevious: false }))];
}
near(M.studentCDF(0, 10), .5, 1e-12, 'Symmetry at zero');
near(M.studentCDF(1, 1), .75, 1e-10, 'Cauchy closed form');
near(M.studentCDF(2.2281388519649385, 10), .975, 1e-9, 'Known t quantile');
near(M.studentCDF(-1.5332062740589432, 4), .1, 1e-9, 'Known lower-tail quantile');
near(M.studentCDF(1.6448536269514722, 1000000), .95, 1e-6, 'Normal limit');
assert(M.addDays('2024-02-28', 1) === '2024-02-29', 'Leap year');
assert(M.addDays('2025-03-29', 2) === '2025-03-31', 'DST-independent arithmetic');
assert(M.addDays('2025-12-31', 1) === '2026-01-01', 'Year boundary');
rejects(() => M.dayNumber('2025-02-29'), 'Reject impossible date');
rejects(() => M.dayNumber('2026-13-01'), 'Reject invalid month');
rejects(() => M.fit([28, NaN]), 'Reject NaN');
rejects(() => M.fit([28, 0]), 'Reject zero interval');
rejects(() => M.fit([28.5]), 'Reject fractional interval');
const p = M.fit([28, 29, 30]);
near(p.mu, 29, 1e-12, 'Conjugate posterior mean');
near(p.scale ** 2, 26 * 4.25 / (3.5 * 3.25), 1e-12, 'Conjugate posterior predictive scale');
assert(p.df === 7, 'Posterior degrees of freedom');
assert(p.low <= p.median && p.median <= p.high, 'Quantile order');
near(p.cdf(.5), 0, 1e-12, 'Positive truncation');
let total = 0; for (let d = 1; d <= 10000; d++) total += p.probability(d);
near(total, 1, 1e-9, 'Discrete probabilities sum to one');
const stable = M.fit(Array(20).fill(29));
assert(stable.high - stable.low < p.high - p.low, 'Repeated regular cycles narrow uncertainty');
const irregular = M.fit([18, 45, 22, 60, 29]);
assert(irregular.high - irregular.low > p.high - p.low, 'Variable cycles widen uncertainty');
const long = M.fit([28, 29, 28, 90]);
assert(long.high - long.low > p.high - p.low, 'Long records are not silently discarded');
assert(!M.forecast(periods([28, 28])).available, 'Require three completed cycles');
assert(M.forecast(periods([28, 28, 28]), 'natural', '2020-04-01').available, 'Forecast after three completed cycles');
for (const context of ['hormonal', 'pregnant', 'postpartum', 'other']) assert(!M.forecast(periods([28, 28, 28]), context).available, 'Pause in ' + context);
const excluded = periods([28, 56, 28]); excluded[2].excludePrevious = true;
assert(!M.forecast(excluded).available, 'Exclusions reduce eligible count');
assert(M.intervals([...excluded].reverse())[1].length === 56, 'Sort before differencing; do not split missed records');
const overdue = M.forecast(periods([28, 28, 28]), 'natural', '2021-01-01');
assert(overdue.pastWindow, 'Overdue record review');
const earlier = M.forecast(periods([28, 28, 28]), 'natural', '2020-04-01');
assert(overdue.start === earlier.start, 'Do not move overdue predictions');
assert(M.backtest(periods([28, 29, 30])) === null, 'No test without held-out cycle');
const b = M.backtest(periods([28, 29, 30, 31, 27, 60]));
assert(b.n === 3, 'Chronological held-out count');
assert(b.results[0].predicted === M.fit([28, 29, 30]).median, 'No future leakage');
assert(b.results[0].baseline === 29, 'Historical median comparator');
const before = M.backtest(periods([28, 29, 30, 31]));
assert(before.results[0].predicted === b.results[0].predicted, 'Later cycles cannot alter earlier prediction');
const valid = { version: 1, context: 'natural', periods: periods([28, 29, 30]), entries: [] };
assert(M.validate(valid).periods.length === 4, 'Valid backup');
rejects(() => M.validate({ ...valid, periods: [...valid.periods, valid.periods[0]] }), 'Duplicate starts rejected');
rejects(() => M.validate({ ...valid, periods: [{ start: '2099-01-01' }] }), 'Future starts rejected');
rejects(() => M.validate({ ...valid, periods: [{ start: '2020-01-01', end: '2020-01-30' }, { start: '2020-01-29' }] }), 'Overlap rejected');
rejects(() => M.validate({ ...valid, entries: [{ date: '2020-01-01', symptoms: ['Invented'], mood: '', note: '' }] }), 'Unsupported symptoms rejected');
rejects(() => M.validate({ ...valid, entries: [{ date: '2020-01-01', symptoms: [], mood: '', note: 'x'.repeat(1001) }] }), 'Oversize notes rejected');
rejects(() => M.validate({ ...valid, version: 2 }), 'Unsupported schema rejected');
for (const data of [[], [1, 1, 1], [3660, 3660, 3660], [1, 90, 3660]]) {
  const model = M.fit(data);
  assert(model.low >= 1 && Number.isFinite(model.high) && model.high >= model.median, 'Finite positive extreme-case prediction');
}
const output = `${passed} assertions passed.`;
if (typeof console !== 'undefined') console.log(output); else print(output);
