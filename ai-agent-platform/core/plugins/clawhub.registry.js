"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * ClawHub Registry — Install plugin/modul dari GitHub atau sumber remote.
 *
 * Mendukung 3 tipe proyek:
 *   1. Plugin Starclaw (punya index.js yang export { name, tools[], ... })
 *   2. Node.js Module (punya package.json dengan "main" field)
 *   3. App/Service (proyek penuh seperti openclaw-office — clone + npm install + npm start)
 *
 * Auto-detect:
 *   - index.js → Plugin langsung
 *   - package.json + main → Node module
 *   - package.json + scripts.start → App/service
 *   - package.json + scripts.dev → App/service (dev mode)
 */

// Built-in registry
const CLAWHUB_REGISTRY = {
  "web-monitor": {
    description: "Monitor website dan cek uptime secara berkala",
    source: "template",
  },
  "crypto-tracker": {
    description: "Track harga cryptocurrency real-time",
    source: "template",
  },
  "file-converter": {
    description: "Konversi file antar format (JSON, CSV, XML)",
    source: "template",
  },
  "scheduler": {
    description: "Jadwalkan task otomatis dengan cron-like syntax",
    source: "template",
  },
  "notifier": {
    description: "Kirim notifikasi ke berbagai channel (email, webhook, dll)",
    source: "template",
  },
};

