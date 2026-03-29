"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { createTimeTool } = require("../../../core/tools/time.tool");

// Platform assistant kini adalah LLM Murni karena tidak mengirimkan custom llmProvider statis.
function createPlatformAssistantAgent() {
  return createBaseAgent({
    name: "platform-assistant-agent",
    customTools: [createTimeTool()],
  });
}

module.exports = { createPlatformAssistantAgent };
