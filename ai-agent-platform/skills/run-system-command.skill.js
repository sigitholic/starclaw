"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "run-system-command",
  description: "Menjalankan perintah shell/terminal (shell-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const target = typeof o.target === "string" ? o.target.trim() : "";
    const explicit = o.command || o.cmd;
    let command;
    if (explicit) {
      command = explicit;
    } else if (target) {
      command = `ping -c 4 ${target}`;
    } else {
      command = "pwd";
    }
    const toolInput = { command };
    const raw = await tools["shell-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
