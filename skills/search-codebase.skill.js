"use strict";

const path = require("path");

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "search-codebase",
  description: "Mencari di codebase (codebase-search-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const defaultPath = path.join("package.json");
    const toolInput = {
      action: o.action || "get_summary",
      path: o.path || defaultPath,
      ...(o.symbol != null && o.symbol !== "" ? { symbol: o.symbol } : {}),
    };
    const raw = await tools["codebase-search-tool"].run(toolInput);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
