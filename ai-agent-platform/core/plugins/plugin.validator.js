"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Plugin Validator — validasi struktur plugin sebelum load/run.
 *
 * Dua tipe plugin di Starclaw:
 *
 * TYPE "tool" (default):
 *   Plugin yang menambahkan tools ke agent registry.
 *   Wajib: index.js yang export { name, tools[] }
 *   Opsional: package.json, plugin.json
 *
 * TYPE "service":
 *   Plugin yang berjalan sebagai proses terpisah (HTTP server, dll).
 *   Wajib: package.json dengan minimal salah satu dari: scripts.start, scripts.dev, main
 *   Opsional: plugin.json, src/index.js
 *
 * Validator mendeteksi tipe otomatis berdasarkan isi folder.
 */

const VALIDATION_LEVELS = {
  ERROR: "error",   // Gagal — plugin tidak bisa diload
  WARN: "warn",     // Peringatan — plugin bisa diload tapi ada yang kurang
  INFO: "info",     // Informasi — sekedar catatan
};

/**
 * Validasi plugin untuk diload sebagai tool module.
 *
 * @param {string} pluginDir - Path absolut ke folder plugin
 * @param {string} pluginName - Nama plugin (untuk error message)
 * @returns {{ valid: boolean, errors: [], warnings: [], info: [], type: string }}
 */
function validateToolPlugin(pluginDir, pluginName) {
  const result = { valid: true, errors: [], warnings: [], info: [], type: "tool" };
  const name = pluginName || path.basename(pluginDir);

  // Wajib: index.js
  const indexPath = path.join(pluginDir, "index.js");
  if (!fs.existsSync(indexPath)) {
    result.valid = false;
    result.errors.push({
      level: VALIDATION_LEVELS.ERROR,
      code: "MISSING_INDEX",
      message: `index.js tidak ditemukan di ${pluginDir}`,
      fix: `Buat file ${indexPath} yang meng-export { name, tools[] }`,
    });
    return result;
  }

  // Load dan validasi export
  try {
    delete require.cache[require.resolve(indexPath)];
    const mod = require(indexPath);

    if (!mod.name) {
      result.errors.push({
        level: VALIDATION_LEVELS.ERROR,
        code: "MISSING_NAME",
        message: `Plugin tidak meng-export 'name'`,
        fix: `Tambahkan: module.exports = { name: "${name}", ... }`,
      });
      result.valid = false;
    }

    if (!Array.isArray(mod.tools) && !Array.isArray(mod.workflows)) {
      result.warnings.push({
        level: VALIDATION_LEVELS.WARN,
        code: "NO_TOOLS_OR_WORKFLOWS",
        message: `Plugin tidak meng-export 'tools' atau 'workflows'`,
        fix: "Tambahkan array tools[] atau workflows[] ke export",
      });
    } else if (Array.isArray(mod.tools)) {
      for (const tool of mod.tools) {
        if (!tool.name || !tool.run) {
          result.warnings.push({
            level: VALIDATION_LEVELS.WARN,
            code: "INVALID_TOOL",
            message: `Tool '${tool.name || "unknown"}' tidak valid (butuh name + run())`,
          });
        }
      }
    }
  } catch (err) {
    result.valid = false;
    result.errors.push({
      level: VALIDATION_LEVELS.ERROR,
      code: "LOAD_ERROR",
      message: `Gagal load index.js: ${err.message}`,
      path: indexPath,
    });
  }

  // Opsional: plugin.json
  if (!fs.existsSync(path.join(pluginDir, "plugin.json"))) {
    result.warnings.push({
      level: VALIDATION_LEVELS.WARN,
      code: "MISSING_MANIFEST",
      message: "plugin.json tidak ditemukan",
      fix: `Buat ${path.join(pluginDir, "plugin.json")} dengan { name, version, description, configSchema }`,
    });
  }

  return result;
}

/**
 * Validasi plugin untuk dijalankan sebagai service process.
 *
 * @param {string} pluginDir - Path absolut ke folder plugin
 * @param {string} pluginName - Nama plugin
 * @returns {{ valid: boolean, errors: [], warnings: [], info: [], entrypoint: string, command: string, type: string }}
 */
