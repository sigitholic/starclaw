"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");
const { normalizePlannerDecision } = require("../../core/utils/validator");
const { createToolRegistry } = require("../../core/tools");

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
