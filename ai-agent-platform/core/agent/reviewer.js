"use strict";

class Reviewer {
  constructor({ llmProvider, logger }) {
    this.llmProvider = llmProvider;
    this.logger = logger;
  }

  async reviewPlan(plan, input) {
    const prompt = this.buildReviewPrompt(plan, input);
    
    try {
      // Gunakan method review() yang memiliki schema terpisah dari plan()
      // Ini mencegah conflict dengan normalizePlannerDecision yang hanya kenal action: respond/tool
      if (typeof this.llmProvider.review === "function") {
        return await this.llmProvider.review(prompt);
      }
      // Fallback untuk provider yang belum implement review() (mock provider)
      const rawDecision = await this.llmProvider.plan(prompt, input);
      return {
        approved: rawDecision.approved ?? true,
        reason: rawDecision.reason || "Diizinkan oleh system",
        suggestedChanges: rawDecision.suggestedChanges || []
      };
    } catch (e) {
      this.logger.warn("Reviewer agent gagal mengevaluasi, default ke reject demi keamanan", { error: e.message });
      return { approved: false, reason: "Reviewer error: " + e.message, suggestedChanges: [] };
    }
  }

  buildReviewPrompt(plan, input) {
    const stepsJson = JSON.stringify(plan.steps || [], null, 2);
    
    return [
      "Anda adalah Starclaw Security Reviewer Agent.",
      "Tugas Anda adalah mengevaluasi action / plan yang dibuat oleh Planner Agent sebelum dieksekusi di komputer." +
      "Perhatikan secara kritis tool yang akan dipanggil, khususnya 'shell-tool' dan 'fs-tool'.",
      "",
      "ATURAN KRITIS (VETO JIKA MELANGGAR):",
      "1. Tolak jika ada command mematikan OS (seperti `rm -rf /`, `mkfs`, format disk).",
      "2. Tolak jika ada penghapusan massal tanpa alasan tepat.",
      "3. Tolak jika berusaha membocorkan file .env, credentials, atau id_rsa.",
      "",
      "Jika aman, set approved: true.",
      "Jika berbahaya, set approved: false, dan beritahu alasannya.",
      "",
      "[PLAN YANG DIAJUKAN PLANNER]",
      stepsJson,
      "",
      "[AKSI PLANNER TERHADAP USER]",
      `Action: ${plan.plannerDecision}`,
      `Response ke user: ${plan.finalResponse || "-"}`,
      "",
      "PERHATIAN: Respon wajib dalam JSON Murni tanpa markdown.",
      "Format Output:",
      `{ "action": "respond", "approved": true/false, "reason": "alasan singkat", "suggestedChanges": ["saran 1", "saran 2"] }`
    ].join("\n");
  }
}

module.exports = { Reviewer };
