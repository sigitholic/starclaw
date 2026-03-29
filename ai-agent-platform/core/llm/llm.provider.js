"use strict";

const { createMockProvider } = require("./mock.provider");
const { createPromptBuilder } = require("./prompt.builder");

function createDefaultLlmProvider() {
  return createMockProvider();
}

module.exports = {
  createDefaultLlmProvider,
  createPromptBuilder,
};
