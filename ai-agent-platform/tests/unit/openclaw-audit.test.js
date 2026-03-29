"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");
const { normalizePlannerDecision } = require("../../core/utils/validator");
const { createToolRegistry } = require("../../core/tools");
const { createShortMemory } = require("../../core/memory/short.memory");

test("openclaw-audit menghasilkan gap utama", async () => {
  const orchestrator = buildDefaultOrchestrator();

  const result = await orchestrator.run("openclaw-audit", {
    openclawSnapshot: {
      modules: ["agent-core"],
      observability: { tracing: false, metrics: false },
      reliability: { retries: false, queue: false },
      memory: { longTerm: false },
    },
  });

  assert.equal(result.agent, "openclaw-architecture-mapper");
  assert.ok(Array.isArray(result.gaps));
  assert.ok(result.gaps.length >= 3);
  assert.ok(Array.isArray(result.recommendations));
});

test("validator menolak planner output tidak valid", () => {
  assert.throws(() => normalizePlannerDecision(null), /Planner output harus object JSON/);
  assert.throws(
    () => normalizePlannerDecision({ action: "tool" }),
    /Planner action=tool wajib punya tool_name/,
  );
});

test("tool registry menolak tool tanpa kontrak name/run", () => {
  assert.throws(() => createToolRegistry([{ name: "" }]), /Tool wajib punya properti name/);
  assert.throws(() => createToolRegistry([{ name: "bad-tool" }]), /wajib punya fungsi run/);
});

test("memory planner context menyimpan recent 3 dan summary saat limit kecil", () => {
  const memory = createShortMemory();
  for (let i = 1; i <= 6; i += 1) {
    memory.remember({
      userMessage: `user-message-${i}-${"x".repeat(40)}`,
      agentMessage: `agent-message-${i}-${"y".repeat(40)}`,
    });
  }

  const context = memory.buildPlannerContext({ maxTokens: 40, keepRecent: 3 });
  assert.equal(context.recent.length, 3);
  assert.equal(typeof context.summary, "string");
  assert.ok(context.summary.length > 0);
  assert.equal(typeof context.didSummarize, "boolean");
});
