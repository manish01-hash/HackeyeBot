const { prisma } = require("../../core/prisma");
const { LOG_CATEGORIES, logToGuild } = require("../../core/logger");

const ACTIONS = {
  NONE: "NONE",
  LOG_ONLY: "LOG_ONLY",
  FLAG: "FLAG",
  ISOLATE: "ISOLATE",
  LOCKDOWN: "LOCKDOWN"
};

async function ensureGuildSettings(guildId) {
  const existing = await prisma.guildSettings.findUnique({
    where: {
      guildId
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.guildSettings.create({
    data: {
      guildId
    }
  });
}

function determineRaidAction(riskScore, settings) {
  const baseThreshold = typeof settings.riskThreshold === "number" ? settings.riskThreshold : 0.75;

  if (riskScore < baseThreshold * 0.6) {
    return ACTIONS.NONE;
  }
  if (riskScore < baseThreshold) {
    return ACTIONS.LOG_ONLY;
  }
  if (riskScore < baseThreshold + 0.1) {
    return ACTIONS.FLAG;
  }
  if (riskScore < 0.95) {
    return ACTIONS.ISOLATE;
  }
  return ACTIONS.LOCKDOWN;
}

async function handleRaidRiskAssessment({ client, guild, member, assessment, baselineSnapshot }) {
  if (!guild || !assessment || typeof assessment.riskScore !== "number") {
    return;
  }

  const riskScore = assessment.riskScore;
  if (riskScore < 0.25) {
    return;
  }

  const settings = await ensureGuildSettings(guild.id);
  const action = determineRaidAction(riskScore, settings);

  const incidentId = `RAID_${guild.id}_${Date.now().toString(36)}`;

  const displayName = member && member.user ? `${member.user.tag || member.user.username || member.id}` : "unknown";

  const riskPercent = (riskScore * 100).toFixed(1);

  const summary = `Raid prediction ${assessment.level} (${riskPercent}%) for guild ${guild.name || guild.id}, user ${displayName}`;

  const riskFactorsPayload = {
    level: assessment.level,
    features: assessment.features || {},
    action,
    baselines: baselineSnapshot && baselineSnapshot.metrics ? baselineSnapshot.metrics : {},
    timestamp: new Date().toISOString()
  };

  await prisma.incident.create({
    data: {
      guildId: guild.id,
      incidentId,
      type: "RAID_PREDICTION",
      severity: riskScore,
      description: summary,
      riskFactors: JSON.stringify(riskFactorsPayload),
      actionTaken: action,
      resolved: false
    }
  });

  const details = assessment.features || {};

  const messageParts = [
    `[RAID_PREDICTION] Incident ${incidentId}`,
    `Level: ${assessment.level}`,
    `Risk: ${riskPercent}%`,
    `Joins60s: ${details.joinsLast60s || 0}`,
    `BaselineJoinRate: ${(details.baselineJoinRate || 0).toFixed(2)}`,
    `YoungRatio: ${(details.youngRatio || 0).toFixed(2)}`,
    `UsernameSim: ${(details.usernameSimilarity || 0).toFixed(2)}`,
    `Action: ${action} (no automatic lockdown applied yet)`
  ];

  const content = messageParts.join(" | ");

  await logToGuild(guild, LOG_CATEGORIES.SECURITY_INCIDENT, content);
}

module.exports = {
  ACTIONS,
  handleRaidRiskAssessment
};
