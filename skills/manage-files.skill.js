"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "manage-files",
  description: "Operasi file dan direktori (fs-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      action: o.action || "list",
      path: o.path || ".",
      ...(o.content != null ? { content: o.content } : {}),
    };
    const raw = await tools["fs-tool"].run(toolInput);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
