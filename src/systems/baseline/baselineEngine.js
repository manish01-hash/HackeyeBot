const { prisma } = require("../../core/prisma");

const METRIC_TYPES = {
  JOINS: "joins_per_minute",
  MESSAGES: "messages_per_minute",
  LINKS: "links_per_minute",
  PERM_CHANGES: "perm_changes_per_minute"
};

const guildMetricState = new Map();
const ALPHA = 0.3;
const MIN_DELTA_MS = 1000;

function getGuildState(guildId) {
  let state = guildMetricState.get(guildId);
  if (!state) {
    state = {
      lastTimestamps: {},
      lastSampleRate: {}
    };
    guildMetricState.set(guildId, state);
  }
  return state;
}

async function upsertBaselineMetric(guildId, metricType, sampleRate) {
  if (!guildId || !metricType || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }

  const existing = await prisma.baselineMetric.findUnique({
    where: {
      guildId_metricType: {
        guildId,
        metricType
      }
    }
  });

  let baseline = sampleRate;
  let stdDev = 0;
  let sampleSize = 1;

  if (existing) {
    const prevBaseline = existing.baseline;
    const prevStdDev = existing.stdDev;
    const prevSampleSize = existing.sampleSize;
    const delta = sampleRate - prevBaseline;
    baseline = prevBaseline + ALPHA * delta;
    const variance = prevStdDev * prevStdDev;
    const updatedVariance = (1 - ALPHA) * variance + ALPHA * delta * delta;
    stdDev = Math.sqrt(updatedVariance);
    sampleSize = prevSampleSize + 1;
  }

  const now = new Date();

  await prisma.baselineMetric.upsert({
    where: {
      guildId_metricType: {
        guildId,
        metricType
      }
    },
    update: {
      baseline,
      stdDev,
      sampleSize,
      lastUpdated: now
    },
    create: {
      guildId,
      metricType,
      baseline,
      stdDev,
      sampleSize,
      lastUpdated: now
    }
  });

  return { baseline, stdDev, sampleSize };
}

async function recordMetricEvent(guildId, metricType) {
  if (!guildId) {
    return null;
  }

  const now = Date.now();
  const state = getGuildState(guildId);
  const last = state.lastTimestamps[metricType];
  state.lastTimestamps[metricType] = now;

  let sampleRate = 1;

  if (last && now > last) {
    const deltaMs = now - last;
    if (deltaMs >= MIN_DELTA_MS) {
      sampleRate = 60000 / deltaMs;
    } else {
      sampleRate = state.lastSampleRate[metricType] || 1;
    }
  }

  state.lastSampleRate[metricType] = sampleRate;

  return upsertBaselineMetric(guildId, metricType, sampleRate);
}

async function recordJoinEvent(guildId) {
  return recordMetricEvent(guildId, METRIC_TYPES.JOINS);
}

async function recordMessageEvent(guildId, hasLink) {
  const result = await recordMetricEvent(guildId, METRIC_TYPES.MESSAGES);
  if (hasLink) {
    await recordMetricEvent(guildId, METRIC_TYPES.LINKS);
  }
  return result;
}

async function recordPermissionChangeEvent(guildId) {
  return recordMetricEvent(guildId, METRIC_TYPES.PERM_CHANGES);
}

async function getGuildBaselineSnapshot(guildId) {
  if (!guildId) {
    return { guildId: null, metrics: {} };
  }

  const rows = await prisma.baselineMetric.findMany({
    where: {
      guildId
    }
  });

  const metrics = {};

  for (const row of rows) {
    metrics[row.metricType] = {
      baseline: row.baseline,
      stdDev: row.stdDev,
      sampleSize: row.sampleSize,
      lastUpdated: row.lastUpdated
    };
  }

  return {
    guildId,
    metrics
  };
}

module.exports = {
  METRIC_TYPES,
  recordJoinEvent,
  recordMessageEvent,
  recordPermissionChangeEvent,
  getGuildBaselineSnapshot
};
