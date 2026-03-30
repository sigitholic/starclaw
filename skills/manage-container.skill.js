"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "manage-container",
  description: "Mengelola Docker/container (docker-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      language: o.language || "node",
      code: o.code || "console.log('starclaw-docker-sandbox-ok');",
    };
    const raw = await tools["docker-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
