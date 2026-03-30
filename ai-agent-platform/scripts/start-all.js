"use strict";

const { spawn } = require("child_process");

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
  const api = run("node", ["scripts/dev.js"], "api");
  const dashboard = run(
    "node",
    ["node_modules/next/dist/bin/next", "dev", "apps/dashboard", "-p", process.env.DASHBOARD_PORT || "3001"],
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
