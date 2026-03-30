"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { buildAgentRole } = require("../../../core/soul/soul.loader");

/**
 * Social Media Agent — Spesialis konten dan posting sosial media.
 *
 * Tools utama: social-media-tool, cron-tool, browser-tool, http-tool
 * Skills: social-media (auto-injected)
 * Soul: soul/social-media-agent.soul.md
 */
function createSocialMediaAgent() {
  return createBaseAgent({
    name: "social-media-agent",
    customTools: [],
    promptBuilder: {
      buildPlanningPrompt(input, toolSchemas) {
        const { createPromptBuilder } = require("../../../core/llm/prompt.builder");
        const base = createPromptBuilder();
        // Override role dengan SOUL + paksa skills social-media
        const soulRole = buildAgentRole("social-media-agent",
          "Kamu adalah Social Media Agent Starclaw. Spesialisasi: membuat dan mengelola konten sosial media."
        );
        const modInput = {
          ...input,
          __agentRole: soulRole,
          __agentSkills: ["social-media"],
        };
        return base.buildPlanningPrompt(modInput, toolSchemas);
      }
    },
  });
}

module.exports = { createSocialMediaAgent };
