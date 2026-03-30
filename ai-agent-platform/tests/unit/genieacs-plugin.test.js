"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ============================================================
// Test Suite: GenieACS Plugin & Config
// ============================================================

test("T01: Plugin genieacs-monitor dapat dimuat", (t) => {
  const { createPluginManager } = require("../../core/plugins/plugin.manager");
  const { createToolRegistry } = require("../../core/tools");

  const toolsReg = createToolRegistry();
  const pm = createPluginManager({ toolsRegistry: toolsReg });
  const pluginsDir = path.resolve(process.cwd(), "plugins");
  const pluginPath = path.join(pluginsDir, "genieacs-monitor", "index.js");

  assert.ok(fs.existsSync(pluginPath), "index.js plugin harus ada");

  const result = pm.loadPlugin(pluginPath, "genieacs-monitor");
  assert.strictEqual(result.success, true, "Plugin harus berhasil dimuat");
  assert.strictEqual(result.name, "genieacs-monitor");
  assert.ok(result.tools.includes("genieacs-tool"), "Harus mendaftarkan genieacs-tool");
});

test("T02: genieacs-tool terdaftar di tool registry setelah plugin dimuat", (t) => {
  const { createPluginManager } = require("../../core/plugins/plugin.manager");
  const { createToolRegistry } = require("../../core/tools");

  const toolsReg = createToolRegistry();
  const pm = createPluginManager({ toolsRegistry: toolsReg });
  const pluginsDir = path.resolve(process.cwd(), "plugins");
  pm.loadPlugin(path.join(pluginsDir, "genieacs-monitor", "index.js"), "genieacs-monitor");

  const tool = toolsReg.get("genieacs-tool");
  assert.ok(tool, "genieacs-tool harus ada di registry");
  assert.strictEqual(typeof tool.run, "function", "Tool harus punya method run()");
  assert.ok(tool.parameters, "Tool harus punya parameters schema");
});

test("T03: Plugin manifest genieacs-monitor valid", (t) => {
  const manifestPath = path.join(process.cwd(), "plugins", "genieacs-monitor", "plugin.json");
  assert.ok(fs.existsSync(manifestPath), "plugin.json harus ada");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.strictEqual(manifest.name, "genieacs-monitor");
  assert.ok(Array.isArray(manifest.configSchema), "configSchema harus array");
  assert.ok(manifest.configSchema.some(f => f.key === "GENIEACS_URL"), "Harus ada field GENIEACS_URL");
  assert.ok(manifest.configSchema.some(f => f.key === "GENIEACS_PASS" && f.sensitive === true), "GENIEACS_PASS harus sensitive");
});

test("T04: Plugin status config-needed jika GENIEACS_URL belum diset", (t) => {
  // Pastikan env bersih untuk test ini
  const savedUrl = process.env.GENIEACS_URL;
  delete process.env.GENIEACS_URL;

  const { createPluginManager } = require("../../core/plugins/plugin.manager");
  const { createToolRegistry } = require("../../core/tools");
  const { writePluginConfig } = require("../../core/plugins/plugin.config.store");

  // Kosongkan config plugin
  writePluginConfig("genieacs-monitor", {});

  const toolsReg = createToolRegistry();
  const pm = createPluginManager({ toolsRegistry: toolsReg });
  const pluginsDir = path.resolve(process.cwd(), "plugins");
  pm.loadPlugin(path.join(pluginsDir, "genieacs-monitor", "index.js"), "genieacs-monitor");

  const plugins = pm.listPlugins();
  const genieacs = plugins.find(p => p.name === "genieacs-monitor");
  assert.ok(genieacs, "Plugin harus ada di list");
  assert.strictEqual(genieacs.status, "config-needed", "Status harus config-needed");
  assert.ok(genieacs.missingConfig.includes("GENIEACS_URL"), "GENIEACS_URL harus di missingConfig");

  // Restore
  if (savedUrl) process.env.GENIEACS_URL = savedUrl;
});

