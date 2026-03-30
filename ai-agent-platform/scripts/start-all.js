"use strict";

const { spawn, execSync } = require("child_process");

// Validasi versi Node.js sebelum memulai
const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  console.error(
    `\n[ERROR] Node.js v${process.versions.node} tidak didukung.\n` +
    `Platform ini membutuhkan Node.js >= 18.0.0.\n\n` +
    `Cara update:\n` +
    `  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -\n` +
    `  apt install -y nodejs\n\n` +
    `Atau gunakan nvm:\n` +
    `  nvm install 20 && nvm use 20\n`
  );
  process.exit(1);
}

const root = process.cwd();
let shuttingDown = false;

/**
 * Bebaskan port jika masih dipakai proses lain (sisa dari sesi sebelumnya).
 * Ini mencegah EADDRINUSE saat start-all.js dijalankan ulang setelah
 * koneksi SSH terputus dan proses lama tidak sempat di-kill.
 */
function freePort(port) {
  try {
    // Cari PID yang memakai port ini
    const result = execSync(`lsof -t -i :${port} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
    if (!result) return;

    const pids = result.split("\n").map(p => p.trim()).filter(Boolean);
    for (const pid of pids) {
      if (Number(pid) === process.pid) continue; // jangan kill diri sendiri
      try {
        process.kill(Number(pid), "SIGTERM");
        console.log(`[start-all] Port ${port} dibebaskan — kill PID ${pid}`);
      } catch (_) {
        // PID sudah mati, abaikan
      }
    }

    // Tunggu sebentar agar OS membebaskan port
    if (pids.length > 0) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        try {
          const check = execSync(`lsof -t -i :${port} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
          if (!check) break;
        } catch (_) { break; }
        // busy-wait sederhana (max 3 detik)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
      }
    }
  } catch (_) {
    // lsof tidak tersedia atau error lain — lanjut saja
  }
}

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  return child;
}

function spawnChannel() {
  const channel = run("node", ["scripts/channel-runner.js"], "channel");

  channel.on("exit", (code, signal) => {
    // Dihentikan oleh signal (SIGTERM dari shutdown) atau sedang shutdown — tidak restart
    if (shuttingDown || signal) return;

    if (code !== 0) {
      // Crash — restart otomatis setelah 3 detik
      console.error(`[start-all] channel crash (kode ${code}), restart dalam 3 detik...`);
      setTimeout(spawnChannel, 3000);
    }
    // Exit normal (code 0) — biarkan, channel sudah menyelesaikan tugasnya dengan baik
  });

  return channel;
}

function main() {
  const apiPort = Number(process.env.PORT || 8080);
  const dashPort = Number(process.env.DASHBOARD_PORT || 3001);

  // Bebaskan port yang mungkin masih dipakai proses lama
  freePort(apiPort);
  freePort(dashPort);

  const api = run("node", ["scripts/dev.js"], "api");
  const dashboard = run(
    "node",
    ["node_modules/next/dist/bin/next", "dev", "apps/dashboard", "-p", String(dashPort)],
    "dashboard",
  );
  let channel = spawnChannel();

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!api.killed) api.kill("SIGTERM");
    if (!dashboard.killed) dashboard.kill("SIGTERM");
    if (!channel.killed) channel.kill("SIGTERM");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // API dan dashboard saling menjaga — jika salah satu crash, semua dihentikan.
  // Channel tidak termasuk karena merupakan proses opsional yang di-restart otomatis.
  api.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`[start-all] api keluar (kode ${code}), menghentikan semua proses...`);
    shutdown();
  });

  dashboard.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`[start-all] dashboard keluar (kode ${code}), menghentikan semua proses...`);
    shutdown();
  });
}

main();
