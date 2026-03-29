"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");

function createAnalyzerPlannerProvider() {
  return {
    async plan(_prompt, input = {}) {
      return {
        action: "respond",
        response: JSON.stringify({
          stage: "analyzer",
          taskId: input.taskId || "noc-task",
          status: "analyzed",
          severity: input.severity || "medium",
          diagnosis: input.diagnosis || "network-latency-anomaly",
        }),
        summary: "Analyzer menilai severity dan diagnosis insiden",
      };
    },
  };
}

function createAnalyzerAgent() {
  return createBaseAgent({
    name: "noc-analyzer-agent",
    llmProvider: createAnalyzerPlannerProvider(),
  });
}

module.exports = { createAnalyzerAgent };
