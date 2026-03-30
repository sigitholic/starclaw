"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "run-sub-agent",
  description: "Menjalankan sub-agent (sub-agent-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const raw = await tools["sub-agent-tool"].run(input);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