test("T05: Set konfigurasi GenieACS URL via plugin-config-tool", async (t) => {
  const { createPluginConfigTool } = require("../../core/tools/plugin-config.tool");
  const { readPluginConfig, writePluginConfig } = require("../../core/plugins/plugin.config.store");

  // Bersihkan dulu
  writePluginConfig("genieacs-monitor", {});
  delete process.env.GENIEACS_URL;

  const tool = createPluginConfigTool();
  const result = await tool.run({
    action: "set",
    plugin: "genieacs-monitor",
    key: "GENIEACS_URL",
    value: "http://10.0.0.1:7557",
  });

  assert.strictEqual(result.success, true, "Set harus berhasil");
  assert.ok(result.message.includes("GENIEACS_URL"), "Message harus menyebut key");

  // Verifikasi tersimpan ke file
  const saved = readPluginConfig("genieacs-monitor");
  assert.strictEqual(saved.GENIEACS_URL, "http://10.0.0.1:7557", "Nilai harus tersimpan di file");

  // Verifikasi ter-inject ke env
  assert.strictEqual(process.env.GENIEACS_URL, "http://10.0.0.1:7557", "Nilai harus ter-inject ke process.env");

  // Cleanup
  writePluginConfig("genieacs-monitor", {});
  delete process.env.GENIEACS_URL;
});

test("T06: Set username dan password GenieACS", async (t) => {
  const { createPluginConfigTool } = require("../../core/tools/plugin-config.tool");
  const { readPluginConfig, writePluginConfig } = require("../../core/plugins/plugin.config.store");

  writePluginConfig("genieacs-monitor", {});
  delete process.env.GENIEACS_USER;
  delete process.env.GENIEACS_PASS;

  const tool = createPluginConfigTool();

  await tool.run({ action: "set", plugin: "genieacs-monitor", key: "GENIEACS_USER", value: "admin" });
  await tool.run({ action: "set", plugin: "genieacs-monitor", key: "GENIEACS_PASS", value: "secret123" });

  const saved = readPluginConfig("genieacs-monitor");
  assert.strictEqual(saved.GENIEACS_USER, "admin");
  assert.strictEqual(saved.GENIEACS_PASS, "secret123");

  // Verifikasi masking password di display
  const getResult = await tool.run({ action: "get", plugin: "genieacs-monitor" });
  assert.ok(getResult.message.includes("****"), "Password harus di-mask");
  assert.ok(!getResult.message.includes("secret123"), "Password asli tidak boleh tampil");

  // Cleanup
  writePluginConfig("genieacs-monitor", {});
  delete process.env.GENIEACS_USER;
  delete process.env.GENIEACS_PASS;
});

test("T07: List config semua plugin menampilkan status", async (t) => {
  const { createPluginConfigTool } = require("../../core/tools/plugin-config.tool");
  const tool = createPluginConfigTool();

  const result = await tool.run({ action: "list" });
  assert.strictEqual(result.success, true);
  assert.ok(result.message.includes("genieacs-monitor"), "Harus tampil genieacs-monitor");
  assert.ok(result.message.includes("social-media"), "Harus tampil social-media");
  assert.ok(typeof result.total === "number");
});

test("T08: Schema genieacs-monitor menampilkan semua field dengan status", async (t) => {
  const { createPluginConfigTool } = require("../../core/tools/plugin-config.tool");
  const { writePluginConfig } = require("../../core/plugins/plugin.config.store");

  writePluginConfig("genieacs-monitor", {});
  delete process.env.GENIEACS_URL;

  const tool = createPluginConfigTool();
  const result = await tool.run({ action: "schema", plugin: "genieacs-monitor" });

  assert.strictEqual(result.success, true);
  assert.ok(result.message.includes("GENIEACS_URL"), "Harus tampil GENIEACS_URL");
  assert.ok(result.message.includes("BELUM DISET"), "URL yang belum diset harus ditandai");
  assert.ok(result.message.includes("wajib"), "Field required harus ditandai wajib");
});

