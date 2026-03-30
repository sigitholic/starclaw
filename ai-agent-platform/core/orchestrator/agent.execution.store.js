"use strict";

/**
 * Penyimpanan state eksekusi per agent (multi-run siap: kunci agentName + runId).
 * Dipakai API dashboard dan injeksi memori/trace.
 */
function createAgentExecutionStore() {
  /** @type {Map<string, object>} */
  const runs = new Map();

  /** @type {Map<string, string>} — agentId → runId terakhir diperbarui */
  const latestRunByAgent = new Map();

  function key(agentName, runId = "default") {
    return `${String(agentName || "unknown")}:${String(runId || "default")}`;
  }

  function trackLatest(agentName, runId) {
    latestRunByAgent.set(String(agentName || "unknown"), String(runId || "default"));
  }

  function getOrCreate(agentName, runId = "default") {
    const k = key(agentName, runId);
    if (!runs.has(k)) {
      runs.set(k, {
        agentId: String(agentName || "unknown"),
        runId: String(runId || "default"),
        executionState: {
          status: "idle",
          currentStep: 0,
          maxSteps: 5,
          goalReached: false,
          terminatedReason: null,
          modelId: null,
          routingMode: "manual",
        },
        stepHistory: [],
        lastToolResult: null,
        trace: [],
        updatedAt: new Date().toISOString(),
      });
    }
    trackLatest(agentName, runId);
    return runs.get(k);
  }

  function patch(agentName, runId, partial) {
    const entry = getOrCreate(agentName, runId);
    Object.assign(entry, partial, { updatedAt: new Date().toISOString() });
    trackLatest(agentName, runId);
    return entry;
  }

  function setExecutionState(agentName, runId, executionState) {
    return patch(agentName, runId, { executionState: { ...executionState } });
  }

  function appendStepHistory(agentName, runId, item) {
    const entry = getOrCreate(agentName, runId);
    entry.stepHistory.push({ ...item, at: new Date().toISOString() });
    entry.updatedAt = new Date().toISOString();
    trackLatest(agentName, runId);
    return entry;
  }

  function setLastToolResult(agentName, runId, result) {
    trackLatest(agentName, runId);
    return patch(agentName, runId, { lastToolResult: result });
  }

  function pushTrace(agentName, runId, traceEntry) {
    const entry = getOrCreate(agentName, runId);
    entry.trace.push(traceEntry);
    entry.updatedAt = new Date().toISOString();
    trackLatest(agentName, runId);
    return entry;
  }

  function get(agentName, runId = "default") {
    return runs.get(key(agentName, runId)) || null;
  }

  function getLatestRunId(agentId) {
    return latestRunByAgent.get(String(agentId)) || null;
  }

  function resolveRunId(agentId, runId) {
    if (runId && String(runId).trim()) {
      return String(runId);
    }
    return getLatestRunId(agentId);
  }

  function listAgentKeys(agentName) {
    const prefix = `${String(agentName)}:`;
    return Array.from(runs.keys()).filter((k) => k.startsWith(prefix));
  }

  return {
    getOrCreate,
    patch,
    setExecutionState,
    appendStepHistory,
    setLastToolResult,
    pushTrace,
    get,
    getLatestRunId,
    resolveRunId,
    listAgentKeys,
    _runs: runs,
  };
}

const agentExecutionStore = createAgentExecutionStore();

module.exports = {
  createAgentExecutionStore,
  agentExecutionStore,
};
