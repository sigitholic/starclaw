"use strict";

const { splitContextByBudget } = require("./token.manager");
const { summarizeInteractions } = require("./summarizer");
const { createLongMemoryStore } = require("./long.memory");

function createShortMemory() {
  const state = [];
  let summary = "";

  return {
    remember(item) {
      state.push({ ...item, at: new Date().toISOString() });
      if (state.length > 30) {
        state.shift();
      }
    },
    recall(limit = 10) {
      return state.slice(-limit);
    },
    buildPlannerContext({ maxTokens = 3000, keepRecent = 3 } = {}) {
      const contextSplit = splitContextByBudget({
        interactions: state,
        previousSummary: summary,
        maxTokens,
        keepRecent,
      });

      let didSummarize = false;
      if (contextSplit.shouldSummarizeOlder) {
        summary = summarizeInteractions(summary, contextSplit.older);
        const pruneCount = Math.max(state.length - keepRecent, 0);
        if (pruneCount > 0) {
          state.splice(0, pruneCount);
        }
        didSummarize = true;
      }

      const refreshed = splitContextByBudget({
        interactions: state,
        previousSummary: summary,
        maxTokens,
        keepRecent,
      });

      return {
        summary,
        recent: refreshed.recent,
        tokenUsage: refreshed.tokenUsage,
        fullHistoryUsage: refreshed.fullHistoryUsage,
        didSummarize,
      };
    },
  };
}

/**
 * Fix BUG-04: createMemory() sekarang expose long memory store.
 * Sebelumnya long.memory.js sudah ada tapi tidak pernah dipakai oleh agent.
 * Sekarang agent bisa akses: memory.long.put(), memory.long.get(), memory.long.searchSimilar()
 */
function createMemory() {
  return {
    short: createShortMemory(),
    long: createLongMemoryStore(),
  };
}

module.exports = { createShortMemory, createMemory };
