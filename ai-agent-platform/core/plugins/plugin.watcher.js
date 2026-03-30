"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Plugin Watcher — auto-discover dan load plugin baru dari folder plugins/.
 *
 * Mode:
 *   - Scan saat startup: load semua plugin yang belum dimuat
 *   - Watch mode: deteksi penambahan plugin baru secara real-time
 *
 * Trigger reload jika:
 *   - Folder baru ditambahkan ke plugins/ (plugin baru di-install)
 *   - index.js di folder plugin diubah (development mode)
 */
function createPluginWatcher({ pluginManager, pluginsDir, logger, watchMode = true }) {
  const resolvedDir = path.resolve(pluginsDir);
  let watcher = null;
  let debounceTimer = null;

  function getPluginDirs() {
    if (!fs.existsSync(resolvedDir)) return [];
    return fs.readdirSync(resolvedDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  }

  function tryLoadPlugin(pluginName) {
    const indexPath = path.join(resolvedDir, pluginName, "index.js");
    if (!fs.existsSync(indexPath)) return;

    const existing = pluginManager.listPlugins().find(p => p.name === pluginName);
    if (existing) return; // Sudah dimuat

    try {
      const result = pluginManager.loadPlugin(indexPath, pluginName);
      if (result.success) {
        logger.info(`[PluginWatcher] Plugin '${pluginName}' berhasil dimuat otomatis`, {
          tools: result.tools,
        });
      }
    } catch (err) {
      logger.warn(`[PluginWatcher] Gagal load plugin '${pluginName}': ${err.message}`);
    }
  }

  function scanAndLoad() {
    const dirs = getPluginDirs();
    let loaded = 0;
    for (const name of dirs) {
      const before = pluginManager.listPlugins().length;
      tryLoadPlugin(name);
      if (pluginManager.listPlugins().length > before) loaded++;
    }
    if (loaded > 0) {
      logger.info(`[PluginWatcher] Scan selesai: ${loaded} plugin baru dimuat`);
    }
    return loaded;
  }

  function startWatching() {
    if (!watchMode || watcher) return;
    if (!fs.existsSync(resolvedDir)) return;

    watcher = fs.watch(resolvedDir, { recursive: false }, (eventType, filename) => {
      if (!filename) return;
      // Debounce — tunggu 500ms sebelum proses event
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const pluginName = filename.split(path.sep)[0];
        const pluginPath = path.join(resolvedDir, pluginName, "index.js");
        if (fs.existsSync(pluginPath)) {
          logger.info(`[PluginWatcher] Perubahan terdeteksi: ${pluginName}`);
          tryLoadPlugin(pluginName);
        }
      }, 500);
    });

    logger.info(`[PluginWatcher] Watching: ${resolvedDir}`);
  }

  function stop() {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    clearTimeout(debounceTimer);
  }

  return { scanAndLoad, startWatching, stop };
}

module.exports = { createPluginWatcher };
