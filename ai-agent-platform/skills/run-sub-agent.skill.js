"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "run-sub-agent",
  description: "Menjalankan sub-agent (sub-agent-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const action = o.action || "list";
    const toolInput = {
      action,
      ...(o.name != null ? { name: o.name } : {}),
      ...(o.task != null ? { task: o.task } : {}),
      ...(o.childId != null ? { childId: o.childId } : {}),
    };
    const raw = await tools["sub-agent-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
