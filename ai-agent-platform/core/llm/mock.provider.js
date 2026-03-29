"use strict";

function createMockProvider() {
  return {
    async plan(prompt, input = {}) {
      const snapshot = input.openclawSnapshot || {};
      const modules = snapshot.modules || [];
      const observability = snapshot.observability || {};
      const reliability = snapshot.reliability || {};

      const gaps = [];
      const recommendations = [];
      let score = 100;

      if (!modules.includes("orchestrator")) {
        gaps.push({ area: "orchestrator", issue: "Belum ada orchestrator modular" });
        recommendations.push("Bangun core/orchestrator dengan task router + workflow engine");
        score -= 20;
      }

      if (!observability.metrics) {
        gaps.push({ area: "observability", issue: "Metrics belum tersedia" });
        recommendations.push("Tambah event store + metrics collector untuk audit performa agent");
        score -= 15;
      }

      if (!reliability.retries) {
        gaps.push({ area: "reliability", issue: "Retry policy belum ada" });
        recommendations.push("Implementasi retry + dead-letter queue pada worker dan tools");
        score -= 15;
      }

      return {
        steps: [
          {
            name: "map-openclaw-architecture",
            tool: "openclaw-gap-analyzer-tool",
            input,
          },
        ],
        summary: `Rencana audit dibuat dari prompt: ${prompt.slice(0, 80)}...`,
        baseScore: Math.max(score, 0),
        gaps,
        recommendations,
      };
    },
  };
}

module.exports = { createMockProvider };
