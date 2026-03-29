"use strict";

function createWorkflowEngine() {
  return {
    async run(agent, payload) {
      if (!agent || typeof agent.run !== "function") {
        throw new Error("Agent tidak valid untuk workflow engine");
      }

      return agent.run(payload);
    },
  };
}

module.exports = { createWorkflowEngine };
