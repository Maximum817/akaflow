(function () {
  'use strict';
  const M = CycleModel, $ = id => document.getElementById(id), KEY = 'akaflo.records.v1';
  const blank = () => ({ version: 1, context: 'natural', periods: [], entries: [] });
  let state = blank(), demo = false, editingStart = null, toastTimer;
  let worker = null, requestId = 0, predictionKey = '', forecastResult = null, backtestResult = undefined, workerError = '';
  let month = M.today().slice(0, 7) + '-01';
  const text = (id, value) => { $(id).textContent = value; };
  function format(iso, options = { month: 'short', day: 'numeric' }) {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
  }
  function notify(message) {
    text('toast', message); $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
  }
  function commit(candidate) {
    const checked = M.validate(candidate);
    if (!demo) {
      try { localStorage.setItem(KEY, JSON.stringify(checked)); }
      catch (_) { throw new Error('Could not save in this browser. Check storage permissions or export your records.'); }
    }
    state = checked;
    render();
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? M.validate(JSON.parse(raw)) : blank();
    } catch (_) {
      state = blank();
      notify('Saved records could not be read. Nothing has been overwritten. Check your backup before saving new records.');
    }
  }
  function element(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }
  function route() {
    const view = ['today', 'calendar', 'insights', 'science', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'view-' + view; });
    document.querySelectorAll('[data-view]').forEach(el => {
      const active = el.dataset.view === view;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
  }
  function requestPredictions() {
    const key = JSON.stringify([state.periods, state.context, M.today()]);
    if (key === predictionKey) return;
    predictionKey = key;
    forecastResult = null; backtestResult = undefined; workerError = '';
    // Stop stale work after record edits rather than queueing old health histories.
    if (worker) worker.terminate();
    const id = ++requestId;
    try {
      worker = new Worker('./prediction-worker.js');
      worker.onmessage = event => {
        if (event.data.id !== requestId) return;
        if (event.data.type === 'forecast') forecastResult = event.data.forecast;
        else if (event.data.type === 'backtest') backtestResult = event.data.backtest;
        else { workerError = event.data.message; if (!forecastResult) forecastResult = {available:false,reason:'Unable to calculate a stable prediction. Your records are still saved.'}; }
        render();
      };
      worker.onerror = () => {
        if (id !== requestId) return;
        workerError = 'Prediction worker unavailable.';
        forecastResult = {available:false,reason:'Your browser could not start the prediction calculation. Your records are still saved.'};
        render();
      };
      worker.postMessage({ id, state, asOf: M.today() });
    } catch (_) {
      workerError = 'Prediction worker unavailable.';
      forecastResult = {available:false,reason:'Your browser could not start the prediction calculation. Your records are still saved.'};
    }
  }
  function currentForecast() {
    return forecastResult || {available:false,reason:'Calculating your personal prediction on this device…'};
  }
  function render() {
    requestPredictions();
    const now = M.today(), f = currentForecast();
    const last = state.periods.at(-1);
    text('today-date', format(now, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase());
    $('demo-banner').hidden = !demo;
    $('context').value = state.context;
    if (last) {
      const day = M.dayNumber(now) - M.dayNumber(last.start) + 1;
      text('cycle-kicker', 'Cycle day'); text('cycle-day', String(day));
      text('cycle-detail', 'Since ' + format(last.start));
      text('cycle-label', state.context === 'natural' ? 'Your own rhythm' : 'Tracking only');
      text('cycle-footnote', 'Day count is not an ovulation or phase estimate.');
    } else {
      text('cycle-kicker', 'Every cycle is personal');
      $('cycle-day').replaceChildren(document.createTextNode('Hello'), element('span', '', 'you.'));
      text('cycle-detail', 'Start with your last period'); text('cycle-label', "Let's get to know you");
      text('cycle-footnote', 'Your body has its own timeline.');
    }
    $('forecast-summary').hidden = !f.available; $('forecast-empty').hidden = f.available;
    if (f.available) {
      text('prediction-heading', f.pastWindow ? 'Time for a record check.' : 'A little look ahead.');
      text('prediction-description', f.pastWindow ? "This estimate has passed. Check for a missing period entry. We haven't shifted your prediction or assumed why your cycle changed." : `Using ${f.n} recorded intervals, with missed entries considered probabilistically. Research model · reference priors.`);
      text('forecast-date', format(f.start, { day: 'numeric', month: 'long' }));
      text('forecast-range', format(f.earliest) + ' – ' + format(f.latest) + (f.pastWindow ? ' · original estimate' : ' · estimated range'));
      renderDistribution(f);
    } else {
      text('prediction-heading', state.context === 'natural' ? 'A forecast that learns from you.' : 'A space to keep tracking.');
      text('prediction-description', f.reason);
    }
    renderCalendar(f); renderHistory(); renderInsights(); route();
  }
  function renderDistribution(f) {
    const cdf = x => x < 1 ? 0 : x >= f.cumulative.length - 1 ? 1 : f.cumulative[Math.floor(x)];
    const start = Math.max(1, f.low - 4), end = f.high + 4;
    const step = Math.max(1, Math.ceil((end - start) / 45));
    const points = [];
    for (let d = start; d <= end; d += step) points.push({ d, p: cdf(d + step / 2) - cdf(Math.max(0, d - step / 2)) });
    const max = Math.max(...points.map(p => p.p));
    $('mini-chart').replaceChildren(...points.map(({ d, p }) => {
      const bar = element('i', d >= f.low && d <= f.high ? 'central' : '');
      bar.style.height = Math.max(2, p / max * 100) + '%'; bar.title = `Around ${d} days`;
      return bar;
    }));
    text('chart-start', String(start)); text('chart-end', String(end));
  }
  function renderCalendar(f) {
    text('month-label', format(month, { month: 'long', year: 'numeric' }));
    const first = new Date(month + 'T00:00:00Z'), offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const cells = Array.from({ length: offset }, () => element('div'));
    for (let day = 1; day <= days; day++) {
      const iso = month.slice(0, 8) + String(day).padStart(2, '0');
      // A start without an end marks only that recorded day; never invent bleed days.
      const recorded = state.periods.some(p => iso >= p.start && iso <= (p.end || p.start));
      const predicted = f.available && !f.pastWindow && iso >= f.earliest && iso <= f.latest && iso > f.latestStart;
      const button = element('button', 'calendar-day', String(day));
      button.type = 'button';
      if (iso === M.today()) button.classList.add('today');
      if (recorded) { button.classList.add('recorded'); button.append(element('small', '', 'Recorded')); }
      else if (predicted) { button.classList.add('predicted'); button.append(element('small', '', 'Estimated')); }
      const entry = state.entries.some(e => e.date === iso);
      if (entry) button.append(element('span', 'day-entry', '•'));
      button.setAttribute('aria-label', format(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (recorded ? ', recorded period' : predicted ? ', predicted start range' : '') + (entry ? ', check-in saved' : ''));
      button.disabled = iso > M.today();
      button.addEventListener('click', () => openCheckin(iso)); cells.push(button);
    }
    $('calendar-grid').replaceChildren(...cells);
  }
  function renderHistory() {
    const intervals = M.intervals(state.periods);
    const rows = [...state.periods].reverse().map(p => {
      const row = element('div', 'history-row'), label = element('div', '', format(p.start, { day: 'numeric', month: 'short', year: 'numeric' }) + (p.end ? ' – ' + format(p.end) : ' · start only'));
      const interval = intervals.find(i => i.end === p.start);
      if (interval) label.append(element('small', '', `${interval.length} days since previous start${p.excludePrevious ? ' · excluded from predictions' : ''}${interval.length > 45 && !p.excludePrevious ? ' · check for an incomplete record' : ''}`));
      const edit = element('button', 'text-button', 'Edit ↗'); edit.type = 'button';
      edit.setAttribute('aria-label', 'Edit period starting ' + format(p.start));
      edit.addEventListener('click', () => openPeriod(p)); row.append(label, edit); return row;
    });
    $('history').replaceChildren(...(rows.length ? rows : [element('p', 'muted', 'Your period history will appear here.')]));
  }
  function renderInsights() {
    const intervals = M.intervals(state.periods), lengths = intervals.filter(i => !i.excluded).map(i => i.length);
    const mean = lengths.length ? (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1) : '—';
    const stat = (label, value, detail) => { const el = element('div', 'stat'); el.append(element('div', 'eyebrow', label), element('strong', '', value), element('span', '', detail)); return el; };
    $('insight-stats').replaceChildren(stat('AVERAGE CYCLE', mean, 'days · eligible completed cycles'), stat('YOUR OBSERVED RANGE', lengths.length ? Math.min(...lengths) + '–' + Math.max(...lengths) : '—', 'days · historical, not a forecast'), stat('CYCLES RECORDED', String(lengths.length), 'eligible completed cycles'));
    const max = Math.max(40, ...intervals.map(i => i.length));
    $('cycle-bars').replaceChildren(...(intervals.length ? intervals.slice(-12).map(i => {
      const row = element('div', 'bar-row' + (i.excluded ? ' excluded' : ''));
      const track = element('div', 'bar-track'), bar = element('i'); bar.style.width = i.length / max * 100 + '%'; track.append(bar);
      row.append(element('span', '', format(i.start)), track, element('span', '', i.length + ' days' + (i.excluded ? ' *' : ''))); return row;
    }) : [element('p', 'muted', 'Log two period starts to see a completed cycle.')]));
    const b = backtestResult;
    if (b && b.n > 0) {
      const stats = element('div', 'backtest-stats');
      for (const [value, label] of [[b.mae.toFixed(1) + ' days', 'Model mean absolute error'], [b.baselineMAE.toFixed(1) + ' days', 'Historical median error'], [Math.round(b.coverage * 100) + '%', 'Observed range coverage']]) {
        const part = element('div'); part.append(element('strong', '', value), element('span', '', label)); stats.append(part);
      }
      $('backtest').replaceChildren(element('p', 'muted', `${b.n} held-out cycle${b.n === 1 ? '' : 's'} tested${demo ? ' · sample data only' : ''}. ${b.skipped} checks withheld for numerical instability. No future cycles were used to make each prediction.`), stats);
    } else $('backtest').replaceChildren(element('p', 'muted', b === undefined ? (workerError ? 'Prediction evaluation is unavailable.' : 'Checking past predictions on this device…') : 'No stable held-out predictions yet. At least 5 period starts are needed for the first check.'));
    const counts = M.symptoms.map(s => [s, state.entries.filter(e => e.symptoms.includes(s)).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    $('symptom-summary').replaceChildren(...(counts.length ? counts.map(([s, n]) => { const row = element('div', 'history-row'); row.append(element('span', '', s), element('span', '', `${n} check-in${n === 1 ? '' : 's'}`)); return row; }) : [element('p', 'muted', 'Your check-ins will appear here as you add them.')]));
  }
  function openPeriod(period = null) {
    editingStart = period ? period.start : null;
    text('period-title', period ? 'Edit period' : 'Log a period');
    $('period-start').max = $('period-end').max = M.today();
    $('period-start').min = $('period-end').min = '1900-01-01';
    $('period-start').value = period ? period.start : M.today();
    $('period-end').value = period ? period.end : '';
    $('period-exclude').checked = period ? period.excludePrevious : false;
    $('remove-period').hidden = !period; text('period-error', '');
    $('period-dialog').showModal();
  }
  function fillEntry(date) {
    const entry = state.entries.find(e => e.date === date);
    document.querySelectorAll('[name=symptom]').forEach(input => { input.checked = entry ? entry.symptoms.includes(input.value) : false; });
    $('entry-mood').value = entry ? entry.mood : ''; $('entry-note').value = entry ? entry.note : '';
    $('remove-entry').hidden = !entry; text('entry-error', '');
  }
  function openCheckin(date = M.today()) {
    $('entry-date').max = M.today(); $('entry-date').min = '1900-01-01'; $('entry-date').value = date;
    fillEntry(date); $('checkin-dialog').showModal();
  }
  function demoData() {
    const lengths = [28, 30, 29, 27, 31, 28, 29, 30], starts = [M.addDays(M.today(), -17)];
    for (const length of [...lengths].reverse()) starts.unshift(M.addDays(starts[0], -length));
    return { version: 1, context: 'natural', periods: starts.map(start => ({ start, end: M.addDays(start, 4), excludePrevious: false })), entries: [{ date: M.addDays(M.today(), -1), symptoms: ['Fatigue'], mood: 'Okay', note: 'Sample check-in' }] };
  }
  document.querySelectorAll('[data-action=period]').forEach(b => b.addEventListener('click', () => openPeriod()));
  document.querySelectorAll('[data-action=checkin]').forEach(b => b.addEventListener('click', () => openCheckin()));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $('period-form').addEventListener('submit', e => {
    e.preventDefault();
    try {
      const period = { start: $('period-start').value, end: $('period-end').value, excludePrevious: $('period-exclude').checked };
      const periods = state.periods.filter(p => p.start !== editingStart);
      // Reject duplicate starts rather than silently replacing another record.
      commit({ ...state, periods: [...periods, period] });
      $('period-dialog').close(); notify(demo ? 'Sample period saved in demo only.' : 'Period saved on this device.');
    } catch (err) { text('period-error', err.message); }
  });
  $('remove-period').addEventListener('click', () => {
    if (!confirm('Delete this period? Removing a start also changes the surrounding cycle intervals.')) return;
    try {
      const periods = state.periods.filter(p => p.start !== editingStart).map(p => ({ ...p }));
      // Deleting a middle start creates an ambiguous merged interval. Exclude it.
      const next = periods.find(p => p.start > editingStart);
      if (next) next.excludePrevious = true;
      commit({ ...state, periods }); $('period-dialog').close(); notify('Period deleted. Any newly merged interval is excluded.');
    } catch (err) { text('period-error', err.message); }
  });
  $('symptom-options').replaceChildren(...M.symptoms.map(s => {
    const label = element('label'), input = element('input'); input.type = 'checkbox'; input.name = 'symptom'; input.value = s;
    label.append(input, element('span', '', s)); return label;
  }));
  $('entry-date').addEventListener('change', () => fillEntry($('entry-date').value));
  $('checkin-form').addEventListener('submit', e => {
    e.preventDefault();
    try {
      const entry = { date: $('entry-date').value, symptoms: [...document.querySelectorAll('[name=symptom]:checked')].map(i => i.value), mood: $('entry-mood').value, note: $('entry-note').value };
      commit({ ...state, entries: [...state.entries.filter(x => x.date !== entry.date), entry] });
      $('checkin-dialog').close(); notify(demo ? 'Sample check-in saved in demo only.' : 'Check-in saved on this device.');
    } catch (err) { text('entry-error', err.message); }
  });
  $('remove-entry').addEventListener('click', () => {
    if (!confirm('Delete this check-in?')) return;
    try { commit({ ...state, entries: state.entries.filter(x => x.date !== $('entry-date').value) }); $('checkin-dialog').close(); notify('Check-in deleted.'); }
    catch (err) { text('entry-error', err.message); }
  });
  $('context').addEventListener('change', () => {
    try { commit({ ...state, context: $('context').value }); notify('Tracking context saved. Review your eligible history after a change.'); }
    catch (err) { $('context').value = state.context; notify(err.message); }
  });
  $('try-demo').addEventListener('click', () => { if (!demo) { demo = true; state = M.validate(demoData()); render(); notify('Sample data only. Your saved records are untouched.'); } });
  $('exit-demo').addEventListener('click', () => { demo = false; load(); render(); });
  $('export-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
    const link = element('a'); link.href = url; link.download = `akaflo-${demo ? 'SAMPLE-' : ''}${M.today()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import-data').addEventListener('click', () => { if (demo) { notify('Leave demo before importing your records.'); return; } $('import-file').click(); });
  $('import-file').addEventListener('change', async () => {
    const file = $('import-file').files[0]; if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('Backup is too large (maximum 5 MB).');
      const candidate = M.validate(JSON.parse(await file.text()));
      if (confirm(`Replace the records in this browser with ${candidate.periods.length} periods and ${candidate.entries.length} check-ins? Export a backup first if needed.`)) {
        commit(candidate); notify('Backup imported.');
      }
    } catch (err) { notify('Could not import: ' + err.message); }
    $('import-file').value = '';
  });
  $('erase-data').addEventListener('click', () => {
    if (demo) { notify('Leave demo to manage your saved records.'); return; }
    if (!confirm('Permanently delete all akaflow records from this browser? This cannot be undone without a backup.')) return;
    try { localStorage.removeItem(KEY); state = blank(); render(); notify('All akaflow records removed from this browser.'); }
    catch (_) { notify('Could not remove records. Check browser permissions.'); }
  });
  function shiftMonth(delta) {
    const d = new Date(month + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + delta); month = d.toISOString().slice(0, 10);
    renderCalendar(currentForecast());
  }
  $('month-prev').addEventListener('click', () => shiftMonth(-1)); $('month-next').addEventListener('click', () => shiftMonth(1));
  $('month-today').addEventListener('click', () => { month = M.today().slice(0, 7) + '-01'; renderCalendar(currentForecast()); });
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', e => { if (e.key === KEY && !demo) { load(); render(); notify('Records updated from another tab.'); } });
  window.addEventListener('pageshow', () => { render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  load(); render();
})();
