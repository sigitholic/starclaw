"use strict";

/**
 * Planner Guard — validasi output planner sebelum diteruskan ke executor.
 *
 * Lapisan keamanan antara LLM output dan executor:
 *
 *   LLM output → [normalizePlannerDecision] → [PlannerGuard] → Executor
 *
 * Guard melakukan:
 *   1. Cek setiap tool_name ada di registry
 *   2. Fuzzy match jika tidak ditemukan (auto-correction)
 *   3. Log detail saat ada mismatch
 *   4. Trigger regenerate jika tool tidak bisa di-correct
 *
 * Hasilnya: Executor TIDAK PERNAH menerima tool_name yang tidak ada di registry.
 */

const MAX_REGENERATE_ATTEMPTS = 2;

/**
 * Validasi dan koreksi semua steps dalam normalized plan.
 *
 * @param {object} plan - Output dari normalizePlannerDecision
 * @param {object} toolsRegistry - Instance ToolRegistry
 * @param {object} logger - Logger instance
 * @returns {{ valid: boolean, correctedPlan: object, issues: [] }}
 */
function guardPlan(plan, toolsRegistry, logger) {
  const issues = [];
  const correctedSteps = [];

  for (const step of plan.steps || []) {
    const toolName = step.tool;

    if (!toolName) {
      issues.push({ step: step.name, error: "Step tidak memiliki field 'tool'", fatal: true });
      correctedSteps.push(step);
      continue;
    }

    // Exact match — tidak ada masalah
    if (toolsRegistry.has(toolName)) {
      correctedSteps.push(step);
      continue;
    }

    // Tool tidak ditemukan — coba fuzzy match
    const resolved = toolsRegistry.resolve(toolName);

    if (resolved.tool && !resolved.wasExact) {
      // Auto-correction berhasil
      logger.warn("PlannerGuard: tool auto-corrected via fuzzy match", {
        requested: toolName,
        corrected: resolved.resolvedName,
        step: step.name,
      });
      issues.push({
        step: step.name,
        error: `Tool '${toolName}' tidak ditemukan`,
        correction: resolved.resolvedName,
        fatal: false,
      });
      correctedSteps.push({ ...step, tool: resolved.resolvedName });
    } else {
      // Tidak bisa di-correct
      logger.error("PlannerGuard: tool tidak ditemukan dan tidak bisa di-correct", {
        requested: toolName,
        available: toolsRegistry.list(),
        step: step.name,
      });
      issues.push({
        step: step.name,
        error: `Tool '${toolName}' tidak ada di registry`,
        available: toolsRegistry.list(),
        fatal: true,
      });
      correctedSteps.push(step); // Tetap masukkan — executor akan handle
    }
  }

  const hasFatalIssues = issues.some(i => i.fatal);
  const correctedPlan = { ...plan, steps: correctedSteps };

  return {
    valid: !hasFatalIssues,
    correctedPlan,
    issues,
    autoCorrections: issues.filter(i => !i.fatal && i.correction).length,
  };
}

/**
 * Buat prompt regenerasi yang minta LLM pilih tool yang valid.
 */
function buildRegeneratePrompt(originalMessage, invalidTools, availableTools) {
  return [
    `PERBAIKAN DIPERLUKAN: Planner sebelumnya memilih tool yang tidak tersedia.`,
    ``,
    `Tool yang diminta tapi TIDAK ADA: ${invalidTools.join(", ")}`,
    ``,
    `Tool yang TERSEDIA di registry:`,
    availableTools.map(t => `- ${t.name}: ${t.description}`).join("\n"),
    ``,
    `Buat ulang plan untuk perintah berikut menggunakan HANYA tool dari daftar di atas:`,
    `"${originalMessage}"`,
    ``,
    `WAJIB: Hanya gunakan tool_name dari daftar di atas. Jangan gunakan tool yang tidak ada.`,
  ].join("\n");
}

/**
 * PlannerGuard class — wrapper di sekitar Planner yang memastikan output valid.
 */
class PlannerGuard {
  constructor({ planner, toolsRegistry, llmProvider, logger }) {
    this.planner = planner;
    this.toolsRegistry = toolsRegistry;
    this.llmProvider = llmProvider;
    this.logger = logger;
  }

  async createPlan(input) {
    let attempt = 0;
    let lastIssues = [];

    while (attempt <= MAX_REGENERATE_ATTEMPTS) {
      attempt++;

      // Dapatkan plan dari planner
      const rawPlan = await this.planner.createPlan(input);

      // Skip validasi untuk plan tipe 'respond' (tidak ada tool)
      if (rawPlan.plannerDecision === "respond" || rawPlan.steps.length === 0) {
        return rawPlan;
      }

      // Guard: validasi semua tool names
      const { valid, correctedPlan, issues, autoCorrections } = guardPlan(
        rawPlan, this.toolsRegistry, this.logger
      );

      if (autoCorrections > 0) {
        this.logger.info("PlannerGuard: auto-correction applied", { count: autoCorrections });
      }

      if (valid) {
        // Semua tool valid (atau sudah di-correct)
        if (issues.length > 0) {
          this.logger.warn("PlannerGuard: plan valid dengan koreksi", { issues: issues.length });
        }
        return correctedPlan;
      }

      // Ada fatal issues — perlu regenerate
      lastIssues = issues;
      const fatalIssues = issues.filter(i => i.fatal);
      const invalidToolNames = fatalIssues.map(i => i.step);

      this.logger.warn("PlannerGuard: plan tidak valid, regenerate", {
        attempt,
        maxAttempts: MAX_REGENERATE_ATTEMPTS,
        fatalIssues: fatalIssues.length,
        invalidTools: fatalIssues.map(i => i.error),
      });

      if (attempt > MAX_REGENERATE_ATTEMPTS) break;

      // Buat prompt regenerasi dengan daftar tool yang valid
      const availableTools = this.toolsRegistry.getToolList();
      const regeneratePrompt = buildRegeneratePrompt(
        input.message || "",
        fatalIssues.map(i => i.error),
        availableTools
      );

      // Override pesan untuk regenerasi
      input = {
        ...input,
        message: regeneratePrompt,
        __isRegenerate: true,
        __regenerateAttempt: attempt,
      };
    }

    // Semua attempt habis — return plan yang ada dengan peringatan
    this.logger.error("PlannerGuard: semua attempt regenerate habis", {
      issues: lastIssues.map(i => i.error),
    });

    // Kembalikan fallback respond plan
    return {
      steps: [],
      summary: "Planner tidak dapat menemukan tool yang valid",
      baseScore: 0,
      gaps: [],
      recommendations: [],
      finalResponse: [
        "Tidak dapat menjalankan perintah karena tool yang dibutuhkan tidak tersedia.",
        `Tool tersedia: ${this.toolsRegistry.list().join(", ")}`,
        `Masalah: ${lastIssues.map(i => i.error).join("; ")}`,
      ].join(" "),
      plannerDecision: "respond",
    };
  }
}

module.exports = { PlannerGuard, guardPlan, buildRegeneratePrompt };
