"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

/**
 * Skill layer — contoh: diagnosis sistem via doctor-tool (multi-step logic di atas tool).
 */
module.exports = {
  name: "check-system",
  description: "Memeriksa kesehatan sistem (doctor-tool diagnose).",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", description: "Area diagnosis: all, core, tools (opsional)" },
    },
  },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const raw = await tools["doctor-tool"].run({
      action: "diagnose",
      ...(o.target != null ? { target: o.target } : {}),
    });
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
