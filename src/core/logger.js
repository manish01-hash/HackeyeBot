const { ChannelType } = require("discord.js");
const { prisma } = require("./prisma");

const LOG_CATEGORIES = {
  SYSTEM: "SYSTEM",
  SECURITY_INCIDENT: "SECURITY_INCIDENT",
  USER_INTEL: "USER_INTEL",
  PERMISSION_WATCH: "PERMISSION_WATCH",
  CONTENT_INTEL: "CONTENT_INTEL",
  VOICE_SECURITY: "VOICE_SECURITY",
  AUDIT_TRAIL: "AUDIT_TRAIL"
};

const CATEGORY_CHANNEL_NAMES = {
  SYSTEM: "bot-system-logs",
  SECURITY_INCIDENT: "security-incidents",
  USER_INTEL: "user-intelligence-logs",
  PERMISSION_WATCH: "permission-watch",
  CONTENT_INTEL: "content-intel",
  VOICE_SECURITY: "voice-security",
  AUDIT_TRAIL: "audit-trail"
};

async function ensureGuildRecord(guild) {
  if (!guild || !guild.id) {
    return null;
  }

  const name = guild.name || null;

  const record = await prisma.guild.upsert({
    where: {
      id: guild.id
    },
    update: {
      name
    },
    create: {
      id: guild.id,
      name
    }
  });

  return record;
}

async function getOrCreateLogChannel(guild, category) {
  if (!guild || !guild.id) {
    return null;
  }

  try {
    await ensureGuildRecord(guild);

    const existing = await prisma.logChannel.findUnique({
      where: {
        guildId_category: {
          guildId: guild.id,
          category
        }
      }
    });

    if (existing) {
      const existingChannel = await guild.channels.fetch(existing.channelId).catch(() => null);
      if (existingChannel) {
        return existingChannel;
      }
    }

    const channelName = CATEGORY_CHANNEL_NAMES[category] || "hackeye-log";

    const createdChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      reason: "HackeyeBot logging channel"
    });

    await prisma.logChannel.upsert({
      where: {
        guildId_category: {
          guildId: guild.id,
          category
        }
      },
      create: {
        guildId: guild.id,
        category,
        channelId: createdChannel.id
      },
      update: {
        channelId: createdChannel.id
      }
    });

    return createdChannel;
  } catch (error) {
    console.error("Logger error for guild", guild.id, category, error);
    return null;
  }
}

async function logToGuild(guild, category, content) {
  const channel = await getOrCreateLogChannel(guild, category);
  if (channel) {
    await channel.send({ content: String(content) });
  } else {
    console.log(`[${category}] [${guild && guild.id ? guild.id : "no-guild"}] ${content}`);
  }
}

async function logSystemForClient(client, content) {
  if (!client || !client.guilds) {
    console.log(`[SYSTEM] ${content}`);
    return;
  }

  const promises = [];
  for (const guild of client.guilds.cache.values()) {
    promises.push(logToGuild(guild, LOG_CATEGORIES.SYSTEM, content));
  }

  if (promises.length === 0) {
    console.log(`[SYSTEM] ${content}`);
  } else {
    await Promise.all(promises);
  }
}

module.exports = {
  LOG_CATEGORIES,
  logToGuild,
  logSystemForClient
};
