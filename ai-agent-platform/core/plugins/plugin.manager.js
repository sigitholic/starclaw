"use strict";

const fs = require("fs");
const path = require("path");
const { validateToolContract } = require("../utils/validator");
const { injectPluginConfig, readPluginConfig, readPluginManifest } = require("./plugin.config.store");
const { validatePlugin, validateToolPlugin, formatValidationResult } = require("./plugin.validator");

/**
 * Plugin Manager — dynamic plugin loader & lifecycle manager.
 *
 * Plugin contract: setiap plugin di plugins/<nama>/ harus punya index.js yang export:
 * {
 *   name: "plugin-name",
 *   version: "1.0.0",
 *   description: "Deskripsi plugin",
 *   tools: [toolObject, ...],       // Tool instances (opsional)
 *   workflows: [workflowRegistration, ...],  // { name, handler } (opsional)
 *   activate(context),              // Lifecycle hook (opsional)
 *   deactivate(),                   // Cleanup hook (opsional)
 * }
 */
function createPluginManager({ toolsRegistry, orchestrator = null } = {}) {
  const plugins = new Map(); // name → { meta, tools[], workflows[], status }

  /**
   * Load semua plugin dari folder plugins/.
   * @param {string} pluginsDir - Path absolut ke folder plugins/
   */
  function loadPlugins(pluginsDir) {
    const normalizedDir = path.resolve(pluginsDir);
    if (!fs.existsSync(normalizedDir)) {
      console.log(`[PluginManager] Folder plugins/ tidak ditemukan: ${normalizedDir}. Membuat...`);
      fs.mkdirSync(normalizedDir, { recursive: true });
      return { loaded: 0, errors: [] };
    }

    const entries = fs.readdirSync(normalizedDir, { withFileTypes: true });
    const errors = [];
    let loaded = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginDir = path.join(normalizedDir, entry.name);

      // Auto-detect tipe plugin
      const pluginValidation = validatePlugin(pluginDir, entry.name);

      if (pluginValidation.type === "service") {
        // Plugin service tidak di-load sebagai module — hanya dicatat
        console.log(`[PluginManager] Plugin '${entry.name}' adalah tipe 'service' — gunakan /plugin run untuk menjalankan`);
        continue;
      }

      const pluginPath = path.join(pluginDir, "index.js");
      if (!fs.existsSync(pluginPath)) {
        errors.push({ name: entry.name, error: "index.js tidak ditemukan (tipe tool)" });
        continue;
      }

      try {
        const result = loadPlugin(pluginPath, entry.name);
        if (result.success) loaded++;
        else errors.push({ name: entry.name, error: result.error });
      } catch (err) {
        errors.push({ name: entry.name, error: err.message });
      }
    }

    console.log(`[PluginManager] ${loaded} plugin dimuat, ${errors.length} error`);
    return { loaded, errors };
  }

  /**
   * Load satu plugin dari path.
   * Mendukung tipe "tool" (module) dan "service" (informasi saja — run via process.manager).
   */
  function loadPlugin(pluginPath, fallbackName) {
    const normalizedPath = path.resolve(pluginPath);
    const pluginDir = path.dirname(normalizedPath);
    const pluginConfigName = fallbackName || path.basename(pluginDir);

    // === VALIDASI SEBELUM LOAD ===
    const validation = validateToolPlugin(pluginDir, pluginConfigName);

    if (!validation.valid) {
      const formatted = formatValidationResult(validation, pluginConfigName);
      console.error(formatted);
      return {
        success: false,
        error: `Plugin '${pluginConfigName}' gagal validasi`,
        validationErrors: validation.errors.map(e => `[${e.code}] ${e.message}`),
        hint: validation.errors.map(e => e.fix).filter(Boolean).join(" | "),
      };
    }

    // Log warnings dari validasi
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => {
        console.warn(`[PluginManager] ⚠️  ${pluginConfigName}: ${w.message}${w.fix ? ` → ${w.fix}` : ""}`);
      });
    }

    // Clear require cache agar bisa reload
    delete require.cache[normalizedPath];

    // Inject config plugin sebelum load
    injectPluginConfig(pluginConfigName);

    const pluginModule = require(normalizedPath);
    const name = pluginModule.name || fallbackName;

    if (!name) {
      return { success: false, error: "Plugin harus punya properti 'name'" };
    }

    if (plugins.has(name)) {
      return { success: false, error: `Plugin '${name}' sudah dimuat` };
    }

    // Register tools
    const registeredTools = [];
    if (Array.isArray(pluginModule.tools)) {
      for (const tool of pluginModule.tools) {
        try {
          validateToolContract(tool);
          if (toolsRegistry && typeof toolsRegistry.register === "function") {
            toolsRegistry.register(tool);
          }
          registeredTools.push(tool.name);
        } catch (err) {
          console.warn(`[PluginManager] Tool '${tool.name || "unknown"}' dari plugin '${name}' gagal validasi: ${err.message}`);
        }
      }
    }

    // Register workflows
    const registeredWorkflows = [];
    if (Array.isArray(pluginModule.workflows) && orchestrator) {
      for (const wf of pluginModule.workflows) {
        if (wf.name && typeof wf.handler === "function") {
          orchestrator.registerWorkflow(wf.name, wf.handler);
          registeredWorkflows.push(wf.name);
        }
      }
    }

    // Lifecycle hook: activate
    if (typeof pluginModule.activate === "function") {
      try {
        pluginModule.activate({ toolsRegistry, orchestrator });
      } catch (err) {
        console.warn(`[PluginManager] Plugin '${name}' activate() gagal: ${err.message}`);
      }
    }

    // Baca config keys yang sudah disimpan untuk info
    const savedConfig = readPluginConfig(name);
    const configKeys = Object.keys(savedConfig);

    plugins.set(name, {
      meta: {
        name,
        version: pluginModule.version || "0.0.0",
        description: pluginModule.description || "",
        path: normalizedPath,
      },
      tools: registeredTools,
      workflows: registeredWorkflows,
      status: "active",
      configKeys,
    });

    const configNote = configKeys.length > 0 ? ` (config: ${configKeys.join(", ")})` : "";
    console.log(`[PluginManager] Plugin '${name}' v${pluginModule.version || "0.0.0"} dimuat (${registeredTools.length} tools, ${registeredWorkflows.length} workflows${configNote})`);
    return { success: true, name, tools: registeredTools, workflows: registeredWorkflows, configKeys };
  }

  /**
   * Unload plugin — hapus tools & workflows dari registry.
   */
  function unloadPlugin(name) {
    const plugin = plugins.get(name);
    if (!plugin) {
      return { success: false, error: `Plugin '${name}' tidak ditemukan` };
    }

    // Unregister tools
    if (toolsRegistry && typeof toolsRegistry.unregister === "function") {
      for (const toolName of plugin.tools) {
        toolsRegistry.unregister(toolName);
      }
    }

    // Lifecycle hook: deactivate
    try {
      const pluginModule = require(plugin.meta.path);
      if (typeof pluginModule.deactivate === "function") {
        pluginModule.deactivate();
      }
    } catch (_err) { /* ignore */ }

    // Clear require cache
    delete require.cache[plugin.meta.path];
    plugins.delete(name);

    console.log(`[PluginManager] Plugin '${name}' di-unload`);
    return { success: true, message: `Plugin '${name}' berhasil di-unload` };
  }

  /**
   * Daftar semua plugin yang terinstall.
   */
  function listPlugins() {
    return Array.from(plugins.values()).map(p => {
      const manifest = readPluginManifest(p.meta.name);
      const savedConfig = readPluginConfig(p.meta.name);
      const schema = manifest && manifest.configSchema ? manifest.configSchema : [];

      // Cek required fields yang belum dikonfigurasi
      const missingConfig = schema
        .filter(f => f.required && !savedConfig[f.key] && !process.env[f.key])
        .map(f => f.key);

      return {
        name: p.meta.name,
        version: p.meta.version,
        description: p.meta.description,
        tools: p.tools,
        workflows: p.workflows,
        status: missingConfig.length > 0 ? "config-needed" : p.status,
        configuredKeys: Object.keys(savedConfig),
        missingConfig,
        hint: missingConfig.length > 0
          ? `Gunakan: plugin-config-tool schema ${p.meta.name} untuk lihat parameter yang dibutuhkan`
          : null,
      };
    });
  }

  return {
    loadPlugins,
    loadPlugin,
    unloadPlugin,
    listPlugins,
    get size() { return plugins.size; },
  };
}

module.exports = { createPluginManager };
