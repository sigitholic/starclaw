"use strict";

function estimateTokens(input) {
  if (!input) {
    return 0;
  }

  const text = typeof input === "string" ? input : JSON.stringify(input);
  // Fix BUG-05: Gunakan koefisien 3 (bukan 4) untuk estimasi lebih konservatif.
  // Bahasa Indonesia/campuran cenderung membutuhkan lebih banyak token per karakter.
  // Untuk produksi: pertimbangkan library 'tiktoken' untuk akurasi penuh.
  return Math.ceil(text.length / 3);
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
  const fullHistoryUsage = ensureTokenBudget(
    {
      summary: previousSummary || "",
      older,
      recent,
    },
    maxTokens,
  );
  const shouldSummarizeOlder = fullHistoryUsage.used > maxTokens && older.length > 0;

  return {
    older,
    recent,
    payload,
    tokenUsage,
    fullHistoryUsage,
    shouldSummarizeOlder,
  };
}

module.exports = { estimateTokens, ensureTokenBudget, splitContextByBudget };
