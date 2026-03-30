"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "monitor-market",
  description: "Memantau data pasar (market-data-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      action: o.action || "quote",
      symbol: o.symbol || "EURUSD=X",
      ...(o.symbols != null ? { symbols: o.symbols } : {}),
      ...(o.period != null ? { period: o.period } : {}),
      ...(o.interval != null ? { interval: o.interval } : {}),
      ...(o.limit != null ? { limit: o.limit } : {}),
      ...(o.indicators != null ? { indicators: o.indicators } : {}),
    };
    const raw = await tools["market-data-tool"].run(toolInput);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
