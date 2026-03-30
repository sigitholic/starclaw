"use strict";

/**
 * Planner Guard — validasi output planner sebelum diteruskan ke executor.
 * Regenerasi via LLM dinonaktifkan; hanya satu pass rule-based + koreksi registry.
 */

/**
 * Validasi dan koreksi semua steps dalam normalized plan.
 *
 * @param {object} plan - Output dari normalizePlannerDecision
 * @param {object} toolsRegistry - Instance ToolRegistry
 * @param {object} logger - Logger instance
 * @returns {{ valid: boolean, correctedPlan: object, issues: [] }}
 */
function guardPlan(plan, toolsRegistry, skillRegistry, logger) {
  const issues = [];
  const correctedSteps = [];

  for (const step of plan.steps || []) {
    const toolName = step.tool;

    if (!toolName) {
      issues.push({ step: step.name, error: "Step tidak memiliki field 'tool'", fatal: true });
      correctedSteps.push(step);
      continue;
    }

    if (step.isSkill) {
      if (!skillRegistry) {
        issues.push({
          step: step.name,
          error: "Skill registry tidak tersedia",
          fatal: true,
        });
        correctedSteps.push(step);
        continue;
      }
      if (typeof skillRegistry.has === "function" && skillRegistry.has(toolName)) {
        correctedSteps.push(step);
        continue;
      }
      logger.error("PlannerGuard: skill tidak ditemukan", {
        requested: toolName,
        available: skillRegistry.list ? skillRegistry.list() : [],
        step: step.name,
      });
      issues.push({
        step: step.name,
        error: `Skill '${toolName}' tidak ada di skill registry`,
        available: skillRegistry.list ? skillRegistry.list() : [],
        fatal: true,
      });
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
      correctedSteps.push(step);
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
 * Buat prompt regenerasi (legacy — tidak dipakai saat LLM regenerate dimatikan).
 */
function buildRegeneratePrompt(originalMessage, invalidTools, availableTools, availableSkills = []) {
  const skillLines = availableSkills.length > 0
    ? [
      ``,
      `Skill yang TERSEDIA (utamakan untuk tugas kompleks / multi-langkah):`,
      availableSkills.map(s => `- ${s.name}: ${s.description}`).join("\n"),
    ]
    : [];
  return [
    `PERBAIKAN DIPERLUKAN: Planner sebelumnya memilih tool atau skill yang tidak tersedia.`,
    ``,
    `Yang diminta tapi TIDAK ADA: ${invalidTools.join(", ")}`,
    ``,
    `Tool yang TERSEDIA di registry:`,
    availableTools.map(t => `- ${t.name}: ${t.description}`).join("\n"),
    ...skillLines,
    ``,
    `Buat ulang plan untuk perintah berikut menggunakan HANYA nama dari daftar di atas (tool atau skill).`,
    `"${originalMessage}"`,
    ``,
    `WAJIB: Untuk tugas sederhana satu langkah gunakan action "tool"; untuk tugas kompleks atau yang memetakan ke capability tingkat tugas, utamakan action "skill" dengan skill_name dari daftar skill.`,
  ].join("\n");
}

/**
 * PlannerGuard — satu pass; tanpa regenerate LLM.
 */
class PlannerGuard {
  constructor({ planner, toolsRegistry, skillRegistry, llmProvider, logger }) {
    this.planner = planner;
    this.toolsRegistry = toolsRegistry;
    this.skillRegistry = skillRegistry || null;
    this.llmProvider = llmProvider;
    this.logger = logger;
  }

  async createPlan(input) {
    const rawPlan = await this.planner.createPlan(input);

    if (rawPlan.plannerDecision === "respond" || rawPlan.steps.length === 0) {
      return rawPlan;
    }

    const { valid, correctedPlan, issues, autoCorrections } = guardPlan(
      rawPlan, this.toolsRegistry, this.skillRegistry, this.logger
    );

    if (autoCorrections > 0) {
      this.logger.info("PlannerGuard: auto-correction applied", { count: autoCorrections });
    }

    if (valid) {
      if (issues.length > 0) {
        this.logger.warn("PlannerGuard: plan valid dengan koreksi", { issues: issues.length });
      }
      return correctedPlan;
    }

    const fatalIssues = issues.filter(i => i.fatal);
    this.logger.error("PlannerGuard: plan tidak valid (tanpa regenerate LLM)", {
      fatalIssues: fatalIssues.length,
      invalidTools: fatalIssues.map(i => i.error),
    });

    return {
      steps: [],
      summary: "Planner tidak dapat menemukan tool atau skill yang valid",
      baseScore: 0,
      gaps: [],
      recommendations: [],
      finalResponse: [
        "Tidak dapat menjalankan perintah karena tool atau skill yang dibutuhkan tidak tersedia.",
        `Tool tersedia: ${this.toolsRegistry.list().join(", ")}`,
        this.skillRegistry && this.skillRegistry.list ? `Skill tersedia: ${this.skillRegistry.list().join(", ")}` : "",
        `Masalah: ${fatalIssues.map(i => i.error).join("; ")}`,
      ].filter(Boolean).join(" "),
      plannerDecision: "respond",
    };
  }
}

module.exports = { PlannerGuard, guardPlan, buildRegeneratePrompt };
