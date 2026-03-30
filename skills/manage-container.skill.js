"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "manage-container",
  description: "Mengelola Docker/container (docker-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      language: o.language || "node",
      code: o.code || "console.log('starclaw-docker-sandbox-ok');",
    };
    const raw = await tools["docker-tool"].run(toolInput);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
