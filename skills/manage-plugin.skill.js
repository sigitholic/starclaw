"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "manage-plugin",
  description: "Mengelola plugin dan konfigurasinya (plugin-tool + plugin-config-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const mode = input && input.mode ? String(input.mode) : "plugin";
    const pluginInput = input.pluginInput != null ? input.pluginInput : input;
    const configInput = input.configInput != null ? input.configInput : input;

    if (mode === "config" || mode === "plugin-config") {
      const raw = await tools["plugin-config-tool"].run(configInput);
      const normalized = normalizeToolResult(raw);
      return {
        success: normalized.success !== false,
        data: { step: "plugin-config-tool", result: normalized },
      };
    }

    const pluginOut = normalizeToolResult(await tools["plugin-tool"].run(pluginInput));
    let configOut = null;
    if (input && input.alsoConfig === true) {
      configOut = normalizeToolResult(await tools["plugin-config-tool"].run(configInput));
    }
    const ok = pluginOut.success !== false && (!configOut || configOut.success !== false);
    return {
      success: ok,
      data: { plugin: pluginOut, config: configOut },
    };
  },
};
