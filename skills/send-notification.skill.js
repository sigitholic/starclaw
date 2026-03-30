"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "send-notification",
  description: "Mengirim notifikasi (notification-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const raw = await tools["notification-tool"].run(input);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
