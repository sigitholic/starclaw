#!/usr/bin/env node
"use strict";

const path = require("path");

// Pastikan cwd = ai-agent-platform saat dijalankan dari monorepo root
try {
  process.chdir(path.resolve(__dirname, ".."));
} catch (_e) {}

const { modelManager } = require("../core/llm/modelManager");

const argv = process.argv.slice(2);
const cmd = argv[0];
const sub = argv[1];

if (cmd === "model" && sub === "set") {
  const id = argv.slice(2).join(" ").trim() || argv[2];
  if (!id) {
    console.error("Usage: npm run agent -- model set <model-id>");
    process.exitCode = 1;
    return;
  }
  try {
    const set = modelManager.setModel(id);
    console.log("Model diset ke:", set);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
  return;
}

if (cmd === "model" && (sub === "get" || sub === undefined)) {
  console.log(modelManager.getModel());
  return;
}

console.log(`Starclaw agent CLI

  npm run agent -- model set <id>   Set model (contoh: openai:gpt-4o atau gemini-1.5-pro)
  npm run agent -- model get        Tampilkan model aktif

Didukung: ${modelManager.listSupported().join(", ")}
`);
