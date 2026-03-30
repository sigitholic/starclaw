"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createToolRegistry } = require("../../core/tools");
const { validateSafeCode } = require("../../core/tools/tool-builder.tool");

test("validateSafeCode menolak exec dan child_process", () => {
  assert.equal(validateSafeCode('require("child_process").exec("ls")').ok, false);
  assert.equal(validateSafeCode("eval('1')").ok, false);
  assert.ok(validateSafeCode('module.exports = { async run() { return { ok: true }; } };').ok);
});

test("tool-builder create menulis plugin dan mendaftarkan tool", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tb-"));
  const prev = process.cwd();
  process.chdir(tmp);

  try {
    fs.mkdirSync(path.join(tmp, "plugins"), { recursive: true });

    const registry = createToolRegistry();
    const tool = registry.get("tool-builder");
    assert.ok(tool, "tool-builder harus terdaftar");

    const result = await tool.run({
      action: "create",
      toolName: "unit-test-ping",
      description: "unit test",
    });

    assert.equal(result.success, true, result.error || JSON.stringify(result));
    assert.match(result.message, /Tool berhasil dibuat/);
    assert.equal(registry.has("unit-test-ping-tool"), true);

    const indexPath = path.join(tmp, "plugins", "unit-test-ping", "index.js");
    assert.ok(fs.existsSync(indexPath));
    assert.ok(fs.existsSync(path.join(tmp, "plugins", "unit-test-ping", "plugin.json")));
  } finally {
    process.chdir(prev);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
