"use strict";

function createMockProvider() {
  return {
    async plan(prompt, input = {}) {
      const snapshot = input.openclawSnapshot || {};
      const modules = snapshot.modules || [];
      const observability = snapshot.observability || {};
      const reliability = snapshot.reliability || {};
      const userMessage = typeof input.message === "string" ? input.message : "";

      if (userMessage.trim() && !/audit|map|analy/i.test(userMessage)) {
        return {
          action: "respond",
          response: `Pesan diterima: "${userMessage}". Gunakan kata kunci audit/map/analyze untuk memicu tool audit OpenClaw.`,
          summary: "Planner memutuskan direct response",
          baseScore: 0,
        };
      }

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
        action: "tool",
        tool_name: "openclaw-gap-analyzer-tool",
        input,
        step_name: "map-openclaw-architecture",
        timeoutMs: 3000,
        maxRetries: 1,
        summary: `Rencana audit dibuat dari prompt: ${prompt.slice(0, 80)}...`,
        baseScore: Math.max(score, 0),
        response: "Audit OpenClaw selesai dieksekusi.",
        gaps,
        recommendations,
      };
    },
  };
}

module.exports = { createMockProvider };
