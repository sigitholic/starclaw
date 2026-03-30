"use strict";

const { splitContextByBudget } = require("./token.manager");
const { summarizeInteractions, summarizeWithLLM } = require("./summarizer");
const { createLongMemoryStore } = require("./long.memory");
const { loadSession, saveSession } = require("./session.store");
const { agentConfig } = require("../../config/agent.config");

/**
 * @param {string} agentName - Nama agent untuk persist session (opsional)
 */
function createShortMemory(agentName = null) {
  // Load persisted session jika ada
  const persisted = agentName ? loadSession(agentName) : { interactions: [], summary: "" };
  const state = [...persisted.interactions];
  let summary = persisted.summary || "";

  if (agentName && state.length > 0) {
    console.log(`[ShortMemory] Loaded ${state.length} interaksi dari session '${agentName}'`);
  }

  function persistIfNeeded() {
    if (agentName) {
      saveSession(agentName, state, summary);
    }
  }

  return {
    remember(item) {
      state.push({ ...item, at: new Date().toISOString() });
      const maxItems = agentConfig.maxShortMemoryItems || 30;
      if (state.length > maxItems) {
        state.shift();
      }
      // Auto-persist setiap kali ada interaksi baru
      persistIfNeeded();
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
        summary = summarizeInteractions(summary, contextSplit.older);
        const pruneCount = Math.max(state.length - recent, 0);
        if (pruneCount > 0) state.splice(0, pruneCount);
        didSummarize = true;
        persistIfNeeded();
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
        if (agentConfig.useLLMSummarizer) {
          summary = await summarizeWithLLM(summary, contextSplit.older);
        } else {
          summary = summarizeInteractions(summary, contextSplit.older);
        }
        const pruneCount = Math.max(state.length - recent, 0);
        if (pruneCount > 0) state.splice(0, pruneCount);
        didSummarize = true;
        persistIfNeeded();
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
    flush() { persistIfNeeded(); },
    clearSession() {
      state.length = 0;
      summary = "";
      if (agentName) {
        const { deleteSession } = require("./session.store");
        deleteSession(agentName);
      }
    },
  };
}

/**
 * @param {string} agentName - Nama agent (untuk session persistence)
 */
function createMemory(agentName = null) {
  return {
    short: createShortMemory(agentName),
    long: createLongMemoryStore(),
  };
}

module.exports = { createShortMemory, createMemory };
