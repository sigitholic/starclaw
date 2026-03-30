"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "manage-plugin",
  description: "Mengelola plugin dan konfigurasinya (plugin-tool + plugin-config-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const mode = o.mode ? String(o.mode) : "plugin";

    const basePlugin = { action: o.action || "list" };
    const pluginInput = {
      ...basePlugin,
      ...(o.pluginName != null ? { pluginName: o.pluginName } : {}),
      ...(o.source != null ? { source: o.source } : {}),
      ...(o.description != null ? { description: o.description } : {}),
      ...(o.toolName != null ? { toolName: o.toolName } : {}),
      ...(o.toolDescription != null ? { toolDescription: o.toolDescription } : {}),
    };

    const baseConfig = { action: o.configAction || o.action || "list" };
    const configInput = {
      ...baseConfig,
      ...(o.plugin != null ? { plugin: o.plugin } : {}),
      ...(o.key != null ? { key: o.key } : {}),
      ...(o.value != null ? { value: o.value } : {}),
    };

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
    if (o.alsoConfig === true) {
      configOut = normalizeToolResult(await tools["plugin-config-tool"].run(configInput));
    }
    const ok = pluginOut.success !== false && (!configOut || configOut.success !== false);
    return {
      success: ok,
      data: { plugin: pluginOut, config: configOut },
    };
  },
};
