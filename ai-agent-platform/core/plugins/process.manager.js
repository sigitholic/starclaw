"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { validateServicePlugin, formatValidationResult } = require("./plugin.validator");
const { injectPluginConfig } = require("./plugin.config.store");

/**
 * Plugin Process Manager — menjalankan plugin tipe "service" sebagai child process.
 *
 * Arsitektur:
 *   Starclaw core (port 8080) ← HTTP → Plugin Service (port 5100+)
 *
 * Prioritas command resolusi (sesuai permintaan):
 *   1. scripts.start   → "npm run start"  (PRODUCTION)
 *   2. scripts.dev     → "npm run dev"    (DEVELOPMENT fallback)
 *   3. pkg.main        → "node <main>"    (FALLBACK)
 *   4. ERROR — tidak ada entrypoint
 */
function createPluginProcessManager({ basePort = 5100 } = {}) {
  const processes = new Map(); // name → ProcessEntry
  let nextPort = basePort;

  function allocatePort() {
    return nextPort++;
  }

  /**
   * Jalankan plugin service sebagai child process.
   */
  async function startPlugin(name, pluginDir, options = {}) {
    if (processes.has(name) && processes.get(name).status === "running") {
      return {
        success: false,
        error: `Plugin '${name}' sudah berjalan di port ${processes.get(name).port}`,
      };
    }

    const normalizedDir = path.resolve(pluginDir);

    // === STEP 1: VALIDASI ===
    const validation = validateServicePlugin(normalizedDir, name);
    if (!validation.valid) {
      const formatted = formatValidationResult(validation, name);
      console.error(formatted);
      return {
        success: false,
        error: `Plugin '${name}' tidak valid untuk dijalankan sebagai service`,
        validationErrors: validation.errors,
        hint: validation.errors.map(e => e.fix).filter(Boolean).join("\n"),
      };
    }

    // Log warnings jika ada
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => {
        console.warn(`[ProcessManager] ⚠️  ${name}: [${w.code}] ${w.message}`);
      });
    }

    // === STEP 2: INJECT PLUGIN CONFIG ===
    injectPluginConfig(name);

    // === STEP 3: RESOLUSI COMMAND (prioritas: start > dev > main) ===
    let startCmd = options.command || validation.command;
    const commandType = validation.commandType;

    if (!startCmd) {
      return {
        success: false,
        error: `Plugin '${name}' tidak memiliki start command`,
        detail: {
          pluginDir: normalizedDir,
          hint: "Tambahkan scripts.start, scripts.dev, atau field main di package.json",
        },
      };
    }

    // === STEP 4: RESOLUSI PORT ===
    let port = options.port || validation.port || null;

    // Deteksi port dari vite.config
    if (!port) {
      for (const configFile of ["vite.config.ts", "vite.config.js"]) {
        const configPath = path.join(normalizedDir, configFile);
        if (fs.existsSync(configPath)) {
          try {
            const content = fs.readFileSync(configPath, "utf-8");
            const portMatch = content.match(/port\s*:\s*(\d{4,5})/);
            if (portMatch) {
              port = parseInt(portMatch[1], 10);
              console.log(`[ProcessManager] Port terdeteksi dari ${configFile}: ${port}`);
            }
          } catch (_) {}
        }
      }
    }

    // Allocate port baru jika belum ada
    if (!port) {
      port = allocatePort();
    }

    // Untuk Vite/dev server, pass port via flag jika belum ada
    const isVite = commandType === "npm-dev" && (
      fs.existsSync(path.join(normalizedDir, "vite.config.ts")) ||
      fs.existsSync(path.join(normalizedDir, "vite.config.js"))
    );
    if (isVite && !validation.port && !options.port) {
      startCmd = `${startCmd} -- --port ${port}`;
    }

    // === STEP 5: SPAWN PROCESS ===
    const logs = [];
    const env = {
      ...process.env,
      PORT: String(port),
      PLUGIN_NAME: name,
      ...options.env,
    };

    console.log(`[ProcessManager] Starting '${name}'`);
    console.log(`  Command  : ${startCmd}`);
    console.log(`  Type     : ${commandType}`);
    console.log(`  Dir      : ${normalizedDir}`);
    console.log(`  Port     : ${port}`);

    const [cmd, ...args] = startCmd.split(/\s+/);
    const child = spawn(cmd, args, {
      cwd: normalizedDir,
      env,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let detectedPort = port;
    const pushLog = (stream, prefix) => {
      stream.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          const logLine = `[${prefix}] ${line}`;
          logs.push(logLine);
          if (logs.length > 100) logs.shift();

          // Deteksi port dari output
          const urlMatch = line.match(/(?:localhost|127\.0\.0\.1):(\d{4,5})/i);
          if (urlMatch) {
            const parsedPort = parseInt(urlMatch[1], 10);
            if (parsedPort !== 8080 && parsedPort !== 3001) {
              detectedPort = parsedPort;
            }
          }
        }
      });
    };

    pushLog(child.stdout, "stdout");
    pushLog(child.stderr, "stderr");

    const entry = {
      process: child,
      pid: child.pid,
      port,
      name,
      command: startCmd,
      commandType,
      dir: normalizedDir,
      status: "running",
      startedAt: new Date().toISOString(),
      logs,
    };

    child.on("exit", (code) => {
      entry.status = code === 0 ? "stopped" : "crashed";
      entry.exitCode = code;
      console.log(`[ProcessManager] Plugin '${name}' exited (code: ${code})`);
      if (code !== 0 && logs.length > 0) {
        console.error(`[ProcessManager] Last logs from '${name}':`);
        logs.slice(-5).forEach(l => console.error(`  ${l}`));
      }
    });

    child.on("error", (err) => {
      entry.status = "error";
      entry.error = err.message;
      console.error(`[ProcessManager] Plugin '${name}' spawn error: ${err.message}`);
    });

    processes.set(name, entry);

    // Tunggu startup (lebih lama untuk TypeScript/Vite)
    const startupWaitMs = isVite ? 4000 : 2000;
    await new Promise(resolve => setTimeout(resolve, startupWaitMs));

    // Update port jika terdeteksi dari output
    if (detectedPort !== port) {
      entry.port = detectedPort;
      port = detectedPort;
    }

    if (entry.status !== "running") {
      const recentLogs = logs.slice(-10);
      console.error(`[ProcessManager] Plugin '${name}' gagal start. Recent logs:`);
      recentLogs.forEach(l => console.error(`  ${l}`));

      return {
        success: false,
        error: `Plugin '${name}' gagal start (status: ${entry.status})`,
        exitCode: entry.exitCode,
        logs: recentLogs,
        hint: `Cek logs di atas. Jalankan manual: cd ${normalizedDir} && ${startCmd}`,
      };
    }

    console.log(`[ProcessManager] Plugin '${name}' berjalan di http://localhost:${port} (PID: ${child.pid})`);
    return {
      success: true,
      message: `Plugin '${name}' berjalan di port ${port}`,
      port,
      pid: child.pid,
      url: `http://localhost:${port}`,
      command: startCmd,
      commandType,
    };
  }

  function stopPlugin(name) {
    const entry = processes.get(name);
    if (!entry) return { success: false, error: `Plugin '${name}' tidak ditemukan` };
    if (entry.status !== "running") {
      return { success: false, error: `Plugin '${name}' tidak sedang berjalan (status: ${entry.status})` };
    }

    try {
      entry.process.kill("SIGTERM");
      entry.status = "stopping";
      setTimeout(() => {
        if (entry.status === "stopping") {
          try { entry.process.kill("SIGKILL"); } catch (_) {}
          entry.status = "killed";
        }
      }, 5000);
      return { success: true, message: `Plugin '${name}' sedang dihentikan (PID: ${entry.pid})` };
    } catch (err) {
      return { success: false, error: `Gagal stop '${name}': ${err.message}` };
    }
  }

  function listProcesses() {
    return Array.from(processes.values()).map(p => ({
      name: p.name,
      status: p.status,
      port: p.port,
      pid: p.pid,
      url: `http://localhost:${p.port}`,
      command: p.command,
      commandType: p.commandType,
      startedAt: p.startedAt,
      recentLogs: p.logs.slice(-3),
    }));
  }

  function getLogs(name, count = 20) {
    const entry = processes.get(name);
    if (!entry) return null;
    return entry.logs.slice(-count);
  }

  function stopAll() {
    const results = [];
    for (const [name, entry] of processes) {
      if (entry.status === "running") {
        results.push({ name, ...stopPlugin(name) });
      }
    }
    return results;
  }

  return {
    startPlugin,
    stopPlugin,
    listProcesses,
    getLogs,
    stopAll,
    get activeCount() {
      return Array.from(processes.values()).filter(p => p.status === "running").length;
    },
  };
}

module.exports = { createPluginProcessManager };
