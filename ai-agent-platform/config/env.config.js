"use strict";

function loadEnvConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    openAiApiKey: process.env.OPENAI_API_KEY || "",
  };
}

module.exports = { loadEnvConfig };