function createClawHubRegistry({ pluginsDir } = {}) {
  const baseDir = pluginsDir || path.resolve(process.cwd(), "plugins");

  /**
   * Deteksi tipe proyek setelah di-clone.
   * Return: { type, entryPoint, scripts, description }
   */
  function detectProjectType(targetDir) {
    const result = {
      type: "unknown",
      entryPoint: null,
      scripts: {},
      description: "",
      name: path.basename(targetDir),
    };

    // 1. Cek package.json
    const pkgPath = path.join(targetDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        result.name = pkg.name || result.name;
        result.description = pkg.description || "";
        result.scripts = pkg.scripts || {};

        // Cek field "main" untuk entry point
        if (pkg.main && fs.existsSync(path.join(targetDir, pkg.main))) {
          result.entryPoint = pkg.main;
        }
      } catch { /* ignore parse errors */ }
    }

    // 2. Cek entry point candidates (dalam urutan prioritas)
    const candidates = [
      "index.js",
      "index.ts",
      "src/index.js",
      "src/index.ts",
      "src/main.js",
      "src/main.ts",
      "lib/index.js",
      "dist/index.js",
    ];

    if (!result.entryPoint) {
      for (const candidate of candidates) {
        if (fs.existsSync(path.join(targetDir, candidate))) {
          result.entryPoint = candidate;
          break;
        }
      }
    }

    // 3. Tentukan type berdasarkan apa yang tersedia
    if (result.entryPoint) {
      // Coba require untuk cek apakah plugin contract valid
      const ext = path.extname(result.entryPoint);
      if (ext === ".js") {
        try {
          const mod = require(path.join(targetDir, result.entryPoint));
          if (mod.name && (Array.isArray(mod.tools) || typeof mod.activate === "function")) {
            result.type = "starclaw-plugin";
          } else {
            result.type = "node-module";
          }
        } catch {
          result.type = "node-module";
        }
      } else {
        // TypeScript file — perlu build
        result.type = "app-service";
      }
    } else if (result.scripts.start || result.scripts.dev) {
      result.type = "app-service";
    } else {
      result.type = "generic-repo";
    }

    return result;
  }

  return {
    /**
     * Daftar semua plugin yang tersedia di ClawHub registry.
     */
    listAvailable() {
      return Object.entries(CLAWHUB_REGISTRY).map(([name, info]) => ({
        name,
        description: info.description,
        source: info.source,
        installed: fs.existsSync(path.join(baseDir, name)),
      }));
    },

    /**
     * Install plugin/module dari GitHub.
     * Otomatis deteksi tipe proyek dan berikan panduan yang tepat.
     */
    async installFromGitHub(name, source) {
      const targetDir = path.join(baseDir, name);

      // Parse GitHub URL
      let gitUrl = source;
      if (source.startsWith("github:")) {
        gitUrl = `https://github.com/${source.replace("github:", "")}.git`;
      } else if (source.startsWith("https://github.com/") && !source.endsWith(".git")) {
        gitUrl = `${source}.git`;
      }

      // Bersihkan target jika sudah ada
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      try {
        console.log(`[ClawHub] Cloning ${gitUrl} → ${targetDir}`);
        execSync(`git clone --depth 1 ${gitUrl} "${targetDir}"`, {
          stdio: "pipe",
          timeout: 60000,
        });

        // Deteksi tipe proyek
        const projectInfo = detectProjectType(targetDir);

        // Jalankan npm install jika ada package.json
        const pkgPath = path.join(targetDir, "package.json");
        if (fs.existsSync(pkgPath)) {
          console.log(`[ClawHub] Menjalankan npm install di ${name}...`);
          try {
            execSync("npm install --production 2>&1", {
              cwd: targetDir,
              stdio: "pipe",
              timeout: 120000,
            });
          } catch (npmErr) {
            // npm install gagal, tapi clone berhasil
            console.warn(`[ClawHub] npm install warning: ${npmErr.message.slice(0, 100)}`);
          }
        }

        // Buat respons berdasarkan tipe proyek
        switch (projectInfo.type) {
          case "starclaw-plugin":
            return {
              success: true,
              type: "starclaw-plugin",
              message: `✅ Plugin Starclaw '${name}' berhasil di-install! Aktifkan dengan:\n/plugin load ${name}`,
              path: targetDir,
              entryPoint: projectInfo.entryPoint,
            };

          case "node-module":
            return {
              success: true,
              type: "node-module",
              message: `✅ Module '${projectInfo.name}' berhasil di-clone!\nEntry: ${projectInfo.entryPoint}\nDeskripsi: ${projectInfo.description || "-"}\n\nModule ini bukan plugin Starclaw native, tapi bisa digunakan dari kode.`,
              path: targetDir,
              entryPoint: projectInfo.entryPoint,
            };

          case "app-service": {
            const startCmd = projectInfo.scripts.dev
              ? "npm run dev"
              : projectInfo.scripts.start
                ? "npm start"
                : "npm run build";
            return {
              success: true,
              type: "app-service",
              message: `✅ App/Service '${projectInfo.name}' berhasil di-clone!\nDeskripsi: ${projectInfo.description || "-"}\n\nIni adalah aplikasi lengkap. Jalankan di folder plugins/${name}/:\n→ cd plugins/${name}\n→ ${startCmd}`,
              path: targetDir,
              scripts: projectInfo.scripts,
              startCommand: startCmd,
            };
          }

          default:
            return {
              success: true,
              type: "generic-repo",
              message: `✅ Repo '${name}' berhasil di-clone ke plugins/${name}/\nDeskripsi: ${projectInfo.description || "-"}\n\nRepo ini tidak terdeteksi sebagai plugin/module/app. Cek manual isinya.`,
              path: targetDir,
            };
        }
      } catch (err) {
        return { success: false, error: `Gagal clone: ${err.message.slice(0, 200)}` };
      }
    },

    /**
     * Generate plugin template baru.
     */
    createPluginTemplate(name, { description = "", toolName = "", toolDescription = "" } = {}) {
      const targetDir = path.join(baseDir, name);

      if (fs.existsSync(path.join(targetDir, "index.js"))) {
        return { success: false, error: `Plugin '${name}' sudah ada. Hapus dulu atau gunakan nama lain.` };
      }

      fs.mkdirSync(targetDir, { recursive: true });

      const sanitizedToolName = toolName || `${name}-tool`;
      const template = `"use strict";

/**
 * Plugin: ${name}
 * ${description || "Custom plugin untuk Starclaw AI Agent"}
 *
 * Dibuat oleh ClawHub Plugin Generator.
 */
module.exports = {
  name: "${name}",
  version: "1.0.0",
  description: "${description || `Plugin ${name} untuk Starclaw`}",

  tools: [
    {
      name: "${sanitizedToolName}",
      description: "${toolDescription || `Tool dari plugin ${name}`}",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action yang ingin dilakukan" },
          data: { type: "string", description: "Data input (opsional)" },
        },
        required: ["action"],
      },
      async run(input) {
        return {
          success: true,
          message: \`Plugin '${name}' menjalankan action '\${input.action}'\`,
          data: input.data || null,
        };
      },
    },
  ],

  workflows: [],

  activate(context) {
    console.log("[Plugin:${name}] Diaktifkan!");
  },

  deactivate() {
    console.log("[Plugin:${name}] Dinonaktifkan.");
  },
};
`;

      fs.writeFileSync(path.join(targetDir, "index.js"), template, "utf-8");

      return {
        success: true,
        message: `Template plugin '${name}' berhasil dibuat di plugins/${name}/index.js`,
        path: targetDir,
        hint: "Edit index.js untuk menambahkan logika custom, lalu load via /plugin load.",
      };
    },

    /**
     * Deteksi tipe proyek (exposed untuk penggunaan lain).
     */
    detectProjectType,
  };
}

module.exports = { createClawHubRegistry, CLAWHUB_REGISTRY };
