const { METRIC_TYPES } = require("../baseline/baselineEngine");

const joinHistoryByGuild = new Map();

const RAID_LEVELS = {
  NONE: "NONE",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL"
};

function getGuildJoinHistory(guildId) {
  let history = joinHistoryByGuild.get(guildId);
  if (!history) {
    history = {
      events: []
    };
    joinHistoryByGuild.set(guildId, history);
  }
  return history;
}

function computeUsernameSimilarity(a, b) {
  if (!a || !b) {
    return 0;
  }

  const s1 = new Set(a.toLowerCase());
  const s2 = new Set(b.toLowerCase());

  let intersection = 0;
  for (const ch of s1) {
    if (s2.has(ch)) {
      intersection += 1;
    }
  }

  const union = new Set([...s1, ...s2]).size;
  if (union === 0) {
    return 0;
  }

  return intersection / union;
}

function mapRiskToLevel(score) {
  if (score < 0.3) {
    return RAID_LEVELS.NONE;
  }
  if (score < 0.5) {
    return RAID_LEVELS.LOW;
  }
  if (score < 0.75) {
    return RAID_LEVELS.MEDIUM;
  }
  if (score < 0.9) {
    return RAID_LEVELS.HIGH;
  }
  return RAID_LEVELS.CRITICAL;
}

async function evaluateJoinRaidRisk({ guild, member, baselineSnapshot }) {
  if (!guild || !member || !member.user) {
    return {
      riskScore: 0,
      level: RAID_LEVELS.NONE,
      features: {}
    };
  }

  const guildId = guild.id;
  const now = Date.now();
  const user = member.user;

  const accountCreated = typeof user.createdTimestamp === "number" ? user.createdTimestamp : now;
  const accountAgeMs = Math.max(0, now - accountCreated);
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

  const history = getGuildJoinHistory(guildId);

  const event = {
    timestamp: now,
    accountAgeDays,
    username: user.username || ""
  };

  history.events.push(event);

  const windowMs = 10 * 60 * 1000;
  history.events = history.events.filter((e) => now - e.timestamp <= windowMs);

  let joinsLast10s = 0;
  let joinsLast30s = 0;
  let joinsLast60s = 0;
  let joinsLast5m = 0;
  let youngCount = 0;

  for (const e of history.events) {
    const ageMs = now - e.timestamp;
    if (ageMs <= 10000) {
      joinsLast10s += 1;
    }
    if (ageMs <= 30000) {
      joinsLast30s += 1;
    }
    if (ageMs <= 60000) {
      joinsLast60s += 1;
    }
    if (ageMs <= 5 * 60000) {
      joinsLast5m += 1;
    }
    if (e.accountAgeDays <= 7) {
      youngCount += 1;
    }
  }

  const totalRecent = history.events.length || 1;
  const youngRatio = youngCount / totalRecent;

  let sumSim = 0;
  let maxSim = 0;
  let simCount = 0;

  const len = history.events.length;
  for (let i = 0; i < len - 1; i += 1) {
    const other = history.events[i];
    const sim = computeUsernameSimilarity(event.username, other.username);
    if (sim > 0) {
      sumSim += sim;
      simCount += 1;
      if (sim > maxSim) {
        maxSim = sim;
      }
    }
  }

  const usernameSimilarity = simCount > 0 ? sumSim / simCount : 0;

  const metrics = baselineSnapshot && baselineSnapshot.metrics ? baselineSnapshot.metrics : {};
  const joinMetric = metrics[METRIC_TYPES.JOINS];
  const baselineJoinRate = joinMetric ? joinMetric.baseline : 0;
  const effectiveBaseline = baselineJoinRate > 0 ? baselineJoinRate : 1;

  const velocityRate = joinsLast60s;
  const velocityRatio = velocityRate / effectiveBaseline;
  const joinVelocityScore = Math.min(1, velocityRatio / 3);

  const youngScore = Math.min(1, youngRatio);
  const usernameScore = Math.min(1, usernameSimilarity);

  let riskScore = 0.5 * joinVelocityScore + 0.3 * youngScore + 0.2 * usernameScore;

  if (joinsLast10s >= 5) {
    riskScore = Math.min(1, riskScore + 0.1);
  }

  const level = mapRiskToLevel(riskScore);

  return {
    riskScore,
    level,
    features: {
      joinsLast10s,
      joinsLast30s,
      joinsLast60s,
      joinsLast5m,
      baselineJoinRate,
      velocityRatio,
      youngRatio,
      usernameSimilarity,
      maxUsernameSimilarity: maxSim,
      accountAgeDays
    }
  };
}

module.exports = {
  RAID_LEVELS,
  evaluateJoinRaidRisk
};
