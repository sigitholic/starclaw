"use strict";

const { createOpenClawArchitectureMapperAgent } = require("../../modules/shared/agents/openclaw-architecture-mapper.agent");
const { createPlatformAssistantAgent } = require("../../modules/shared/agents/platform-assistant.agent");

function createTaskRouter(customRoutes = {}) {
  const routes = {
    "platform-assistant": createPlatformAssistantAgent(),
    "openclaw-audit": createOpenClawArchitectureMapperAgent(),
    ...customRoutes,
  };

  return {
    resolve(taskName) {
      const target = routes[taskName];
      if (!target) {
        throw new Error(`Task tidak terdaftar: ${taskName}`);
      }
      return target;
    },
  };
}

module.exports = { createTaskRouter };
