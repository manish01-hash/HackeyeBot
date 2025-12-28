require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { loadConfig } = require("./core/config");
const { LOG_CATEGORIES, logSystemForClient, logToGuild } = require("./core/logger");

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

  client.on("guildCreate", async (guild) => {
    await logToGuild(guild, LOG_CATEGORIES.SYSTEM, "HackeyeBot added to guild");
  });

  client.on("guildDelete", async (guild) => {
    console.log(`HackeyeBot removed from guild ${guild.id}`);
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
