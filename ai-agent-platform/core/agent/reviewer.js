"use strict";

const SAFE_SKILL_SHELL_COMMANDS = ["ping"];

/**
 * Evaluasi eksekusi shell-tool: skill dengan perintah aman → izinkan;
 * tanpa meta.skill → blokir eksekusi langsung; selain itu serahkan ke Reviewer LLM.
 */
function reviewShellToolExecution(input) {
  // eslint-disable-next-line no-console
  console.log("REVIEWER CHECK:", input);

  if (!input.meta || input.meta.source !== "skill") {
    return {
      allow: false,
      reason: "Direct command execution not allowed",
    };
  }

  if (input.meta.skillName === "run-system-command") {
    const cmd = String(input.command || "");
    if (SAFE_SKILL_SHELL_COMMANDS.some((token) => cmd.includes(token))) {
      return { allow: true };
    }
  }

  return null;
}

function buildReviewerInputForSkillStep(step) {
  const o = step && step.input && typeof step.input === "object" ? step.input : {};
  const target = typeof o.target === "string" ? o.target.trim() : "";
  const explicit = o.command || o.cmd;
  let command;
  if (explicit) {
    command = explicit;
  } else if (target) {
    command = `ping -c 4 ${target}`;
  } else {
    command = "pwd";
  }
  return {
    command,
    meta: {
      source: "skill",
      skillName: "run-system-command",
    },
  };
}

function buildReviewerInputForDirectShellStep(step) {
  const o = step && step.input && typeof step.input === "object" ? step.input : {};
  return {
    command: o.command || o.cmd || "",
    meta: o.meta,
  };
}

/**
 * Apakah plan memuat langkah yang pada akhirnya memanggil shell-tool (skill atau langsung).
 */
function planTouchesShellTool(plan) {
  const steps = Array.isArray(plan && plan.steps) ? plan.steps : [];
  return steps.some((s) => {
    if (!s) return false;
    if (s.isSkill && s.tool === "run-system-command") return true;
    if (!s.isSkill && s.tool === "shell-tool") return true;
    return false;
  });
}

class Reviewer {
  constructor({ llmProvider, logger }) {
    this.llmProvider = llmProvider;
    this.logger = logger;
  }

  async reviewPlan(plan, input) {
    const shellDecision = this.evaluateShellStepsInPlan(plan);
    if (shellDecision) {
      return shellDecision;
    }

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

  /**
   * Pre-flight untuk shell: blokir shell-tool tanpa konteks skill; izinkan skill+ping; lainnya → LLM.
   */
  evaluateShellStepsInPlan(plan) {
    if (!planTouchesShellTool(plan)) {
      return null;
    }

    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    let needsLlm = false;

    for (const step of steps) {
      if (!step) continue;

      if (step.isSkill && step.tool === "run-system-command") {
        const shellInput = buildReviewerInputForSkillStep(step);
        const local = reviewShellToolExecution(shellInput);
        if (local && local.allow === false) {
          return {
            approved: false,
            reason: local.reason || "Direct command execution not allowed",
            suggestedChanges: [],
          };
        }
        if (local && local.allow === true) {
          continue;
        }
        needsLlm = true;
        continue;
      }

      if (!step.isSkill && step.tool === "shell-tool") {
        const shellInput = buildReviewerInputForDirectShellStep(step);
        const local = reviewShellToolExecution(shellInput);
        if (local && local.allow === false) {
          return {
            approved: false,
            reason: local.reason || "Direct command execution not allowed",
            suggestedChanges: [],
          };
        }
        if (local && local.allow === true) {
          continue;
        }
        needsLlm = true;
      }
    }

    const nonShellSteps = steps.filter((s) => {
      if (!s) return false;
      if (s.isSkill && s.tool === "run-system-command") return false;
      if (!s.isSkill && s.tool === "shell-tool") return false;
      return true;
    });

    if (!needsLlm && nonShellSteps.length === 0) {
      return {
        approved: true,
        reason: "Diizinkan: perintah shell dari skill terpercaya (validasi aman)",
        suggestedChanges: [],
      };
    }

    return null;
  }

  buildReviewPrompt(plan, input) {
    const stepsJson = JSON.stringify(plan.steps || [], null, 2);
    
    return [
      "Anda adalah Starclaw Security Reviewer Agent.",
      "Tugas Anda adalah mengevaluasi action / plan yang dibuat oleh Planner Agent sebelum dieksekusi di komputer." +
      "Perhatikan secara kritis tool yang akan dipanggil, khususnya 'shell-tool' dan 'fs-tool'.",
      "",
      "ATURAN KRITIS (VETO JIKA MELANGGAR):",
      "1. Tolak jika ada perintah penghapusan rekursif pada root filesystem, pemformatan disk, atau perintah setara yang mematikan OS.",
      "2. Tolak jika ada penghapusan massal tanpa alasan tepat.",
      "3. Tolak jika berusaha membocorkan file konfigurasi sensitif (mis. kredensial), credentials, atau kunci privat SSH.",
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

module.exports = {
  Reviewer,
  reviewShellToolExecution,
  planTouchesShellTool,
};
