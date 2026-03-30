"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "run-system-command",
  description: "Menjalankan perintah shell/terminal (shell-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const raw = await tools["shell-tool"].run(input);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
