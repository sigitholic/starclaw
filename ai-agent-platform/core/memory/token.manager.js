"use strict";

function estimateTokens(input) {
  if (!input) {
    return 0;
  }

  const text = typeof input === "string" ? input : JSON.stringify(input);
  return Math.ceil(text.length / 4);
}

function ensureTokenBudget(input, budget = 4000) {
  const used = estimateTokens(input);
  return {
    used,
    budget,
    withinBudget: used <= budget,
  };
}

module.exports = { estimateTokens, ensureTokenBudget };
