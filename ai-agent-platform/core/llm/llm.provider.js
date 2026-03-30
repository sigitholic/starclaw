"use strict";

const { createMockProvider } = require("./mock.provider");
const { createOpenAIProvider } = require("./openai.provider");
const { createPromptBuilder } = require("./prompt.builder");
const { loadEnvConfig } = require("../../config/env.config");

function createDefaultLlmProvider() {
  const env = loadEnvConfig();
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);

  if (env.llmProvider === "openai" || hasOpenAi || hasAnthropic || hasGemini) {
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
