"use strict";

const path = require("path");
const fs = require("fs");
const { createClawHubRegistry } = require("../plugins/clawhub.registry");

/**
 * Plugin Tool — LLM-facing tool untuk manage plugin.
 * Memungkinkan agent mengelola plugin secara otonom,
 * termasuk membuat plugin baru dan install dari ClawHub/GitHub.
 *
 * @param {object} pluginManager — Instance dari createPluginManager()
 */
function createPluginTool(pluginManager) {
  const clawHub = createClawHubRegistry();

  return {
    name: "plugin-tool",
    description: "Kelola plugin platform Starclaw. Bisa list, install, create, load, unload plugin. Juga bisa install dari GitHub (ClawHub) atau buat plugin template baru.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'list' (plugin terinstall), 'load-all' (muat semua), 'load' (muat 1), 'unload' (hapus), 'create' (buat plugin baru dari template), 'install-github' (install dari GitHub), 'clawhub' (lihat daftar plugin ClawHub)"
        },
        pluginName: {
          type: "string",
          description: "(untuk load/unload/create) Nama plugin"
        },
        source: {
          type: "string",
          description: "(untuk install-github) URL GitHub: 'github:user/repo' atau 'https://github.com/user/repo'"
        },
        description: {
          type: "string",
          description: "(untuk create) Deskripsi plugin yang akan dibuat"
        },
        toolName: {
          type: "string",
          description: "(untuk create) Nama tool yang akan dibuat di plugin"
        },
        toolDescription: {
          type: "string",
          description: "(untuk create) Deskripsi tool yang akan dibuat"
        },
      },
      required: ["action"],
    },

    async run(input) {
      switch (input.action) {
        case "list": {
          const list = pluginManager.listPlugins();
          if (list.length === 0) {
            return {
              success: true,
              plugins: [],
              message: "Belum ada plugin aktif. Gunakan 'load-all' atau 'create' untuk membuat plugin baru.",
            };
          }
          return { success: true, plugins: list, total: list.length };
        }

        case "load-all": {
          const pluginsDir = path.resolve(process.cwd(), "plugins");
          const result = pluginManager.loadPlugins(pluginsDir);
          return {
            success: true,
            loaded: result.loaded,
            errors: result.errors,
            message: `${result.loaded} plugin dimuat dari ${pluginsDir}`,
          };
        }

        case "load": {
          if (!input.pluginName) return { error: "Parameter 'pluginName' wajib" };
          const pluginPath = path.resolve(process.cwd(), "plugins", input.pluginName, "index.js");
          if (!fs.existsSync(pluginPath)) {
            return { error: `Plugin '${input.pluginName}' tidak ditemukan di ${pluginPath}` };
          }
          return pluginManager.loadPlugin(pluginPath, input.pluginName);
        }

        case "unload": {
          if (!input.pluginName) return { error: "Parameter 'pluginName' wajib" };
          return pluginManager.unloadPlugin(input.pluginName);
        }

        // === FITUR BARU: Buat plugin dari template ===
        case "create": {
          if (!input.pluginName) return { error: "Parameter 'pluginName' wajib untuk membuat plugin" };
          const result = clawHub.createPluginTemplate(input.pluginName, {
            description: input.description || "",
            toolName: input.toolName || "",
            toolDescription: input.toolDescription || "",
          });
          return result;
        }

        // === FITUR BARU: Install dari GitHub ===
        case "install-github": {
          if (!input.pluginName) return { error: "Parameter 'pluginName' wajib (nama folder plugin)" };
          if (!input.source) return { error: "Parameter 'source' wajib (URL GitHub: 'github:user/repo')" };
          const result = await clawHub.installFromGitHub(input.pluginName, input.source);
          return result;
        }

        // === FITUR BARU: Lihat daftar ClawHub registry ===
        case "clawhub": {
          const available = clawHub.listAvailable();
          return {
            success: true,
            available,
            total: available.length,
            message: `${available.length} plugin tersedia di ClawHub registry`,
          };
        }

        default:
          return { error: `Action '${input.action}' tidak dikenal. Pilih: list, load-all, load, unload, create, install-github, clawhub` };
      }
    },
  };
}

module.exports = { createPluginTool };
