"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { createOpenClawGapAnalyzerTool } = require("../tools/openclaw-gap-analyzer.tool");

function createOpenClawArchitectureMapperAgent() {
  return createBaseAgent({
    name: "openclaw-architecture-mapper",
    customTools: [createOpenClawGapAnalyzerTool()],
  });
}

module.exports = { createOpenClawArchitectureMapperAgent };
