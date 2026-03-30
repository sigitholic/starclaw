"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "check-system-health",
  description: "Memeriksa kesehatan sistem platform (doctor-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      action: "diagnose",
      target: o.target || "all",
    };
    const raw = await tools["doctor-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
