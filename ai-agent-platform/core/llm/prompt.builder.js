"use strict";

function createPromptBuilder() {
  function formatRecentContext(context) {
    if (!context || !Array.isArray(context.recent) || context.recent.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      context.recent.map((entry) => ({
        user: entry.userMessage || "",
        agent: entry.agentMessage || "",
      })),
    );
  }

  return {
    buildPlanningPrompt(input) {
      const context = input.context || {};
      return [
        "Anda adalah architecture-agent Starclaw.",
        "Tugas: mapping arsitektur OpenClaw, temukan gap, dan usulkan improvement.",
        `Context summary: ${context.summary || "(kosong)"}`,
        `Recent context (max 3): ${formatRecentContext(context)}`,
        `Context token usage: ${JSON.stringify(context.tokenUsage || {})}`,
        `Snapshot: ${JSON.stringify(input.openclawSnapshot || {})}`,
        `User message: ${typeof input.message === "string" ? input.message : ""}`,
      ].join("\n");
    },
  };
}

module.exports = { createPromptBuilder };
