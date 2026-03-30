"use strict";

const { createOpenClawArchitectureMapperAgent } = require("../../modules/shared/agents/openclaw-architecture-mapper.agent");
const { createPlatformAssistantAgent } = require("../../modules/shared/agents/platform-assistant.agent");
const { createSocialMediaAgent } = require("../../modules/shared/agents/social-media.agent");
const { createDevOpsAgent } = require("../../modules/shared/agents/devops.agent");
const { createGenieAcsAgent } = require("../../modules/shared/agents/genieacs.agent");
const { createResearchAgent } = require("../../modules/shared/agents/research.agent");
const { createTradingAgent } = require("../../modules/shared/agents/trading.agent");

function createTaskRouter(customRoutes = {}) {
  const routes = {
    // Agent utama — handle semua task umum
    "platform-assistant": createPlatformAssistantAgent(),

    // Specialized agents
    "social-media": createSocialMediaAgent(),
    "devops": createDevOpsAgent(),
    "genieacs": createGenieAcsAgent(),
    "research": createResearchAgent(),
    "trading": createTradingAgent(),

    // Audit & legacy
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
