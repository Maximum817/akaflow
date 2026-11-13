/* Runs with Node or JavaScriptCore, no packages required. */
if (typeof require === 'function') { require('./research-model.js'); require('./model.js'); }
else { load('research-model.js'); load('model.js'); }
const M = CycleModel;
let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); passed++; }
function near(a, b, epsilon, message) { assert(Math.abs(a - b) < epsilon, `${message}: ${a} != ${b}`); }
function rejects(fn, message) { let failed = false; try { fn(); } catch (_) { failed = true; } assert(failed, message); }
function periods(lengths) {
  let start = '2020-01-01';
  return [{ start, end: '', excludePrevious: false }, ...lengths.map(d => ({ start: start = M.addDays(start, d), end: '', excludePrevious: false }))];
}
assert(M.addDays('2024-02-28', 1) === '2024-02-29', 'Leap year');
assert(M.addDays('2025-03-29', 2) === '2025-03-31', 'DST-independent arithmetic');
assert(M.addDays('2025-12-31', 1) === '2026-01-01', 'Year boundary');
rejects(() => M.dayNumber('2025-02-29'), 'Reject impossible date');
rejects(() => M.dayNumber('2026-13-01'), 'Reject invalid month');
rejects(() => M.fit([28, NaN]), 'Reject NaN');
rejects(() => M.fit([28, 0]), 'Reject zero interval');
rejects(() => M.fit([28.5]), 'Reject fractional interval');
const R = CycleResearch;
const fixture = typeof require === 'function' ? require('./reference-fixtures.json') : JSON.parse(readFile('reference-fixtures.json'));
for (const k of fixture.kernels) near(R.logGP(k.x,k.lam,k.xi),k.log_pmf,1e-10,'Independent Python GP kernel');
for (const xi of [-.9,-.6,-.2]) {
  let sum=0; const z=R.logNormalizer(40,xi);
  for(let x=0;x<500;x++) sum+=Math.exp(R.logGP(x,40,xi)-z);
  near(sum,1,1e-10,'Finite underdispersed normalization');
}
assert(R.logGP(100,40,-.6) === -Infinity,'Zero beyond negative-xi support');
near(R.skipWeights(.2).reduce((a,b)=>a+b,0),1,1e-12,'Inclusive truncated geometric normalizes');
near(R.skipWeights(0)[0],1,1e-12,'Zero skip probability');
rejects(()=>R.skipWeights(1),'Reject degenerate skip distribution');
const particles=fixture.particles.map(p=>R.particle(...p));
for (const c of fixture.cases) {
  const posterior=R.posteriorWeights(c.history,particles).weights;
  posterior.forEach((w,i)=>near(w,c.weights[i],1e-10,'Independent posterior weight'));
  const prediction=R.infer(c.history,particles,null,{maxDay:240});
  // The fixture intentionally retains exactly 240 days. Re-normalize the JS
  // early-stopped PMF over the identical support if necessary.
  let mass=0;for(let d=1;d<=240;d++)mass+=prediction.probability(d);
  // Stop early only after >.99999 mass: tolerate the explicit tail tolerance.
  for(let d=1;d<=240;d++)near(prediction.probability(d)/mass,c.pmf[d],2e-5,'Independent predictive PMF');
}
const p=M.fit([28,29,30]);
assert(p.stable,'Stable standard history');
assert(p.low<=p.median&&p.median<=p.high,'Quantile order');
let total=0;for(let d=1;d<=3660;d++)total+=p.probability(d);
near(total,1,1e-10,'Positive predictive mass sums to one');
near(p.cdf(.5),0,1e-12,'No zero-day period prediction');
assert(p.diagnostics.retainedMass>=.999,'Predictive tail accounted for');
const stable=M.fit(Array(20).fill(29));
assert(stable.stable && stable.diagnostics.adaptiveProposal,'Proposal adaptation resolves prior-sampling degeneracy');
assert(stable.high-stable.low < p.high-p.low,'Consistent history narrows interval');
const double=M.fit([28,29,30,58]);
assert(double.median<35,'A double-length record is marginalized rather than averaged into a longer cycle');
assert(double.diagnostics.meanPi>p.diagnostics.meanPi,'Ambiguous gap increases missed-record propensity');
const unavailable=M.forecast(periods([1,1,1]),'natural','2020-04-01');
assert(!unavailable.available,'Numerical instability withholds forecast');
const savedSnapshot=JSON.stringify(periods([28,29,58]));
const unchangedRecords=JSON.parse(savedSnapshot);
M.forecast(unchangedRecords,'natural','2020-04-01');
assert(JSON.stringify(unchangedRecords)===savedSnapshot,'Latent skips never fabricate period records');
// A proposal density changes sampling, not the intended posterior weights.
const corrected=particles.map((p,i)=>({...p,logImportance:i%2 ? Math.log(2):Math.log(.5)}));
const correctedWeights=R.posteriorWeights([28,29,30],corrected).weights;
const referenceWeights=R.posteriorWeights([28,29,30],particles).weights;
near((correctedWeights[1]/correctedWeights[0])/(referenceWeights[1]/referenceWeights[0]),4,1e-10,'Importance density correction included');
const again=M.fit([30,28,29]);
assert(again===p,'Permutation-invariant inference cache');
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
const output = `${passed} assertions passed.`;
if (typeof console !== 'undefined') console.log(output); else print(output);
