const BASE_TRAFFIC = 10;
const PEAK_TRAFFIC = 1000;
const APP_REQUESTS_PER_SERVER = 50;
const DATABASE_SAFE_CONNECTIONS = 300;
const CHART_MAX_LATENCY = 5000;

function createInitialState() {
  return { second: 0, instances: 2, pending: [], nextScaleAt: 8 };
}

function trafficAt(second) {
  if (second < 8) return BASE_TRAFFIC;
  if (second < 12) return BASE_TRAFFIC + (PEAK_TRAFFIC - BASE_TRAFFIC) * ((second - 8) / 4);
  if (second < 40) return PEAK_TRAFFIC;
  if (second < 50) return PEAK_TRAFFIC - (PEAK_TRAFFIC - BASE_TRAFFIC) * ((second - 40) / 10);
  return BASE_TRAFFIC;
}

function measureSystem(state, settings, second = state.second) {
  const incoming = trafficAt(second);
  const botTraffic = incoming * settings.botShare;
  const wafBlocked = settings.wafEnabled ? botTraffic * settings.wafStrength : 0;
  const appTraffic = Math.max(0, incoming - wafBlocked);
  const appCapacity = state.instances * APP_REQUESTS_PER_SERVER;
  const appUtilization = appCapacity ? appTraffic / appCapacity : 0;
  const appQueueShare = appTraffic ? Math.max(0, appTraffic - appCapacity) / appTraffic : 0;

  // A fraction of incoming requests are concurrently waiting on the database.
  // Each app server has its own pool; Aurora's shared safe connection budget is 300.
  const dbDemand = appTraffic * 0.45;
  const poolCapacity = state.instances * settings.poolPerServer;
  const admittedConnections = Math.min(dbDemand, poolCapacity, DATABASE_SAFE_CONNECTIONS);
  const requestQueueShare = dbDemand ? Math.max(0, dbDemand - admittedConnections) / dbDemand : 0;
  const poolOverhangShare = dbDemand > DATABASE_SAFE_CONNECTIONS * 0.65
    ? Math.min(0.55, Math.max(0, poolCapacity - DATABASE_SAFE_CONNECTIONS) / DATABASE_SAFE_CONNECTIONS * 0.25)
    : 0;
  const dbQueueShare = Math.max(requestQueueShare, poolOverhangShare);
  const dbUtilization = admittedConnections / DATABASE_SAFE_CONNECTIONS;
  const latency = Math.min(CHART_MAX_LATENCY, Math.round(
    80 + Math.max(0, appUtilization - 0.7) * 500 + dbQueueShare * 1100 + Math.max(0, dbUtilization - 0.8) * 300
  ));
  const errorRate = Math.min(99, Math.round((appQueueShare * 72 + dbQueueShare * 82) * 10) / 10);

  let status = 'healthy';
  if (errorRate >= 25 || latency >= 1800) status = 'critical';
  else if (errorRate >= 3 || latency >= 450) status = 'degraded';

  return {
    second,
    incoming,
    botTraffic,
    wafBlocked,
    appTraffic,
    appCapacity,
    appUtilization,
    appQueueShare,
    instances: state.instances,
    pendingInstances: state.pending.reduce((sum, item) => sum + item.count, 0),
    poolCapacity,
    dbDemand,
    admittedConnections,
    requestQueueShare,
    poolOverhangShare,
    dbQueueShare,
    dbUtilization,
    latency,
    errorRate,
    status
  };
}

function stepSimulation(previous, settings, second) {
  const state = {
    second,
    instances: previous.instances,
    pending: previous.pending.map(item => ({ ...item })),
    nextScaleAt: previous.nextScaleAt
  };

  const ready = state.pending.filter(item => item.readyAt <= second);
  if (ready.length) {
    state.instances = Math.min(settings.maxServers, state.instances + ready.reduce((sum, item) => sum + item.count, 0));
    state.pending = state.pending.filter(item => item.readyAt > second);
  }

  const beforeScale = measureSystem(state, settings, second);
  if (settings.autoscale && second >= state.nextScaleAt && beforeScale.appUtilization > 0.75 && state.instances < settings.maxServers) {
    const target = Math.ceil(beforeScale.appTraffic / (APP_REQUESTS_PER_SERVER * 0.75));
    const addCount = Math.min(settings.maxServers - state.instances, Math.max(1, Math.min(5, target - state.instances)));
    state.pending.push({ count: addCount, readyAt: second + 8 });
    state.nextScaleAt = second + 8;
  }

  return { state, snapshot: measureSystem(state, settings, second) };
}

window.SimEngine = {
  CHART_MAX_LATENCY,
  DATABASE_SAFE_CONNECTIONS,
  createInitialState,
  measureSystem,
  stepSimulation
};
