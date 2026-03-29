"use strict";

const { summarizeGaps } = require("../../../core/memory/summarizer");

function createOpenClawGapAnalyzerTool() {
  return {
    name: "openclaw-gap-analyzer-tool",
    async run(input = {}) {
      const snapshot = input.openclawSnapshot || {};
      const modules = snapshot.modules || [];
      const observability = snapshot.observability || {};
      const reliability = snapshot.reliability || {};
      const memory = snapshot.memory || {};

      const gaps = [];

      if (!modules.includes("orchestrator")) {
        gaps.push({ area: "orchestrator", issue: "Routing task lintas agent belum jelas" });
      }
      if (!modules.includes("event-bus")) {
        gaps.push({ area: "events", issue: "Belum ada event bus untuk tracing lifecycle task" });
      }
      if (!observability.metrics) {
        gaps.push({ area: "observability", issue: "Metrics collector belum ada" });
      }
      if (!observability.tracing) {
        gaps.push({ area: "observability", issue: "Distributed tracing belum ada" });
      }
      if (!reliability.retries) {
        gaps.push({ area: "reliability", issue: "Retry strategy belum tersedia" });
      }
      if (!reliability.queue) {
        gaps.push({ area: "reliability", issue: "Queue worker untuk durability belum ada" });
      }
      if (!memory.longTerm) {
        gaps.push({ area: "memory", issue: "Long-term memory store belum tersedia" });
      }

      return {
        detectedComponents: modules,
        gapSummary: summarizeGaps(gaps),
        gaps,
      };
    },
  };
}

module.exports = { createOpenClawGapAnalyzerTool };
