"use strict";

const { BaseAgent } = require("./base.agent");
const { Planner } = require("./planner");
const { Executor } = require("./executor");
const { createToolRegistry } = require("../tools");
const { createDefaultLlmProvider, createPromptBuilder } = require("../llm/llm.provider");
const { createMemory } = require("../memory/short.memory");
const { createLogger } = require("../utils/logger");

function createBaseAgent({
  name,
  customTools = [],
  llmProvider,
  promptBuilder,
  memoryFactory = createMemory,
}) {
  const logger = createLogger(`agent/${name}`);
  const selectedLlmProvider = llmProvider || createDefaultLlmProvider();
  const selectedPromptBuilder = promptBuilder || createPromptBuilder();
  const planner = new Planner({ llmProvider: selectedLlmProvider, promptBuilder: selectedPromptBuilder, logger });
  const toolsRegistry = createToolRegistry(customTools);
  const executor = new Executor({ toolsRegistry, logger });
  const memory = memoryFactory();

  return new BaseAgent({
    name,
    planner,
    executor,
    memory,
    logger,
  });
}

module.exports = { createBaseAgent };
