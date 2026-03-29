"use strict";

function createPromptBuilder() {
  return {
    buildPlanningPrompt(input) {
      return [
        "Anda adalah architecture-agent Starclaw.",
        "Tugas: mapping arsitektur OpenClaw, temukan gap, dan usulkan improvement.",
        `Snapshot: ${JSON.stringify(input.openclawSnapshot || {})}`,
      ].join("\n");
    },
  };
}

module.exports = { createPromptBuilder };
