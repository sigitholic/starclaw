"use strict";

/**
 * Mock Provider yang ditingkatkan — mendukung review() dan pola plan() yang lebih pintar.
 * Digunakan saat OPENAI_API_KEY tidak tersedia.
 */
function createMockProvider() {
  return {
    async plan(prompt, input = {}) {
      const snapshot = input.openclawSnapshot || {};
      const modules = snapshot.modules || [];
      const observability = snapshot.observability || {};
      const reliability = snapshot.reliability || {};
      const userMessage = typeof input.message === "string" ? input.message : "";

      // Cek apakah ada observations dari iterasi sebelumnya (Re-Act loop)
      const hasObservations = Array.isArray(input.observations) && input.observations.length > 0;

      // Jika ada observations dari tool sebelumnya, respond langsung (akhiri loop)
      if (hasObservations) {
        const lastObs = input.observations[input.observations.length - 1];
        return {
          action: "respond",
          response: `Berdasarkan hasil tool terakhir (${lastObs.tool}, status: ${lastObs.status}), tugas telah selesai. ${lastObs.output || ""}`,
          summary: "Mock planner merespon berdasarkan observations",
          baseScore: 70,
        };
      }

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

    /**
     * review(): Support untuk Reviewer Agent.
     * Mock selalu approve kecuali ada kata kunci berbahaya.
     */
    async review(prompt) {
      // Hanya evaluasi isi plan (bukan teks instruksi reviewer) — cegah false positive
      const planSection =
        (prompt.match(/\[PLAN YANG DIAJUKAN PLANNER\]\s*([\s\S]*?)(?:\[AKSI PLANNER|$)/i) || [])[1] || prompt;
      const dangerousPatterns = /rm\s+-rf\s*\/|mkfs|curl\s+.*\|\s*bash|wget\s+.*\|\s*sh/i;
      const isDangerous = dangerousPatterns.test(planSection);

      return {
        approved: !isDangerous,
        reason: isDangerous
          ? "Mock Reviewer: Terdeteksi perintah berbahaya di dalam plan"
          : "Mock Reviewer: Plan aman untuk dieksekusi",
        suggestedChanges: isDangerous ? ["Hapus perintah yang berpotensi destruktif"] : [],
      };
    },
  };
}

module.exports = { createMockProvider };
