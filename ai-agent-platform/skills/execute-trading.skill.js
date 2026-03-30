"use strict";

const { normalizeToolResult, mergeToolLines } = require("./skill-result.helper");

function bridgePayload(o) {
  const base = {
    action: o.bridgeAction || "status",
    ...(o.symbol != null ? { symbol: o.symbol } : {}),
    ...(o.volume != null ? { volume: o.volume } : {}),
    ...(o.stopLoss != null ? { stopLoss: o.stopLoss } : {}),
    ...(o.takeProfit != null ? { takeProfit: o.takeProfit } : {}),
    ...(o.comment != null ? { comment: o.comment } : {}),
    ...(o.magic != null ? { magic: o.magic } : {}),
    ...(o.ticket != null ? { ticket: o.ticket } : {}),
    ...(o.days != null ? { days: o.days } : {}),
  };
  if (o.bridgeInput && typeof o.bridgeInput === "object") {
    return { ...base, ...o.bridgeInput };
  }
  return base;
}

function mqlPayload(o) {
  const base = {
    action: o.mqlAction || "list",
    ...(o.name != null ? { name: o.name } : {}),
    ...(o.description != null ? { description: o.description } : {}),
    ...(o.code != null ? { code: o.code } : {}),
    ...(o.inputs != null ? { inputs: o.inputs } : {}),
    ...(o.strategy != null ? { strategy: o.strategy } : {}),
    ...(o.buffers != null ? { buffers: o.buffers } : {}),
    ...(o.filename != null ? { filename: o.filename } : {}),
  };
  if (o.mqlInput && typeof o.mqlInput === "object") {
    return { ...base, ...o.mqlInput };
  }
  return base;
}

module.exports = {
  name: "execute-trading",
  description: "Eksekusi trading MT5/MQL5 (mt5-bridge-tool + mql5-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const bridgeFirst = o.bridgeFirst !== false;
    let bridgeOut = null;
    let mqlOut = null;

    const bIn = bridgePayload(o);
    const mIn = mqlPayload(o);

    if (bridgeFirst) {
      bridgeOut = normalizeToolResult(await tools["mt5-bridge-tool"].run(bIn));
      mqlOut = normalizeToolResult(await tools["mql5-tool"].run(mIn));
    } else {
      mqlOut = normalizeToolResult(await tools["mql5-tool"].run(mIn));
      bridgeOut = normalizeToolResult(await tools["mt5-bridge-tool"].run(bIn));
    }

    return mergeToolLines([
      { key: "MT5 bridge", normalized: bridgeOut },
      { key: "MQL5", normalized: mqlOut },
    ]);
  },
};
