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

function splitContextByBudget({
  interactions = [],
  previousSummary = "",
  maxTokens = 3000,
  keepRecent = 3,
}) {
  const normalizedInteractions = Array.isArray(interactions) ? interactions : [];
  const recent = normalizedInteractions.slice(-keepRecent);
  const older = normalizedInteractions.slice(0, Math.max(normalizedInteractions.length - keepRecent, 0));

  const payload = {
    summary: previousSummary || "",
    recent,
  };

  const tokenUsage = ensureTokenBudget(payload, maxTokens);
  const shouldSummarizeOlder = tokenUsage.used > maxTokens && older.length > 0;

  return {
    older,
    recent,
    payload,
    tokenUsage,
    shouldSummarizeOlder,
  };
}

module.exports = { estimateTokens, ensureTokenBudget, splitContextByBudget };
