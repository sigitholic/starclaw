"use strict";

const { splitContextByBudget } = require("./token.manager");
const { summarizeInteractions, summarizeWithLLM } = require("./summarizer");
const { createLongMemoryStore } = require("./long.memory");
const { agentConfig } = require("../../config/agent.config");

function createShortMemory() {
  const state = [];
  let summary = "";

  return {
    remember(item) {
      state.push({ ...item, at: new Date().toISOString() });
      // Trim old entries jika melebihi batas
      const maxItems = agentConfig.maxShortMemoryItems || 30;
      if (state.length > maxItems) {
        state.shift();
      }
    },

    recall(limit = 10) {
      return state.slice(-limit);
    },

    /**
     * Bangun context untuk Planner — sync (untuk backward compatibility).
     * Gunakan buildPlannerContextAsync untuk summarisasi via LLM.
     */
    buildPlannerContext({ maxTokens, keepRecent } = {}) {
      const budget = maxTokens || agentConfig.defaultTokenBudget || 4000;
      const recent = keepRecent || agentConfig.plannerRecentWindow || 5;

      const contextSplit = splitContextByBudget({
        interactions: state,
        previousSummary: summary,
        maxTokens: budget,
        keepRecent: recent,
      });

      let didSummarize = false;
      if (contextSplit.shouldSummarizeOlder) {
        // Sync rule-based summarization (cepat, tidak pakai token)
        summary = summarizeInteractions(summary, contextSplit.older);
        const pruneCount = Math.max(state.length - recent, 0);
        if (pruneCount > 0) state.splice(0, pruneCount);
        didSummarize = true;
      }

      const refreshed = splitContextByBudget({
        interactions: state,
        previousSummary: summary,
        maxTokens: budget,
        keepRecent: recent,
      });

      return {
        summary,
        recent: refreshed.recent,
        tokenUsage: refreshed.tokenUsage,
        fullHistoryUsage: refreshed.fullHistoryUsage,
        didSummarize,
      };
    },

    /**
     * Async version — menggunakan LLM summarizer jika dikonfigurasi.
     * Lebih akurat tapi sedikit lebih lambat karena bisa panggil LLM.
     */
    async buildPlannerContextAsync({ maxTokens, keepRecent } = {}) {
      const budget = maxTokens || agentConfig.defaultTokenBudget || 4000;
      const recent = keepRecent || agentConfig.plannerRecentWindow || 5;

      const contextSplit = splitContextByBudget({
        interactions: state,
        previousSummary: summary,
        maxTokens: budget,
        keepRecent: recent,
      });

      let didSummarize = false;
      if (contextSplit.shouldSummarizeOlder) {
        // LLM atau rule-based berdasarkan config
        if (agentConfig.useLLMSummarizer) {
          summary = await summarizeWithLLM(summary, contextSplit.older);
        } else {
          summary = summarizeInteractions(summary, contextSplit.older);
        }
        const pruneCount = Math.max(state.length - recent, 0);
        if (pruneCount > 0) state.splice(0, pruneCount);
        didSummarize = true;
      }

      const refreshed = splitContextByBudget({
        interactions: state,
        previousSummary: summary,
        maxTokens: budget,
        keepRecent: recent,
      });

      return {
        summary,
        recent: refreshed.recent,
        tokenUsage: refreshed.tokenUsage,
        fullHistoryUsage: refreshed.fullHistoryUsage,
        didSummarize,
      };
    },

    getSize() { return state.length; },
    getSummary() { return summary; },
  };
}

function createMemory() {
  return {
    short: createShortMemory(),
    long: createLongMemoryStore(),
  };
}

module.exports = { createShortMemory, createMemory };
