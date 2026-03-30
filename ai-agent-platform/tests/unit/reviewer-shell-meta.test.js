"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  reviewShellToolExecution,
  planTouchesShellTool,
} = require("../../core/agent/reviewer");

test("reviewShellToolExecution: skill + ping → allow", () => {
  const r = reviewShellToolExecution({
    command: "ping -c 4 192.168.88.20",
    meta: { source: "skill", skillName: "run-system-command" },
  });
  assert.equal(r.allow, true);
});

test("reviewShellToolExecution: skill check-server-resource + top → allow", () => {
  const r = reviewShellToolExecution({
    command: "top -b -n 1 | head -n 5",
    meta: { source: "skill", skillName: "check-server-resource" },
  });
  assert.equal(r.allow, true);
});

test("reviewShellToolExecution: tanpa meta → blokir", () => {
  const r = reviewShellToolExecution({
    command: "ping 127.0.0.1",
  });
  assert.equal(r.allow, false);
  assert.match(r.reason, /Direct command execution/i);
});

test("reviewShellToolExecution: user/direct (source bukan skill) → blokir", () => {
  const r = reviewShellToolExecution({
    command: "ping 127.0.0.1",
    meta: { source: "user" },
  });
  assert.equal(r.allow, false);
});

test("planTouchesShellTool: mendeteksi skill run-system-command", () => {
  assert.equal(
    planTouchesShellTool({
      steps: [{ tool: "run-system-command", isSkill: true, input: {} }],
    }),
    true
  );
});

test("planTouchesShellTool: mendeteksi skill check-server-resource", () => {
  assert.equal(
    planTouchesShellTool({
      steps: [{ tool: "check-server-resource", isSkill: true, input: {} }],
    }),
    true
  );
});

test("planTouchesShellTool: mendeteksi shell-tool langsung", () => {
  assert.equal(
    planTouchesShellTool({
      steps: [{ tool: "shell-tool", isSkill: false, input: { command: "ls" } }],
    }),
    true
  );
});
