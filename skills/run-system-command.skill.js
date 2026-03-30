"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "run-system-command",
  description: "Menjalankan perintah shell/terminal (shell-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      command: o.command || o.cmd || "pwd",
    };
    const raw = await tools["shell-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
