"use strict";

const { spawn } = require("child_process");

function run(command, args, cwd, label) {
  const child = spawn(command, args, {
    cwd,
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

function main() {
  const root = process.cwd();
  const api = run("node", ["scripts/dev.js"], root, "api");
  const dashboard = run(
    "node",
    ["node_modules/next/dist/bin/next", "dev", "apps/dashboard", "-p", process.env.DASHBOARD_PORT || "3001"],
    root,
    "dashboard",
  );
  const channel = run("node", ["scripts/channel-runner.js"], root, "channel");

  const shutdown = () => {
    if (!api.killed) {
      api.kill("SIGTERM");
    }
    if (!dashboard.killed) {
      dashboard.kill("SIGTERM");
    }
    if (!channel.killed) {
      channel.kill("SIGTERM");
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  api.on("exit", () => {
    if (!dashboard.killed) dashboard.kill("SIGTERM");
    if (!channel.killed) channel.kill("SIGTERM");
  });
  dashboard.on("exit", () => {
    if (!api.killed) api.kill("SIGTERM");
    if (!channel.killed) channel.kill("SIGTERM");
  });
  channel.on("exit", () => {
    if (!api.killed) api.kill("SIGTERM");
    if (!dashboard.killed) dashboard.kill("SIGTERM");
  });
}

main();