test("T09: Delete konfigurasi plugin", async (t) => {
  const { createPluginConfigTool } = require("../../core/tools/plugin-config.tool");
  const { readPluginConfig, writePluginConfig } = require("../../core/plugins/plugin.config.store");

  // Setup
  writePluginConfig("genieacs-monitor", { GENIEACS_URL: "http://test.local" });
  process.env.GENIEACS_URL = "http://test.local";

  const tool = createPluginConfigTool();
  const result = await tool.run({ action: "delete", plugin: "genieacs-monitor", key: "GENIEACS_URL" });

  assert.strictEqual(result.success, true);
  const saved = readPluginConfig("genieacs-monitor");
  assert.ok(!saved.GENIEACS_URL, "Key harus dihapus dari file");
  assert.ok(!process.env.GENIEACS_URL, "Key harus dihapus dari env");
});

test("T10: Session memory persist dan load ulang", async (t) => {
  const { createShortMemory } = require("../../core/memory/short.memory");
  const { loadSession, deleteSession } = require("../../core/memory/session.store");

  const testAgent = "test-persist-agent";
  deleteSession(testAgent);

  // Buat memory, tambah interaksi, lalu cek file tersimpan
  const mem1 = createShortMemory(testAgent);
  mem1.remember({ userMessage: "halo test", agentMessage: "halo juga" });
  mem1.remember({ userMessage: "tes persistensi", agentMessage: "ok disimpan" });
  mem1.flush();

  // Load ulang dari file
  const session = loadSession(testAgent);
  assert.strictEqual(session.interactions.length, 2, "Harus ada 2 interaksi tersimpan");
  assert.strictEqual(session.interactions[0].userMessage, "halo test");

  // Buat instance baru — harus load dari persisted state
  const mem2 = createShortMemory(testAgent);
  assert.strictEqual(mem2.getSize(), 2, "Instance baru harus load 2 interaksi dari file");

  // Cleanup
  deleteSession(testAgent);
});

test("T11: genieacs-tool memiliki action yang benar", async (t) => {
  const { createGenieAcsTool } = require("../../core/tools/genieacs.tool");
  const tool = createGenieAcsTool();

  // Test action tidak dikenal
  const result = await tool.run({ action: "invalid-action" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("tidak dikenal"), "Harus ada pesan error yang jelas");

  // Verifikasi tool memiliki semua action yang didokumentasikan
  const schemaDesc = tool.parameters.properties.action.description;
  const expectedActions = ["list-devices", "get-device", "reboot", "factory-reset", "task", "set-parameter", "get-parameter", "list-faults", "clear-fault", "list-presets", "delete-device"];
  for (const action of expectedActions) {
    assert.ok(schemaDesc.includes(action), `Schema harus mendokumentasikan action '${action}'`);
  }
});

test("T12: plugin-config-tool reset menghapus semua config", async (t) => {
  const { createPluginConfigTool } = require("../../core/tools/plugin-config.tool");
  const { readPluginConfig, writePluginConfig } = require("../../core/plugins/plugin.config.store");

  // Setup dengan beberapa config
  writePluginConfig("genieacs-monitor", {
    GENIEACS_URL: "http://test.local",
    GENIEACS_USER: "admin",
  });

  const tool = createPluginConfigTool();
  const result = await tool.run({ action: "reset", plugin: "genieacs-monitor" });

  assert.strictEqual(result.success, true);
  assert.ok(result.removedKeys.includes("GENIEACS_URL"), "GENIEACS_URL harus ada di removedKeys");

  const saved = readPluginConfig("genieacs-monitor");
  assert.deepStrictEqual(saved, {}, "Config harus kosong setelah reset");
});