function validateServicePlugin(pluginDir, pluginName) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
    type: "service",
    entrypoint: null,
    command: null,
    commandType: null, // 'npm-start' | 'npm-dev' | 'node-main'
    port: null,
  };
  const name = pluginName || path.basename(pluginDir);

  // Wajib: folder ada
  if (!fs.existsSync(pluginDir)) {
    result.valid = false;
    result.errors.push({
      level: VALIDATION_LEVELS.ERROR,
      code: "MISSING_DIR",
      message: `Folder plugin tidak ditemukan: ${pluginDir}`,
    });
    return result;
  }

  // Cek package.json
  const pkgPath = path.join(pluginDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    result.warnings.push({
      level: VALIDATION_LEVELS.WARN,
      code: "MISSING_PACKAGE_JSON",
      message: `package.json tidak ditemukan di ${pluginDir}`,
      fix: `Buat package.json dengan scripts.start atau scripts.dev`,
    });
  } else {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch (err) {
      result.valid = false;
      result.errors.push({
        level: VALIDATION_LEVELS.ERROR,
        code: "INVALID_PACKAGE_JSON",
        message: `package.json tidak valid JSON: ${err.message}`,
        path: pkgPath,
      });
      return result;
    }

    const scripts = pkg.scripts || {};
    const mainFile = pkg.main;

    // Resolusi command dengan prioritas: start > dev > main
    if (scripts.start) {
      result.command = "npm run start";
      result.commandType = "npm-start";
      result.info.push({ message: `Menggunakan scripts.start: ${scripts.start}` });
    } else if (scripts.dev) {
      result.command = "npm run dev";
      result.commandType = "npm-dev";
      result.warnings.push({
        level: VALIDATION_LEVELS.WARN,
        code: "USING_DEV_SCRIPT",
        message: `Menggunakan scripts.dev karena scripts.start tidak ada`,
        fix: `Tambahkan scripts.start di package.json untuk production`,
      });
    } else if (mainFile) {
      const mainPath = path.join(pluginDir, mainFile);
      if (!fs.existsSync(mainPath)) {
        result.valid = false;
        result.errors.push({
          level: VALIDATION_LEVELS.ERROR,
          code: "MISSING_MAIN_FILE",
          message: `File main '${mainFile}' tidak ditemukan (didefinisikan di package.json)`,
          path: mainPath,
          fix: `Jalankan build terlebih dahulu atau perbaiki field 'main' di package.json`,
        });
      } else {
        result.command = `node ${mainFile}`;
        result.commandType = "node-main";
        result.info.push({ message: `Menggunakan main: node ${mainFile}` });
      }
    } else {
      result.valid = false;
      result.errors.push({
        level: VALIDATION_LEVELS.ERROR,
        code: "NO_ENTRYPOINT",
        message: `Plugin '${name}' tidak memiliki entrypoint yang valid`,
        detail: {
          path: pluginDir,
          packageJson: pkgPath,
          foundScripts: Object.keys(scripts),
          main: mainFile || "(tidak ada)",
        },
        fix: [
          `Tambahkan salah satu di package.json:`,
          `  "scripts": { "start": "node src/index.js" }  ← REKOMENDASI`,
          `  "scripts": { "dev": "node src/index.js" }`,
          `  "main": "src/index.js"`,
        ].join("\n"),
      });
    }

    // Deteksi port dari package.json atau vite config
    if (scripts.start && scripts.start.includes("--port")) {
      const portMatch = scripts.start.match(/--port[=\s]+(\d+)/);
      if (portMatch) result.port = parseInt(portMatch[1], 10);
    }

    result.entrypoint = result.command;
  }

  // Cek plugin.json untuk metadata service
  const manifestPath = path.join(pluginDir, "plugin.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (manifest.port) result.port = manifest.port;
      if (manifest.type !== "service") {
        result.warnings.push({
          level: VALIDATION_LEVELS.WARN,
          code: "WRONG_TYPE",
          message: `plugin.json mendefinisikan type='${manifest.type}' tapi plugin ini dijalankan sebagai service`,
          fix: `Set "type": "service" di plugin.json`,
        });
      }
    } catch (_) {}
  }

  return result;
}

/**
 * Auto-detect tipe plugin dan validasi.
 * Mendeteksi berdasarkan isi folder.
 */
function validatePlugin(pluginDir, pluginName) {
  const name = pluginName || path.basename(pluginDir);

  // Deteksi tipe dari plugin.json
  const manifestPath = path.join(pluginDir, "plugin.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (manifest.type === "service") {
        return validateServicePlugin(pluginDir, name);
      }
    } catch (_) {}
  }

  // Deteksi dari struktur folder
  const hasIndexJs = fs.existsSync(path.join(pluginDir, "index.js"));
  const hasPkgJson = fs.existsSync(path.join(pluginDir, "package.json"));
  const hasSrcDir = fs.existsSync(path.join(pluginDir, "src"));

  // Jika punya package.json dengan scripts dan tidak punya index.js → service
  if (hasPkgJson && !hasIndexJs) {
    return validateServicePlugin(pluginDir, name);
  }

  // Jika punya src/ dan package.json tapi tidak ada index.js di root → service
  if (hasSrcDir && hasPkgJson && !hasIndexJs) {
    return validateServicePlugin(pluginDir, name);
  }

  // Default: tool plugin
  return validateToolPlugin(pluginDir, name);
}

/**
 * Format hasil validasi menjadi string yang mudah dibaca.
 */
function formatValidationResult(result, pluginName) {
  const lines = [`[Plugin Validator] ${pluginName} (type: ${result.type})`];

  if (result.valid) {
    lines.push(`✅ Valid`);
    if (result.command) lines.push(`   Command: ${result.command}`);
  } else {
    lines.push(`❌ Tidak Valid`);
  }

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    result.errors.forEach(e => {
      lines.push(`  ❌ [${e.code}] ${e.message}`);
      if (e.fix) lines.push(`     Fix: ${e.fix}`);
      if (e.detail) lines.push(`     Detail: ${JSON.stringify(e.detail, null, 2).replace(/\n/g, "\n     ")}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`);
    result.warnings.forEach(w => {
      lines.push(`  ⚠️  [${w.code}] ${w.message}`);
      if (w.fix) lines.push(`     Fix: ${w.fix}`);
    });
  }

  return lines.join("\n");
}

module.exports = {
  validatePlugin,
  validateToolPlugin,
  validateServicePlugin,
  formatValidationResult,
  VALIDATION_LEVELS,
};
