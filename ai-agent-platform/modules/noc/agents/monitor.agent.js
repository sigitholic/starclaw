"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");

function createMonitorPlannerProvider() {
  return {
    async plan(_prompt, input = {}) {
      return {
        action: "respond",
        response: JSON.stringify({
          stage: "monitor",
          taskId: input.taskId || "noc-task",
          status: "observed",
          signal: input.signal || "incident-detected",
        }),
        summary: "Monitor mengobservasi sinyal awal insiden",
      };
    },
  };
}

function createMonitorAgent() {
  return createBaseAgent({
    name: "noc-monitor-agent",
    llmProvider: createMonitorPlannerProvider(),
  });
}

module.exports = { createMonitorAgent };
