"use strict";

const { createMockProvider } = require("./mock.provider");
const { createOpenAIProvider } = require("./openai.provider");
const { createPromptBuilder } = require("./prompt.builder");
const { loadEnvConfig } = require("../../config/env.config");

function createDefaultLlmProvider() {
  const env = loadEnvConfig();
  if (env.llmProvider === "openai") {
    try {
      return createOpenAIProvider();
    } catch (_error) {
      return createMockProvider();
    }
  }
  return createMockProvider();
}

module.exports = {
  createDefaultLlmProvider,
  createPromptBuilder,
};
