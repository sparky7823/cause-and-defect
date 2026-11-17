(function () {
const { CHART_MAX_LATENCY, DATABASE_SAFE_CONNECTIONS, createInitialState, measureSystem, stepSimulation } = window.SimEngine;

const $ = (selector) => document.querySelector(selector);
const dashboard = $('#dashboard');
const lab = $('#lab');
const chart = $('#latencyChart');
const forecastLine = $('#forecastLine');
const actualLine = $('#actualLine');
const state = {
  running: false,
  paused: false,
  runId: 0,
  forecast: [],
  timeSeries: [],
  engine: createInitialState()
};

function readSettings() {
  return {
    maxServers: Number($('#maxServers').value),
    wafStrength: Number($('#wafStrength').value) / 100,
    poolPerServer: Number($('#poolSize').value),
    botShare: Number($('#botShare').value) / 100,
    autoscale: $('#autoscale').checked,
    wafEnabled: $('#wafEnabled').checked
  };
}

function resetSimulation(clearForecast = true) {
  state.runId++;
  state.running = false;
  state.paused = false;
  state.engine = createInitialState();
  state.timeSeries = [];
  if (clearForecast) state.forecast = [];
  forecastLine.setAttribute('points', state.forecast.map(pointText).join(' '));
  actualLine.setAttribute('points', '');
  $('#architecture').classList.remove('is-running');
  $('#clockLabel').textContent = 'READY · 60 SEC DRILL';
  $('#runButton').disabled = false;
  $('#runButton').innerHTML = 'Run 60-second drill <span>→</span>';
  $('#pauseButton').hidden = true;
  $('#pauseButton').textContent = 'Pause';
  $('#playbackNote').textContent = '60 seconds · accelerated playback';
  $('#feedback').classList.remove('show');
  $('#insightCard').classList.remove('revealed');
  $('#tryAgainButton').hidden = true;
  $('#chartInstruction').textContent = clearForecast
    ? 'Drag across the chart to draw your latency prediction before the test.'
    : 'Forecast saved. Run the drill to compare your dashed line with the outcome.';
  setInputsDisabled(false);
  renderSystem(measureSystem(state.engine, readSettings(), 0));
  $('#insightTitle').textContent = 'Every layer has a limit.';
  $('#insightText').textContent = 'Draw a forecast and run the drill to see where the bottleneck appears. Adding servers helps the app tier, but the database has its own connection budget.';
  $('#nextChallenge').textContent = 'Tune the pool before scaling to the ceiling.';
}

function setInputsDisabled(disabled) {
  ['#maxServers', '#wafStrength', '#poolSize', '#botShare', '#autoscale', '#wafEnabled']
    .forEach(selector => { $(selector).disabled = disabled; });
}

function pointText(point) { return `${point.x.toFixed(1)},${point.y.toFixed(1)}`; }

function chartPoint(event) {
  const rect = chart.getBoundingClientRect();
  return {
    x: Math.max(10, Math.min(610, (event.clientX - rect.left) / rect.width * 620)),
    y: Math.max(12, Math.min(152, (event.clientY - rect.top) / rect.height * 170))
  };
}

function paintForecast() {
  forecastLine.setAttribute('points', state.forecast.map(pointText).join(' '));
}

chart.addEventListener('pointerdown', event => {
  if (state.running) return;
  state.forecast = [chartPoint(event)];
  chart.setPointerCapture(event.pointerId);
  paintForecast();
  actualLine.setAttribute('points', '');
  $('#feedback').classList.remove('show');
  $('#chartInstruction').textContent = 'Keep dragging to sketch the whole 60-second wave.';
});
chart.addEventListener('pointermove', event => {
  if (!chart.hasPointerCapture(event.pointerId)) return;
  state.forecast.push(chartPoint(event));
  paintForecast();
});
chart.addEventListener('pointerup', event => {
  if (chart.hasPointerCapture(event.pointerId)) chart.releasePointerCapture(event.pointerId);
  if (state.forecast.length > 1) $('#chartInstruction').textContent = 'Forecast saved. Run the drill to compare your dashed line with the outcome.';
});
chart.addEventListener('pointercancel', () => {
  if (state.forecast.length > 1) $('#chartInstruction').textContent = 'Forecast saved. Run the drill to compare your dashed line with the outcome.';
});

function updateSettingLabels() {
  $('#maxServersValue').textContent = $('#maxServers').value;
  $('#wafValueLabel').textContent = $('#wafStrength').value;
  $('#poolValue').textContent = $('#poolSize').value;
  $('#botShareValue').textContent = $('#botShare').value;
}

function setNodeState(element, status) {
  element.classList.remove('healthy', 'degraded', 'critical');
  if (status) element.classList.add(status);
}

function renderServerDots(snapshot) {
  const group = $('#serverDots');
  group.replaceChildren();
  const visible = Math.min(snapshot.instances, 12);
  for (let index = 0; index < visible; index++) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(474 + (index % 6) * 14));
    circle.setAttribute('cy', String(190 + Math.floor(index / 6) * 11));
    circle.setAttribute('r', '4');
    group.append(circle);
  }
  const pendingVisible = Math.min(snapshot.pendingInstances, Math.max(0, 12 - visible));
  for (let index = 0; index < pendingVisible; index++) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(474 + ((visible + index) % 6) * 14));
    circle.setAttribute('cy', String(190 + Math.floor((visible + index) / 6) * 11));
    circle.setAttribute('r', '4');
    circle.classList.add('pending');
    group.append(circle);
  }
}

