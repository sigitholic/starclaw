"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "monitor-market",
  description: "Memantau data pasar (market-data-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const raw = await tools["market-data-tool"].run(input);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
