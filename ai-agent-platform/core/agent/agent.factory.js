"use strict";

const { BaseAgent } = require("./base.agent");
const { Planner } = require("./planner");
const { Executor } = require("./executor");
const { createToolRegistry } = require("../tools");
const { createDefaultLlmProvider, createPromptBuilder } = require("../llm/llm.provider");
const { createMemory } = require("../memory/short.memory");
const { createLogger } = require("../utils/logger");

function createBaseAgent({ name, customTools = [] }) {
  const logger = createLogger(`agent/${name}`);
  const llmProvider = createDefaultLlmProvider();
  const promptBuilder = createPromptBuilder();
  const planner = new Planner({ llmProvider, promptBuilder });
  const toolsRegistry = createToolRegistry(customTools);
  const executor = new Executor({ toolsRegistry, logger });
  const memory = createMemory();

  return new BaseAgent({
    name,
    planner,
    executor,
    memory,
    logger,
  });
}

module.exports = { createBaseAgent };