function renderSystem(snapshot) {
  const settings = readSettings();
  const appPct = Math.round(snapshot.appUtilization * 100);
  const dbPct = Math.round(snapshot.dbUtilization * 100);
  const statusText = snapshot.status.toUpperCase();
  $('#trafficValue').textContent = `${Math.round(snapshot.incoming).toLocaleString()} req/s`;
  $('#wafValue').textContent = settings.wafEnabled ? `BLOCK ${Math.round(settings.wafStrength * 100)}%` : 'OFF';
  $('#serverValue').textContent = `${snapshot.instances} / ${settings.maxServers}`;
  $('#dbValue').textContent = `${Math.round(snapshot.poolCapacity)} / ${DATABASE_SAFE_CONNECTIONS}`;
  $('#appLoad').textContent = `${appPct}%`;
  $('#dbLoad').textContent = `${dbPct}%`;
  $('#appMeter').style.width = `${Math.max(0, Math.min(100, appPct))}%`;
  $('#dbMeter').style.width = `${Math.max(0, Math.min(100, dbPct))}%`;
  $('#appMeter').classList.toggle('hot', appPct >= 90);
  $('#dbMeter').classList.toggle('hot', dbPct >= 90);
  $('#latencyMetric').innerHTML = `${snapshot.latency.toLocaleString()}<small>ms</small>`;
  $('#errorMetric').innerHTML = `${snapshot.errorRate.toFixed(snapshot.errorRate % 1 ? 1 : 0)}<small>%</small>`;
  $('#activeMetric').innerHTML = `${snapshot.instances}<small> / ${settings.maxServers}</small>`;
  $('#blockedMetric').innerHTML = `${Math.round(snapshot.wafBlocked).toLocaleString()}<small> req/s</small>`;
  $('#systemStatus').textContent = statusText;
  $('#systemStatus').className = `status-${snapshot.status}`;
  setNodeState($('#appNode'), snapshot.status === 'critical' ? 'critical' : appPct >= 90 ? 'degraded' : 'healthy');
  setNodeState($('#dbNode'), snapshot.dbQueueShare > .28 ? 'critical' : snapshot.dbQueueShare > .05 ? 'degraded' : 'healthy');
  setNodeState($('#wafNode'), !settings.wafEnabled ? '' : snapshot.wafBlocked > 0 ? 'healthy' : '');
  setNodeState($('#usersNode'), snapshot.incoming > 100 ? 'degraded' : '');
  renderServerDots(snapshot);
}

