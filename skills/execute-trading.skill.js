"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "execute-trading",
  description: "Eksekusi trading MT5/MQL5 (mt5-bridge-tool + mql5-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const bridgeFirst = input && input.bridgeFirst !== false;
    let bridgeOut = null;
    let mqlOut = null;

    if (bridgeFirst) {
      bridgeOut = normalizeToolResult(await tools["mt5-bridge-tool"].run(input.bridgeInput || input));
      mqlOut = normalizeToolResult(await tools["mql5-tool"].run(input.mqlInput || input));
    } else {
      mqlOut = normalizeToolResult(await tools["mql5-tool"].run(input.mqlInput || input));
      bridgeOut = normalizeToolResult(await tools["mt5-bridge-tool"].run(input.bridgeInput || input));
    }

    const ok = bridgeOut.success !== false && mqlOut.success !== false;
    return {
      success: ok,
      data: { mt5Bridge: bridgeOut, mql5: mqlOut },
    };
  },
};
