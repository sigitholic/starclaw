"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { buildAgentRole } = require("../../../core/soul/soul.loader");

/**
 * DevOps Agent — Spesialis operasi server, deployment, monitoring infrastruktur.
 *
 * Tools utama: shell-tool, docker-tool, fs-tool, http-tool, notification-tool
 * Skills: server-ops (auto-injected)
 * Soul: soul/devops-agent.soul.md
 */
function createDevOpsAgent() {
  return createBaseAgent({
    name: "devops-agent",
    customTools: [],
    promptBuilder: {
      buildPlanningPrompt(input, toolSchemas) {
        const { createPromptBuilder } = require("../../../core/llm/prompt.builder");
        const base = createPromptBuilder();
        const soulRole = buildAgentRole("devops-agent",
          "Kamu adalah DevOps Agent Starclaw. Spesialisasi: operasi server, deployment, monitoring, dan automasi infrastruktur."
        );
        const modInput = {
          ...input,
          __agentRole: soulRole,
          __agentSkills: ["server-ops"],
        };
        return base.buildPlanningPrompt(modInput, toolSchemas);
      }
    },
  });
}

module.exports = { createDevOpsAgent };
