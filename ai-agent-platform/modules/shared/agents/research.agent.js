"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { buildAgentRole } = require("../../../core/soul/soul.loader");

/**
 * Research Agent — Spesialis riset, investigasi, dan pengumpulan informasi.
 *
 * Tools utama: browser-tool, web-search-tool, http-tool, fs-tool, database-tool
 * Skills: research (auto-injected)
 */
function createResearchAgent() {
  return createBaseAgent({
    name: "research-agent",
    customTools: [],
    promptBuilder: {
      buildPlanningPrompt(input, toolSchemas) {
        const { createPromptBuilder } = require("../../../core/llm/prompt.builder");
        const base = createPromptBuilder();
        const soulRole = buildAgentRole("research-agent",
          "Kamu adalah Research Agent Starclaw. Spesialisasi: riset mendalam, investigasi, pengumpulan dan analisis informasi dari berbagai sumber web."
        );
        const modInput = {
          ...input,
          __agentRole: soulRole,
          __agentSkills: ["research"],
        };
        return base.buildPlanningPrompt(modInput, toolSchemas);
      }
    },
  });
}

module.exports = { createResearchAgent };
