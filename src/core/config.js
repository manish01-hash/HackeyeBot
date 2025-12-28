const REQUIRED_ENV = ["DISCORD_TOKEN"];

function loadConfig() {
  const env = process.env;
  const missing = REQUIRED_ENV.filter((key) => !env[key] || env[key].trim() === "");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    discordToken: env.DISCORD_TOKEN,
    nodeEnv: env.NODE_ENV || "development",
    databaseUrl: env.DATABASE_URL || "file:./prisma/dev.db"
  };
}

module.exports = {
  loadConfig
};
