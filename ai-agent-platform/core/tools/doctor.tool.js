"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Doctor Tool — Self-Healing Agent Diagnostic & Repair System.
 *
 * Kemampuan:
 *   - diagnose: validasi semua core module, cek .env, cek tools, cek memory
 *   - repair: reinstall dependency, regenerate config, fix broken modules
 *   - validate-config: cek konfigurasi critical (API key, model, dll)
 *   - health-report: laporan status lengkap dalam format terstruktur
 */
function createDoctorTool() {
  const PROJECT_ROOT = path.resolve(process.cwd());

  // Helper: coba require module dan report status
  function testModule(modulePath) {
    try {
      delete require.cache[require.resolve(modulePath)];
      require(modulePath);
      return { status: "ok", module: modulePath };
    } catch (err) {
      return { status: "broken", module: modulePath, error: err.message };
    }
  }

  // Helper: cek apakah file/folder ada
  function exists(p) { return fs.existsSync(path.resolve(PROJECT_ROOT, p)); }

  return {
    name: "doctor-tool",
    description: "Self-healing diagnostic untuk platform Starclaw. Gunakan untuk mengecek kesehatan sistem, memperbaiki module rusak, dan memvalidasi konfigurasi.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'diagnose' (cek semua module & dependency), 'repair' (perbaiki otomatis), 'validate-config' (cek .env & konfigurasi), 'health-report' (laporan lengkap)"
        },
        target: {
          type: "string",
          description: "(opsional) Module/area spesifik yang ingin didiagnosa: 'core', 'tools', 'memory', 'llm', 'all' (default: 'all')"
        }
      },
      required: ["action"]
    },

    async run(input) {
      const target = input.target || "all";

      switch (input.action) {

        case "diagnose": {
          const results = { healthy: [], broken: [], warnings: [] };

          // Core modules check
          const coreModules = [
            "../../core/agent/base.agent",
            "../../core/agent/executor",
            "../../core/agent/planner",
            "../../core/agent/reviewer",
            "../../core/agent/agent.factory",
            "../../core/orchestrator/orchestrator",
            "../../core/orchestrator/workflow.engine",
            "../../core/orchestrator/task.router",
            "../../core/memory/short.memory",
            "../../core/memory/long.memory",
            "../../core/memory/token.manager",
            "../../core/memory/summarizer",
            "../../core/llm/llm.provider",
            "../../core/llm/openai.provider",
            "../../core/llm/mock.provider",
            "../../core/llm/prompt.builder",
            "../../core/llm/embedding.provider",
            "../../core/utils/validator",
            "../../core/utils/logger",
            "../../core/events/event.bus",
            "../../core/events/event.store",
            "../../core/events/event.types",
          ];

          const toolModules = [
            "../../core/tools/index",
            "../../core/tools/http.tool",
            "../../core/tools/time.tool",
            "../../core/tools/shell.tool",
            "../../core/tools/fs.tool",
            "../../core/tools/web-search.tool",
            "../../core/tools/codebase-search.tool",
            "../../core/tools/browser.tool",
            "../../core/tools/docker.tool",
          ];

          const modulesToCheck = [];
          if (target === "all" || target === "core") modulesToCheck.push(...coreModules);
          if (target === "all" || target === "tools") modulesToCheck.push(...toolModules);

          for (const mod of modulesToCheck) {
            const result = testModule(mod);
            if (result.status === "ok") {
              results.healthy.push(result.module);
            } else {
              results.broken.push(result);
            }
          }

          // Filesystem checks
          if (!exists("package.json")) results.warnings.push("package.json tidak ditemukan!");
          if (!exists("node_modules")) results.warnings.push("node_modules tidak ada — jalankan 'npm install'");
          if (!exists(".env")) results.warnings.push(".env tidak ditemukan — konfigurasi LLM mungkin tidak berfungsi");
          if (!exists("data")) results.warnings.push("folder data/ tidak ada — long memory tidak akan persist");

          return {
            success: true,
            totalChecked: results.healthy.length + results.broken.length,
            healthy: results.healthy.length,
            broken: results.broken.length,
            warnings: results.warnings,
            brokenModules: results.broken,
            verdict: results.broken.length === 0 ? "🟢 SEHAT — Semua module berfungsi normal" : `🔴 ${results.broken.length} module bermasalah — jalankan action 'repair'`,
          };
        }

        case "repair": {
          const actions = [];

          // 1. Cek dan buat folder penting
          const requiredDirs = ["data", "data/memory", "data/screenshots", "plugins"];
          for (const dir of requiredDirs) {
            const fullPath = path.resolve(PROJECT_ROOT, dir);
            if (!fs.existsSync(fullPath)) {
              fs.mkdirSync(fullPath, { recursive: true });
              actions.push(`Folder '${dir}/' dibuat`);
            }
          }

          // 2. Cek .env
          const envPath = path.resolve(PROJECT_ROOT, ".env");
          if (!fs.existsSync(envPath)) {
            const defaultEnv = [
              "# Starclaw AI Agent Configuration",
              "LLM_PROVIDER=mock",
              "LLM_MODEL=gpt-4o-mini",
              "OPENAI_API_KEY=",
              "NODE_ENV=development",
            ].join("\n");
            fs.writeFileSync(envPath, defaultEnv, "utf-8");
            actions.push(".env template dibuat (set OPENAI_API_KEY untuk aktivasi LLM)");
          }

          // 3. Cek node_modules
          if (!exists("node_modules")) {
            try {
              console.log("[Doctor] Menjalankan npm install...");
              execSync("npm install", { cwd: PROJECT_ROOT, stdio: "pipe", timeout: 60000 });
              actions.push("npm install berhasil dijalankan");
            } catch (err) {
              actions.push(`npm install GAGAL: ${err.message.slice(0, 200)}`);
            }
          }

          // 4. Cek ulang module setelah repair
          const postCheck = testModule("../../core/orchestrator/orchestrator");

          return {
            success: true,
            repairActions: actions,
            postRepairStatus: postCheck.status === "ok" ? "🟢 Core module berfungsi setelah repair" : "🟡 Masih ada masalah — cek manual",
          };
        }

        case "validate-config": {
          const configStatus = [];

          // Cek .env
          const envPath = path.resolve(PROJECT_ROOT, ".env");
          if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, "utf-8");
            const hasApiKey = /OPENAI_API_KEY=.+/.test(envContent);
            const hasProvider = /LLM_PROVIDER=/.test(envContent);
            const hasModel = /LLM_MODEL=/.test(envContent);

            configStatus.push({
              file: ".env",
              OPENAI_API_KEY: hasApiKey ? "✅ Set" : "⚠️ Kosong (menggunakan mock provider)",
              LLM_PROVIDER: hasProvider ? "✅ Set" : "⚠️ Tidak ada",
              LLM_MODEL: hasModel ? "✅ Set" : "⚠️ Tidak ada",
            });
          } else {
            configStatus.push({ file: ".env", status: "❌ Tidak ada — jalankan doctor repair" });
          }

          // Cek package.json
          if (exists("package.json")) {
            const pkg = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, "package.json"), "utf-8"));
            configStatus.push({
              file: "package.json",
              name: pkg.name || "N/A",
              version: pkg.version || "N/A",
              dependencies: Object.keys(pkg.dependencies || {}).length,
            });
          }

          return { success: true, config: configStatus };
        }

        case "health-report": {
          // Jalankan diagnose + validate-config sekaligus
          const diagResult = await this.run({ action: "diagnose", target: "all" });
          const configResult = await this.run({ action: "validate-config" });

          const uptimeSeconds = Math.floor(process.uptime());
          const memUsage = process.memoryUsage();

          return {
            success: true,
            report: {
              timestamp: new Date().toISOString(),
              platform: "Starclaw AI Agent Platform",
              nodeVersion: process.version,
              uptime: `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`,
              memory: {
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
              },
              modules: {
                total: diagResult.totalChecked,
                healthy: diagResult.healthy,
                broken: diagResult.broken,
              },
              warnings: diagResult.warnings,
              config: configResult.config,
              verdict: diagResult.verdict,
            },
          };
        }

        default:
          return { error: `Action '${input.action}' tidak dikenal. Pilih: diagnose, repair, validate-config, health-report` };
      }
    },
  };
}

module.exports = { createDoctorTool };
