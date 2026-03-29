"use strict";

const { loadEnvConfig } = require("./env.config");
const env = loadEnvConfig();

const appConfig = {
  name: "starclaw-api",
  port: env.port,
  wsPath: env.wsPath,
};

module.exports = { appConfig };
