"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");

function createExecutorPlannerProvider() {
  return {
    async plan(_prompt, input = {}) {
      return {
        action: "respond",
        response: JSON.stringify({
          stage: "executor",
          taskId: input.taskId || "noc-task",
          status: "executed",
          action: input.action || "restart-service",
          result: input.result || "action-queued",
        }),
        summary: "Executor mengeksekusi aksi remedi",
      };
    },
  };
}

function createExecutorAgent() {
  return createBaseAgent({
    name: "noc-executor-agent",
    llmProvider: createExecutorPlannerProvider(),
  });
}

module.exports = { createExecutorAgent };
