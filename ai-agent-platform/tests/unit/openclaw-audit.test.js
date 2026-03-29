"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");

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
