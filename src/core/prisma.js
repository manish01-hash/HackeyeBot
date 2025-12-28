const { PrismaClient } = require("@prisma/client");
const { loadConfig } = require("./config");

const config = loadConfig();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.databaseUrl
    }
  }
});

module.exports = {
  prisma
};
