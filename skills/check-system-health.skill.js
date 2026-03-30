"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "check-system-health",
  description: "Memeriksa kesehatan sistem platform (doctor-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const raw = await tools["doctor-tool"].run(input);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
