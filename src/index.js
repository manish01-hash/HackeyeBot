require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { loadConfig } = require("./core/config");
const { LOG_CATEGORIES, logSystemForClient, logToGuild } = require("./core/logger");
const {
  recordJoinEvent,
  recordMessageEvent,
  recordPermissionChangeEvent,
  getGuildBaselineSnapshot
} = require("./systems/baseline/baselineEngine");
const { evaluateJoinRaidRisk } = require("./systems/security/raidPredictor");
const { handleRaidRiskAssessment } = require("./systems/decision/decisionEngine");

async function main() {
  const config = loadConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
  });

  client.once("ready", async () => {
    const tag = client.user ? `${client.user.tag} (${client.user.id})` : "unknown";
    console.log(`HackeyeBot online as ${tag}`);
    await logSystemForClient(client, `HackeyeBot started as ${tag}`);
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      if (!member.guild) {
        return;
      }

      await recordJoinEvent(member.guild.id);
      const baselineSnapshot = await getGuildBaselineSnapshot(member.guild.id);
      const assessment = await evaluateJoinRaidRisk({ guild: member.guild, member, baselineSnapshot });
      await handleRaidRiskAssessment({ client, guild: member.guild, member, assessment, baselineSnapshot });
    } catch (error) {
      console.error("guildMemberAdd handler error", error);
    }
  });

  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) {
        return;
      }

      const hasLink = typeof message.content === "string" && /https?:\/\//i.test(message.content);
      await recordMessageEvent(message.guild.id, hasLink);
    } catch (error) {
      console.error("messageCreate handler error", error);
    }
  });

  client.on("guildCreate", async (guild) => {
    await logToGuild(guild, LOG_CATEGORIES.SYSTEM, "HackeyeBot added to guild");
  });

  client.on("guildDelete", async (guild) => {
    console.log(`HackeyeBot removed from guild ${guild.id}`);
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    try {
      if (!newRole || !newRole.guild) {
        return;
      }

      if (!oldRole || oldRole.permissions.bitfield === newRole.permissions.bitfield) {
        return;
      }

      await recordPermissionChangeEvent(newRole.guild.id);
    } catch (error) {
      console.error("roleUpdate handler error", error);
    }
  });

  client.on("error", (error) => {
    console.error("Discord client error", error);
  });

  client.on("shardError", (error) => {
    console.error("Discord shard error", error);
  });

  try {
    await client.login(config.discordToken);
  } catch (error) {
    console.error("Failed to login to Discord", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error in main", error);
    process.exit(1);
  });
}

module.exports = {
  main
};
