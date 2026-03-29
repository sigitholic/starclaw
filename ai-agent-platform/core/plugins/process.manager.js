"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Plugin Process Manager — menjalankan plugin tipe "app-service" sebagai child process.
 *
 * Masalah:
 *   Starclaw berjalan di port 8080 (API) + 3001 (Dashboard).
 *   Plugin dari OpenClaw (misal openclaw-office) berjalan di port sendiri (misal 5173).
 *   Mereka adalah proses terpisah dan tidak bisa di-load sebagai module biasa.
 *
 * Solusi:
 *   Plugin Process Manager menjalankan app-type plugins sebagai child process,
 *   mengalokasikan port, dan menyimpan registry proses aktif.
 *   Starclaw core berkomunikasi dengan plugin via HTTP API.
 */
function createPluginProcessManager({ basePort = 5100 } = {}) {
  const processes = new Map(); // name → { process, port, status, startedAt, logs }
  let nextPort = basePort;

  /**
   * Alokasi port unik untuk plugin.
   */
  function allocatePort() {
    return nextPort++;
  }

  /**
   * Jalankan plugin app sebagai child process.
   * @param {string} name - Nama plugin
   * @param {string} pluginDir - Path absolut ke folder plugin
   * @param {object} options - { command, env, port }
   */
  async function startPlugin(name, pluginDir, options = {}) {
    if (processes.has(name) && processes.get(name).status === "running") {
      return { success: false, error: `Plugin '${name}' sudah berjalan di port ${processes.get(name).port}` };
    }

    const normalizedDir = path.resolve(pluginDir);
    if (!fs.existsSync(normalizedDir)) {
      return { success: false, error: `Folder plugin tidak ditemukan: ${normalizedDir}` };
    }

    // Deteksi start command
    let startCmd = options.command || null;
    let isVite = false;
    const pkgPath = path.join(normalizedDir, "package.json");

    if (!startCmd && fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const scripts = pkg.scripts || {};
        if (scripts.dev) {
          startCmd = "npm run dev";
          isVite = scripts.dev.includes("vite") || fs.existsSync(path.join(normalizedDir, "vite.config.ts")) || fs.existsSync(path.join(normalizedDir, "vite.config.js"));
        } else if (scripts.start) {
          startCmd = "npm start";
        } else if (scripts.serve) {
          startCmd = "npm run serve";
        }
      } catch { /* ignore */ }
    }

    if (!startCmd) {
      return { success: false, error: `Tidak bisa menentukan start command untuk '${name}'. Tambahkan scripts.dev/start di package.json` };
    }

    // === SMART PORT DETECTION ===
    let port = options.port || null;

    // 1. Deteksi port dari vite.config.ts/js
    if (!port) {
      for (const configFile of ["vite.config.ts", "vite.config.js"]) {
        const configPath = path.join(normalizedDir, configFile);
        if (fs.existsSync(configPath)) {
          try {
            const configContent = fs.readFileSync(configPath, "utf-8");
            // Cari pattern: port: 5180 atau port: NNNN
            const portMatch = configContent.match(/port\s*:\s*(\d{4,5})/);
            if (portMatch) {
              port = parseInt(portMatch[1], 10);
              console.log(`[ProcessManager] Port terdeteksi dari ${configFile}: ${port}`);
            }
          } catch { /* ignore */ }
        }
      }
    }

    // 2. Jika masih belum ada, allocate port baru dan pass via --port flag
    if (!port) {
      port = allocatePort();
      // Override port untuk Vite
      if (isVite && startCmd === "npm run dev") {
        startCmd = `npm run dev -- --port ${port}`;
      }
    }

    const logs = [];

    // Environment variables
    const env = {
      ...process.env,
      PORT: String(port),
      ...options.env,
    };

    // Parse command
    const [cmd, ...args] = startCmd.split(" ");

    console.log(`[ProcessManager] Starting '${name}' → ${startCmd} (port: ${port})`);

    const child = spawn(cmd, args, {
      cwd: normalizedDir,
      env,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Capture logs (batasi 50 baris terakhir) + deteksi port dari output
    let detectedPort = port;
    const pushLog = (stream, prefix) => {
      stream.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          logs.push(`[${prefix}] ${line}`);
          if (logs.length > 50) logs.shift();

          // Parse port dari output Vite/Next.js: "Local: http://localhost:XXXX"
          const urlMatch = line.match(/(?:Local|localhost|127\.0\.0\.1):?\s*(?:http:\/\/)?(?:localhost|127\.0\.0\.1):(\d{4,5})/i);
          if (urlMatch) {
            detectedPort = parseInt(urlMatch[1], 10);
          }
        }
      });
    };

    pushLog(child.stdout, "out");
    pushLog(child.stderr, "err");

    const entry = {
      process: child,
      pid: child.pid,
      port,
      name,
      command: startCmd,
      dir: normalizedDir,
      status: "running",
      startedAt: new Date().toISOString(),
      logs,
    };

    child.on("exit", (code) => {
      entry.status = code === 0 ? "stopped" : "crashed";
      entry.exitCode = code;
      console.log(`[ProcessManager] Plugin '${name}' exited (code: ${code})`);
    });

    child.on("error", (err) => {
      entry.status = "error";
      entry.error = err.message;
      console.error(`[ProcessManager] Plugin '${name}' error: ${err.message}`);
    });

    processes.set(name, entry);

    // Tunggu lebih lama (3 detik) agar Vite sempat startup
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Update port jika terdeteksi dari output
    if (detectedPort !== port) {
      entry.port = detectedPort;
      port = detectedPort;
      console.log(`[ProcessManager] Port terupdate dari output: ${port}`);
    }

    if (entry.status !== "running") {
      return {
        success: false,
        error: `Plugin '${name}' gagal start (status: ${entry.status})`,
        logs: logs.slice(-10),
      };
    }

    return {
      success: true,
      message: `Plugin '${name}' berjalan di port ${port} (PID: ${child.pid})`,
      port,
      pid: child.pid,
      url: `http://localhost:${port}`,
    };
  }

  /**
   * Stop plugin process.
   */
  function stopPlugin(name) {
    const entry = processes.get(name);
    if (!entry) return { success: false, error: `Plugin '${name}' tidak ditemukan` };
    if (entry.status !== "running") return { success: false, error: `Plugin '${name}' tidak sedang berjalan (status: ${entry.status})` };

    try {
      entry.process.kill("SIGTERM");
      entry.status = "stopping";

      // Force kill setelah 5 detik
      setTimeout(() => {
        if (entry.status === "stopping") {
          try { entry.process.kill("SIGKILL"); } catch { /* ignore */ }
          entry.status = "killed";
        }
      }, 5000);

      return { success: true, message: `Plugin '${name}' sedang dihentikan...` };
    } catch (err) {
      return { success: false, error: `Gagal stop: ${err.message}` };
    }
  }

  /**
   * Daftar semua plugin process.
   */
  function listProcesses() {
    return Array.from(processes.values()).map(p => ({
      name: p.name,
      status: p.status,
      port: p.port,
      pid: p.pid,
      url: `http://localhost:${p.port}`,
      command: p.command,
      startedAt: p.startedAt,
      recentLogs: p.logs.slice(-5),
    }));
  }

  /**
   * Ambil logs dari plugin.
   */
  function getLogs(name, count = 20) {
    const entry = processes.get(name);
    if (!entry) return null;
    return entry.logs.slice(-count);
  }

  /**
   * Stop semua plugin (graceful shutdown).
   */
  function stopAll() {
    const results = [];
    for (const [name, entry] of processes) {
      if (entry.status === "running") {
        const result = stopPlugin(name);
        results.push({ name, ...result });
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
