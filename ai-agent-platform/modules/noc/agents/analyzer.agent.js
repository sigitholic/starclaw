"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");

function createAnalyzerAgent() {
  return createBaseAgent({ name: "noc-analyzer-agent" });
}

module.exports = { createAnalyzerAgent };
