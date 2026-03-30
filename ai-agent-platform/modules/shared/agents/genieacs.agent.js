"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { buildAgentRole } = require("../../../core/soul/soul.loader");

/**
 * GenieACS Agent — Spesialis manajemen perangkat ISP via TR-069/CWMP.
 *
 * Tools utama: genieacs-tool, notification-tool, database-tool
 * Skills: genieacs, networking (auto-injected)
 * Soul: soul/genieacs-agent.soul.md
 */
function createGenieAcsAgent() {
  return createBaseAgent({
    name: "genieacs-agent",
    customTools: [],
    promptBuilder: {
      buildPlanningPrompt(input, toolSchemas) {
        const { createPromptBuilder } = require("../../../core/llm/prompt.builder");
        const base = createPromptBuilder();
        const soulRole = buildAgentRole("genieacs-agent",
          "Kamu adalah GenieACS Agent Starclaw. Spesialisasi: manajemen perangkat CPE/ONT/Router ISP via GenieACS dan protokol TR-069."
        );
        const modInput = {
          ...input,
          __agentRole: soulRole,
          __agentSkills: ["genieacs", "networking"],
        };
        return base.buildPlanningPrompt(modInput, toolSchemas);
      }
    },
  });
}

module.exports = { createGenieAcsAgent };
