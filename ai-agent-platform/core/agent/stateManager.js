"use strict";

/**
 * State eksekusi deterministik untuk loop planner → tool → memory → decision.
 */
function createExecutionState(overrides = {}) {
  return {
    stepCount: 0,
    maxSteps: typeof overrides.maxSteps === "number" && overrides.maxSteps > 0 ? overrides.maxSteps : 5,
    lastResult: null,
    history: [],
    isCompleted: false,
  };
}

function appendTrace(state, entry) {
  if (!state || !state.history) return;
  state.history.push({
    step: state.stepCount,
    tool: entry.tool,
    input: entry.input != null ? entry.input : {},
    output: entry.output,
    time: Date.now(),
    ...entry.extra,
  });
}

module.exports = {
  createExecutionState,
  appendTrace,
};
