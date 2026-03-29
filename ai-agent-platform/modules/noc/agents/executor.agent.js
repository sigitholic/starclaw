"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");

function createExecutorAgent() {
  return createBaseAgent({ name: "noc-executor-agent" });
}

module.exports = { createExecutorAgent };
