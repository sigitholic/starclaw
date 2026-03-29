"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");
const { normalizePlannerDecision } = require("../../core/utils/validator");
const { createToolRegistry } = require("../../core/tools");
const { createShortMemory } = require("../../core/memory/short.memory");
const { EVENT_TYPES } = require("../../core/events/event.types");

test("platform-assistant berjalan sebagai task default framework", async () => {
  const orchestrator = buildDefaultOrchestrator();
  const result = await orchestrator.run("platform-assistant", {
    message: "status platform starclaw",
  });

  assert.equal(result.agent, "platform-assistant-agent");
  assert.equal(typeof result.summary, "string");
  assert.ok((result.finalResponse || "").includes("Starclaw Platform"));
});

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
  assert.equal(typeof context.fullHistoryUsage.used, "number");
  assert.ok(context.didSummarize);
});

test("workflow noc multi-agent memancarkan event berurutan", async () => {
  const orchestrator = buildDefaultOrchestrator();
  const result = await orchestrator.run("noc-incident-workflow", {
    taskId: "noc-test-1",
    signal: "packet-loss",
    severity: "high",
    action: "reroute-link",
  });

  assert.equal(result.workflow, "monitor-analyzer-executor");
  assert.equal(result.monitor.agent, "noc-monitor-agent");
  assert.equal(result.analyzer.agent, "noc-analyzer-agent");
  assert.equal(result.executor.agent, "noc-executor-agent");

  const events = orchestrator.getEvents().map((entry) => entry.type);
  const taskCreatedIndex = events.indexOf(EVENT_TYPES.TASK_CREATED);
  const taskAnalyzedIndex = events.indexOf(EVENT_TYPES.TASK_ANALYZED);
  const actionExecutedIndex = events.indexOf(EVENT_TYPES.ACTION_EXECUTED);

  assert.ok(taskCreatedIndex >= 0);
  assert.ok(taskAnalyzedIndex > taskCreatedIndex);
  assert.ok(actionExecutedIndex > taskAnalyzedIndex);
});

test("phase-4 trace event tersedia dengan payload terstruktur", async () => {
  const orchestrator = buildDefaultOrchestrator();
  await orchestrator.run("openclaw-audit", {
    message: "please audit architecture",
    openclawSnapshot: {
      modules: ["agent-core"],
      observability: { tracing: false, metrics: false },
      reliability: { retries: false, queue: false },
      memory: { longTerm: false },
    },
  });

  const events = orchestrator.getEvents();
  const mustExist = [
    EVENT_TYPES.AGENT_STARTED,
    EVENT_TYPES.PLANNER_DECISION,
    EVENT_TYPES.TOOL_CALLED,
    EVENT_TYPES.TOOL_RESULT,
    EVENT_TYPES.AGENT_FINISHED,
  ];

  for (const eventType of mustExist) {
    const traceEvent = events.find((entry) => entry.type === eventType);
    assert.ok(traceEvent, `event ${eventType} harus ada`);
    assert.equal(typeof traceEvent.payload.timestamp, "string");
    assert.equal(typeof traceEvent.payload.agent, "string");
    assert.equal(typeof traceEvent.payload.payload, "object");
  }
});

test("status agent dihitung dari event start/finish", async () => {
  const orchestrator = buildDefaultOrchestrator();
  await orchestrator.run("noc-incident-workflow", {
    taskId: "noc-test-status",
    signal: "packet-loss",
    severity: "high",
    action: "reroute-link",
  });

  const events = orchestrator.getEvents();
  const activeAgents = new Set();
  const allAgents = new Set();

  for (const event of events) {
    const payload = event.payload || {};
    const agent = payload.agent;
    if (!agent) {
      continue;
    }
    allAgents.add(agent);
    if (event.type === EVENT_TYPES.AGENT_STARTED) {
      activeAgents.add(agent);
    } else if (event.type === EVENT_TYPES.AGENT_FINISHED) {
      activeAgents.delete(agent);
    }
  }

  assert.ok(allAgents.has("noc-monitor-agent"));
  assert.ok(allAgents.has("noc-analyzer-agent"));
  assert.ok(allAgents.has("noc-executor-agent"));
  assert.equal(activeAgents.size, 0);
});
