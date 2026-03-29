"use strict";

const fs = require("fs");
const path = require("path");

function ensureEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    return { created: false, envPath };
  }

  const template = [
    "NODE_ENV=development",
    "PORT=8080",
    "LLM_PROVIDER=mock",
    "LLM_MODEL=gpt-4o-mini",
    "OPENAI_API_KEY=",
    "AGENT_CHANNEL=local",
    "DASHBOARD_PORT=3001",
    "WS_PATH=/ws",
    "",
  ].join("\n");

  fs.writeFileSync(envPath, template, "utf8");
  return { created: true, envPath };
}

function main() {
  const { created, envPath } = ensureEnvFile();
  if (created) {
    console.log(`[install] .env berhasil dibuat di ${envPath}`);
  } else {
    console.log(`[install] .env sudah ada di ${envPath}`);
  }

  console.log("[install] Setup selesai. Jalankan: npm run start:all");
}

main();
