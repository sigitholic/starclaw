"use strict";

const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  console.error(
    `\n[ERROR] Node.js v${process.versions.node} tidak didukung.\n` +
    `Platform ini membutuhkan Node.js >= 18.0.0.\n\n` +
    `Cara update:\n` +
    `  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -\n` +
    `  apt install -y nodejs\n`
  );
  process.exit(1);
}

require("../config/load-env").loadEnv();
require("../apps/api/index");