function latencyY(value) {
  return 12 + (CHART_MAX_LATENCY - Math.max(0, Math.min(CHART_MAX_LATENCY, value))) / CHART_MAX_LATENCY * 140;
}

function renderActualLine(data) {
  const points = data.map(point => `${10 + point.second * 10},${latencyY(point.latency).toFixed(1)}`);
  actualLine.setAttribute('points', points.join(' '));
}

function interpolateForecast(time) {
  if (!state.forecast.length) return null;
  const points = state.forecast.slice().sort((a, b) => a.x - b.x);
  const x = 10 + time * 10;
  if (x <= points[0].x) return CHART_MAX_LATENCY * (1 - (points[0].y - 12) / 140);
  if (x >= points[points.length - 1].x) return CHART_MAX_LATENCY * (1 - (points[points.length - 1].y - 12) / 140);
  for (let index = 1; index < points.length; index++) {
    if (points[index].x >= x) {
      const before = points[index - 1];
      const after = points[index];
      const ratio = (x - before.x) / Math.max(1, after.x - before.x);
      const y = before.y + ratio * (after.y - before.y);
      return CHART_MAX_LATENCY * (1 - (y - 12) / 140);
    }
  }
  return null;
}

function finishExplanation(data) {
  const peak = data.reduce((best, item) => item.latency > best.latency ? item : best, data[0]);
  const maxError = Math.max(...data.map(item => item.errorRate));
  const settings = readSettings();
  const settledDbPressure = data
    .filter(item => item.second >= 24 && item.appQueueShare < .1)
    .reduce((worst, item) => !worst || item.dbQueueShare > worst.dbQueueShare ? item : worst, null);
  const guessedPeak = interpolateForecast(peak.second);
  const forecastDifference = guessedPeak === null ? null : Math.abs(guessedPeak - peak.latency) / Math.max(100, peak.latency);
  const forecastText = forecastDifference === null ? '' : forecastDifference < .25
    ? ' Your forecast came close to the peak.'
    : ` Your forecast differed most around second ${peak.second}; compare the dashed and solid curves.`;
  let title = 'The system absorbed the surge.';
  let text = `The WAF removed about ${Math.round(peak.wafBlocked)} requests per second at peak. The architecture recovered to ${data[data.length - 1].latency} ms by the end of the drill.`;
  let challenge = 'Try disabling one layer and compare the curves.';

  if (!settings.autoscale && peak.appQueueShare > .1) {
    title = 'The app tier hit its ceiling first.';
    text = `With auto-scaling off, ${peak.instances} servers could handle ${peak.appCapacity} requests per second. The app tier queued the excess before it reached the database.`;
    challenge = 'Enable scaling and watch when the new servers come online.';
  } else if (settledDbPressure && settledDbPressure.dbQueueShare > .08) {
    title = 'The app recovered; the database became the bottleneck.';
    text = `Auto-scaling raised capacity to ${settledDbPressure.instances} app servers. Their pools could open up to ${settledDbPressure.poolCapacity} connections against the database's shared ${DATABASE_SAFE_CONNECTIONS}-connection budget. Requests queued at the data tier, keeping latency near ${settledDbPressure.latency.toLocaleString()} ms even after the app tier caught up. Right-size the per-server pool and filter more bot traffic to reduce that pressure.`;
    challenge = 'Try 15 connections per server, then compare the curves.';
  } else if (peak.appQueueShare > .08) {
    title = 'Scaling helped, but it had a warm-up delay.';
    text = `The app tier started with ${2} servers. New capacity took 8 seconds to become ready, so the early part of the surge raised latency even though the system later recovered.`;
    challenge = 'Raise the scaling ceiling and watch the first 10 seconds.';
  }

  $('#insightTitle').textContent = title;
  $('#insightText').textContent = `${text}${forecastText} Peak error rate: ${maxError.toFixed(maxError % 1 ? 1 : 0)}%.`;
  $('#nextChallenge').textContent = challenge;
  $('#feedback').textContent = `Peak latency: ${peak.latency.toLocaleString()} ms · Peak errors: ${maxError.toFixed(maxError % 1 ? 1 : 0)}% · ${Math.round(peak.wafBlocked).toLocaleString()} req/s filtered by the WAF.`;
  $('#feedback').classList.add('show');
  $('#insightCard').classList.add('revealed');
  $('#tryAgainButton').hidden = false;
  window.setTimeout(() => $('#insightCard').scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
}

function setView(showLab) {
  dashboard.hidden = showLab;
  lab.hidden = !showLab;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-launch]').forEach(button => button.addEventListener('click', () => {
  resetSimulation();
  setView(true);
}));
$('#backButton').addEventListener('click', () => {
  resetSimulation();
  setView(false);
});
document.querySelector('.topnav a:first-child').addEventListener('click', event => {
  event.preventDefault();
  if (!lab.hidden) {
    resetSimulation();
    setView(false);
  }
});
document.querySelector('.topnav a:last-child').addEventListener('click', event => {
  event.preventDefault();
  setView(true);
  $('#modelNote').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

['#maxServers', '#wafStrength', '#poolSize', '#botShare', '#autoscale', '#wafEnabled'].forEach(selector => {
  $(selector).addEventListener('input', () => {
    updateSettingLabels();
    resetSimulation();
  });
  $(selector).addEventListener('change', () => {
    updateSettingLabels();
    resetSimulation();
  });
});

$('#runButton').addEventListener('click', async () => {
  if (state.running) return;
  if (state.forecast.length < 2) {
    $('#chartInstruction').textContent = 'Draw a line across the chart first: how high will latency climb?';
    chart.focus();
    return;
  }
  const settings = readSettings();
  state.running = true;
  state.paused = false;
  const runId = ++state.runId;
  state.engine = createInitialState();
  state.timeSeries = [measureSystem(state.engine, settings, 0)];
  $('#feedback').classList.remove('show');
  $('#architecture').classList.add('is-running');
  $('#runButton').disabled = true;
  $('#runButton').textContent = 'Running the traffic drill…';
  $('#pauseButton').hidden = false;
  $('#clockLabel').textContent = 'SURGE IN PROGRESS';
  $('#chartInstruction').textContent = 'Watch the solid latency curve. New app servers take 8 seconds to come online.';
  setInputsDisabled(true);
  renderSystem(state.timeSeries[0]);
  renderActualLine(state.timeSeries);

  for (let second = 1; second <= 60; second++) {
    while (state.paused && state.runId === runId) await new Promise(resolve => setTimeout(resolve, 80));
    if (state.runId !== runId) return;
    const next = stepSimulation(state.engine, settings, second);
    state.engine = next.state;
    state.timeSeries.push(next.snapshot);
    $('#clockLabel').textContent = `SECOND ${second} · 60`;
    renderSystem(next.snapshot);
    renderActualLine(state.timeSeries);
    await new Promise(resolve => setTimeout(resolve, 105));
  }

  if (state.runId !== runId) return;
  state.running = false;
  $('#architecture').classList.remove('is-running');
  $('#clockLabel').textContent = 'COMPLETE · 60 SEC DRILL';
  $('#runButton').disabled = false;
  $('#runButton').textContent = 'Run again';
  $('#pauseButton').hidden = true;
  $('#chartInstruction').textContent = 'Dashed is your prediction. Solid is the simulated latency.';
  setInputsDisabled(false);
  finishExplanation(state.timeSeries);
});

$('#pauseButton').addEventListener('click', () => {
  state.paused = !state.paused;
  $('#pauseButton').textContent = state.paused ? 'Resume' : 'Pause';
  $('#playbackNote').textContent = state.paused ? 'Paused · resume when ready' : '60 seconds · accelerated playback';
});

$('#resetButton').addEventListener('click', () => resetSimulation());
$('#tryAgainButton').addEventListener('click', () => {
  resetSimulation();
  document.querySelector('.lab-layout').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

updateSettingLabels();
renderSystem(measureSystem(state.engine, readSettings(), 0));
})();
