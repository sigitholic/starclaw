"use strict";

const { createHttpTool } = require("./http.tool");
const { createTimeTool } = require("./time.tool");
const { createShellTool } = require("./shell.tool");
const { createFsTool } = require("./fs.tool");
const { createWebSearchTool } = require("./web-search.tool");
const { createCodebaseSearchTool } = require("./codebase-search.tool");
const { createBrowserTool } = require("./browser.tool");
const { createDockerTool } = require("./docker.tool");
const { createDoctorTool } = require("./doctor.tool");
const { createPluginTool } = require("./plugin.tool");
const { createSubAgentTool } = require("./sub-agent.tool");
const { createCronTool } = require("./cron.tool");
const { createGenieAcsTool } = require("./genieacs.tool");
const { createSocialMediaTool } = require("./social-media.tool");
const { createNotificationTool } = require("./notification.tool");
const { createDatabaseTool } = require("./database.tool");
const { createMarketDataTool } = require("./market-data.tool");
const { createMql5Tool } = require("./mql5.tool");
const { createMt5BridgeTool } = require("./mt5-bridge.tool");
const { createPluginConfigTool } = require("./plugin-config.tool");
const { validateToolContract } = require("../utils/validator");
const { createPluginManager } = require("../plugins/plugin.manager");
const { createSubAgentManager } = require("../agent/sub-agent.manager");
const { createCronManager } = require("../scheduler/cron.manager");

function createToolRegistry(customTools = []) {
  const tools = new Map();

  /**
   * Fuzzy match — cari tool berdasarkan nama parsial.
   * Contoh: "genieacs" → "genieacs-tool", "github" → "github-tool"
   * Return nama tool yang cocok atau null.
   */
  function fuzzyMatch(name) {
    if (!name || typeof name !== "string") return null;
    const lower = name.toLowerCase().replace(/[-_\s]/g, "");
    const lowerHyphen = name.toLowerCase();

    // Exact match
    if (tools.has(name)) return name;

    // Coba tambah "-tool" suffix
    const withSuffix = name.endsWith("-tool") ? name : `${name}-tool`;
    if (tools.has(withSuffix)) return withSuffix;

    // Cari berdasarkan nama tanpa suffix "-tool"
    const withoutSuffix = lowerHyphen.replace(/-tool$/, "");
    const prefixMatch = Array.from(tools.keys()).find(toolName => {
      const tNorm = toolName.toLowerCase().replace(/-tool$/, "");
      return tNorm === withoutSuffix || tNorm.startsWith(withoutSuffix) || withoutSuffix.startsWith(tNorm);
    });
    if (prefixMatch) return prefixMatch;

    // Substring match (normalisasi semua separator)
    const candidates = Array.from(tools.keys()).filter(toolName => {
      const normalized = toolName.toLowerCase().replace(/[-_\s]/g, "");
      return normalized.includes(lower) || lower.includes(normalized.replace(/tool$/, ""));
    });

    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      // Pilih yang paling pendek (lebih spesifik)
      return candidates.sort((a, b) => a.length - b.length)[0];
    }

    return null;
  }

  const registryObj = {
    /**
     * Ambil tool berdasarkan nama eksak.
     */
    get(name) { return tools.get(name); },

    /**
     * Cek apakah tool ada di registry.
     */
    has(name) { return tools.has(name); },

    /**
     * List semua nama tool yang terdaftar.
     */
    list() { return Array.from(tools.keys()); },

    /**
     * Resolve tool dengan fuzzy matching.
     * Return { tool, resolvedName, wasExact, suggestion }
     */
    resolve(name) {
      // Exact match
      if (tools.has(name)) {
        return { tool: tools.get(name), resolvedName: name, wasExact: true };
      }
      // Fuzzy match
      const matched = fuzzyMatch(name);
      if (matched) {
        return { tool: tools.get(matched), resolvedName: matched, wasExact: false, suggestion: matched };
      }
      // Tidak ditemukan — kembalikan debug info
      return {
        tool: null,
        resolvedName: null,
        wasExact: false,
        suggestion: null,
        available: Array.from(tools.keys()),
        debugMessage: `Tool '${name}' tidak ditemukan. Tool tersedia: [${Array.from(tools.keys()).join(", ")}]`,
      };
    },

    /**
     * Schemas untuk dikirim ke LLM — format structured JSON.
     */
    getToolSchemas() {
      return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: t.description || "Tak ada deskripsi",
        parameters: t.parameters || {},
      }));
    },

    /**
     * Schema singkat — hanya name + description (hemat token).
     */
    getToolList() {
      return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: (t.description || "").split(".")[0], // Hanya kalimat pertama
      }));
    },

    /**
     * Input schema untuk satu tool tertentu (untuk inject ke prompt LLM).
     */
    getInputSchema(name) {
      const tool = tools.get(name);
      if (!tool) return null;
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || {},
        required: tool.parameters?.required || [],
      };
    },

    register(tool) {
      validateToolContract(tool);
      if (tools.has(tool.name)) {
        console.warn(`[ToolRegistry] Tool '${tool.name}' sudah terdaftar — lewati duplikat`);
        return;
      }
      tools.set(tool.name, tool);
      console.log(`[ToolRegistry] Tool '${tool.name}' didaftarkan secara dinamis`);
    },

    unregister(name) {
      if (tools.has(name)) {
        tools.delete(name);
        console.log(`[ToolRegistry] Tool '${name}' dihapus dari registry`);
      }
    },

    get size() { return tools.size; },
  };

  // Inisialisasi managers SETELAH registry object dibuat
  const pluginManager = createPluginManager({ toolsRegistry: registryObj });
  const subAgentManager = createSubAgentManager();
  const cronManager = createCronManager();

  const builtins = [
    createHttpTool(),
    createTimeTool(),
    createShellTool(),
    createFsTool(),
    createWebSearchTool(),
    createCodebaseSearchTool(),
    createBrowserTool(),
    createDockerTool(),
    createDoctorTool(),
    createPluginTool(pluginManager),
    createSubAgentTool(subAgentManager),
    createCronTool(cronManager),
    // Tools baru
    createGenieAcsTool(),
    createSocialMediaTool(),
    createNotificationTool(),
    createDatabaseTool(),
    // Trading & Financial
    createMarketDataTool(),
    createMql5Tool(),
    createMt5BridgeTool(),
    // Plugin & config management
    createPluginConfigTool(),
    ...customTools,
  ];

  builtins.forEach((tool) => {
    validateToolContract(tool);
    tools.set(tool.name, tool);
  });

  return registryObj;
}

module.exports = { createToolRegistry };
