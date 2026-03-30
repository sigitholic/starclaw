"use strict";

function requireFields(input, fields) {
  const missing = fields.filter((field) => !(field in (input || {})));
  if (missing.length > 0) {
    throw new Error(`Field wajib belum ada: ${missing.join(", ")}`);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateToolContract(tool) {
  if (!isPlainObject(tool)) {
    throw new Error("Tool harus berupa object");
  }
  if (typeof tool.name !== "string" || tool.name.trim() === "") {
    throw new Error("Tool wajib punya properti name bertipe string");
  }
  if (typeof tool.run !== "function") {
    throw new Error(`Tool ${tool.name} wajib punya fungsi run(input)`);
  }
}

// ===================================================================
// STRICT STEP VALIDATOR
// Setiap step WAJIB punya: action, tool, input
// ===================================================================

/**
 * Validasi internal satu step — strict mode.
 * Throw error dengan pesan yang jelas jika step tidak valid.
 */
function validateStep(step, index) {
  const prefix = `Step #${index + 1}`;

  if (!isPlainObject(step)) {
    throw new Error(`${prefix}: step harus berupa object, bukan ${typeof step}`);
  }

  // action wajib
  if (!step.action && !step.tool && !step.skill && !step.skill_name) {
    throw new Error(
      `${prefix}: step WAJIB punya field "action" (nilai: "tool", "skill", atau "respond") atau field tool/skill. ` +
      `Diterima: ${JSON.stringify(Object.keys(step))}`
    );
  }

  // Jika action=tool atau tidak ada action tapi ada tool → validasi field tool
  const effectiveAction =
    step.action || (step.tool || step.tool_name ? "tool" : null) ||
    (step.skill || step.skill_name ? "skill" : null);
  if (effectiveAction === "tool") {
    const toolName = step.tool || step.tool_name;
    if (!toolName || typeof toolName !== "string" || toolName.trim() === "") {
      throw new Error(
        `${prefix}: step dengan action="tool" WAJIB punya field "tool" berisi nama tool yang valid. ` +
        `Diterima: tool=${JSON.stringify(step.tool)}, tool_name=${JSON.stringify(step.tool_name)}`
      );
    }

    if (!isPlainObject(step.input) && step.input !== undefined) {
      throw new Error(
        `${prefix}: field "input" harus berupa object jika ada. Diterima: ${typeof step.input}`
      );
    }
  }
  if (effectiveAction === "skill") {
    const skillName = step.skill || step.skill_name;
    if (!skillName || typeof skillName !== "string" || skillName.trim() === "") {
      throw new Error(
        `${prefix}: step dengan action="skill" WAJIB punya field "skill" atau "skill_name". ` +
        `Diterima: skill=${JSON.stringify(step.skill)}, skill_name=${JSON.stringify(step.skill_name)}`
      );
    }
    if (!isPlainObject(step.input) && step.input !== undefined) {
      throw new Error(
        `${prefix}: field "input" harus berupa object jika ada. Diterima: ${typeof step.input}`
      );
    }
  }
}

/**
 * Normalisasi satu step ke format internal Starclaw.
 * Format internal: { name, tool, input, timeoutMs, maxRetries }
 */
function normalizeStep(step, index) {
  if (step.action === "skill" || step.skill || step.skill_name) {
    const skillName = step.skill || step.skill_name;
    return {
      name: step.step_name || step.name || `step-${index + 1}`,
      tool: skillName,
      isSkill: true,
      input: isPlainObject(step.input) ? step.input : {},
      timeoutMs: step.timeoutMs,
      maxRetries: step.maxRetries,
    };
  }
  const toolName = step.tool || step.tool_name;
  return {
    name: step.step_name || step.name || `step-${index + 1}`,
    tool: toolName,
    isSkill: false,
    input: isPlainObject(step.input) ? step.input : {},
    timeoutMs: step.timeoutMs,
    maxRetries: step.maxRetries,
  };
}

// ===================================================================
// PLANNER OUTPUT NORMALIZER — STRICT TOOL-BASED
//
// Format yang diterima (dari LLM):
//
// FORMAT 1 — action: "respond"
//   { "action": "respond", "response": "...", "summary": "..." }
//
// FORMAT 2a — action: "skill" (1 step, skill layer)
//   { "action": "skill", "skill_name": "...", "input": {}, "summary": "..." } → plannerDecision: "skill"
//
// FORMAT 2b — action: "tool" (1 step)
//   { "action": "tool", "tool_name": "...", "input": {}, "summary": "..." }
//
// FORMAT 3 — action: "multi-tool" (beberapa step)
//   { "action": "multi-tool", "steps": [...], "summary": "..." }
//
// FORMAT 4 — NEW: type: "plan" (format strict baru)
//   { "type": "plan", "steps": [{ "action": "tool", "tool": "...", "input": {} }] }
//
// TIDAK DITERIMA LAGI:
//   - Format legacy-plan (steps tanpa action/tool per step)
//   - Step berbentuk teks
//   - Step tanpa action
// ===================================================================

function applyPlannerSuccessRespondPolicy(plan, lastToolResult) {
  if (!plan || !isPlainObject(plan)) return plan;
  const execDecisions = plan.plannerDecision === "tool" || plan.plannerDecision === "skill";
  if (!execDecisions || !Array.isArray(plan.steps)) return plan;
  const last = lastToolResult && typeof lastToolResult === "object" ? lastToolResult : null;
  if (!last || last.success !== true) return plan;

  // eslint-disable-next-line global-require
  const { formatFinalAnswer } = require("../llm/modelRouter");
  const msg = formatFinalAnswer(last);
  return {
    ...plan,
    steps: [],
    summary: plan.summary || "Tool selesai — jawaban final",
    finalResponse: msg,
    plannerDecision: "respond",
  };
}

function normalizePlannerDecision(rawDecision) {
  if (!isPlainObject(rawDecision)) {
    throw new Error("Planner output harus object JSON, bukan " + typeof rawDecision);
  }

  // ----------------------------------------------------------------
  // FORMAT 1: action = "respond"
  // ----------------------------------------------------------------
  if (rawDecision.action === "respond") {
    const text =
      rawDecision.message != null && String(rawDecision.message).trim() !== ""
        ? String(rawDecision.message)
        : (rawDecision.response != null ? String(rawDecision.response) : "");
    return {
      steps: [],
      summary: rawDecision.summary || "Planner memutuskan respon langsung",
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps: [],
      recommendations: [],
      finalResponse: text,
      plannerDecision: "respond",
    };
  }

  // ----------------------------------------------------------------
  // FORMAT 2a: action = "skill" (single step — skill layer)
  // ----------------------------------------------------------------
  if (rawDecision.action === "skill") {
    const skillName = rawDecision.skill_name || rawDecision.skill;
    if (!skillName || typeof skillName !== "string" || skillName.trim() === "") {
      throw new Error(
        'Planner action=skill wajib punya skill_name: field "skill_name" atau "skill" berisi nama skill yang valid. ' +
        `Diterima: skill_name=${JSON.stringify(rawDecision.skill_name)}, skill=${JSON.stringify(rawDecision.skill)}`
      );
    }
    return {
      steps: [{
        name: rawDecision.step_name || `run-${skillName}`,
        tool: skillName,
        isSkill: true,
        input: isPlainObject(rawDecision.input) ? rawDecision.input : {},
        timeoutMs: rawDecision.timeoutMs,
        maxRetries: rawDecision.maxRetries,
      }],
      summary: rawDecision.summary || `Menjalankan skill ${skillName}`,
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps: [],
      recommendations: [],
      finalResponse: typeof rawDecision.response === "string" ? rawDecision.response : null,
      plannerDecision: "skill",
    };
  }

  // ----------------------------------------------------------------
  // FORMAT 2b: action = "tool" (single step)
  // ----------------------------------------------------------------
  if (rawDecision.action === "tool") {
    const toolName = rawDecision.tool_name || rawDecision.tool;
    if (!toolName || typeof toolName !== "string" || toolName.trim() === "") {
      throw new Error(
        'Planner action=tool wajib punya tool_name: field "tool_name" atau "tool" berisi nama tool yang valid. ' +
        `Diterima: tool_name=${JSON.stringify(rawDecision.tool_name)}, tool=${JSON.stringify(rawDecision.tool)}`
      );
    }
    return {
      steps: [{
        name: rawDecision.step_name || `run-${toolName}`,
        tool: toolName,
        isSkill: false,
        input: isPlainObject(rawDecision.input) ? rawDecision.input : {},
        timeoutMs: rawDecision.timeoutMs,
        maxRetries: rawDecision.maxRetries,
      }],
      summary: rawDecision.summary || `Memanggil tool ${toolName}`,
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps: [],
      recommendations: [],
      finalResponse: typeof rawDecision.response === "string" ? rawDecision.response : null,
      plannerDecision: "tool",
    };
  }

  // ----------------------------------------------------------------
  // FORMAT 3: action = "multi-tool" (multiple steps)
  // ----------------------------------------------------------------
  if (rawDecision.action === "multi-tool") {
    if (!Array.isArray(rawDecision.steps) || rawDecision.steps.length === 0) {
      throw new Error('Planner action="multi-tool" wajib punya array "steps" yang tidak kosong');
    }
    const normalizedSteps = rawDecision.steps.map((s, idx) => {
      validateStep(s, idx); // STRICT: setiap step divalidasi
      return normalizeStep(s, idx);
    });
    return {
      steps: normalizedSteps,
      summary: rawDecision.summary || `Plan ${normalizedSteps.length} langkah`,
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps: Array.isArray(rawDecision.gaps) ? rawDecision.gaps : [],
      recommendations: Array.isArray(rawDecision.recommendations) ? rawDecision.recommendations : [],
      finalResponse: typeof rawDecision.response === "string" ? rawDecision.response : null,
      plannerDecision: "tool",
    };
  }

  // ----------------------------------------------------------------
  // FORMAT 4 (BARU): type = "plan" — format strict dari permintaan
  //   { "type": "plan", "steps": [{ "action": "tool", "tool": "...", "input": {} }] }
  // ----------------------------------------------------------------
  if (rawDecision.type === "plan") {
    if (!Array.isArray(rawDecision.steps) || rawDecision.steps.length === 0) {
      throw new Error('Format type="plan" wajib punya array "steps" yang tidak kosong');
    }
    const normalizedSteps = rawDecision.steps.map((s, idx) => {
      validateStep(s, idx); // STRICT validation
      if (s.action === "respond") {
        // Step terakhir bisa action=respond untuk mengembalikan pesan
        return { name: `respond-${idx + 1}`, tool: "__respond__", input: { message: s.response || s.message || "" } };
      }
      return normalizeStep(s, idx);
    });
    return {
      steps: normalizedSteps,
      summary: rawDecision.summary || `Plan terstruktur ${normalizedSteps.length} langkah`,
      baseScore: 0,
      gaps: [],
      recommendations: [],
      finalResponse: null,
      plannerDecision: "tool",
    };
  }

  // ----------------------------------------------------------------
  // FALLBACK HEURISTIK — tangkap output LLM yang tidak rapi
  // ----------------------------------------------------------------

  // Kasus: LLM mengembalikan nama tool langsung di field "action"
  // Contoh: { "action": "genieacs-tool", "input": {...} }
  if (
    typeof rawDecision.action === "string" &&
    rawDecision.action !== "respond" &&
    rawDecision.action !== "tool" &&
    rawDecision.action !== "skill" &&
    rawDecision.action !== "multi-tool"
  ) {
    const looksLikeToolName = /^[a-z0-9_-]+$/i.test(rawDecision.action) && rawDecision.action.length < 60;
    if (looksLikeToolName) {
      console.warn(
        `[Validator] Auto-fix: action="${rawDecision.action}" dideteksi sebagai nama tool. ` +
        `Konversi ke format action="tool", tool_name="${rawDecision.action}"`
      );
      return normalizePlannerDecision({
        action: "tool",
        tool_name: rawDecision.action,
        step_name: rawDecision.step_name || rawDecision.step || `run-${rawDecision.action}`,
        input: rawDecision.input || rawDecision.parameters || {},
        summary: rawDecision.summary || `Memanggil tool ${rawDecision.action}`,
        response: rawDecision.response,
      });
    }
  }

  // Kasus: LLM mengembalikan array steps langsung tanpa wrapper
  // Contoh: [{ "action": "tool", "tool": "genieacs-tool", "input": {} }]
  if (Array.isArray(rawDecision)) {
    if (rawDecision.length === 0) {
      return { steps: [], summary: "Plan kosong", baseScore: 0, gaps: [], recommendations: [], finalResponse: null, plannerDecision: "respond" };
    }
    console.warn("[Validator] Auto-fix: LLM mengembalikan array steps langsung, dibungkus sebagai multi-tool");
    return normalizePlannerDecision({ action: "multi-tool", steps: rawDecision });
  }

  // LEGACY FORMAT TIDAK DITERIMA LAGI
  // Jika ada field steps tapi tidak ada action/type → reject dengan pesan jelas
  if (Array.isArray(rawDecision.steps) && !rawDecision.action && !rawDecision.type) {
    const hasStepsWithoutTool = rawDecision.steps.some(s => !s.tool && !s.tool_name);
    if (hasStepsWithoutTool) {
      throw new Error(
        "FORMAT TIDAK VALID: Planner mengembalikan steps tanpa field 'tool'. " +
        "Setiap step WAJIB punya field 'tool' berisi nama tool yang valid. " +
        "Contoh valid: { \"type\": \"plan\", \"steps\": [{ \"action\": \"tool\", \"tool\": \"doctor-tool\", \"input\": {} }] }"
      );
    }
    // Steps ada tapi tidak ada action — coba proses sebagai multi-tool
    console.warn("[Validator] Auto-fix: steps tanpa wrapper action/type, proses sebagai multi-tool");
    return normalizePlannerDecision({ action: "multi-tool", steps: rawDecision.steps, summary: rawDecision.summary });
  }

  throw new Error(
    "Planner output tidak valid. Format yang diterima:\n" +
    '  - { "action": "respond", "response": "..." }\n' +
    '  - { "action": "skill", "skill_name": "nama-skill", "input": {} }\n' +
    '  - { "action": "tool", "tool_name": "nama-tool", "input": {} }\n' +
    '  - { "action": "multi-tool", "steps": [{ "action": "tool", "tool": "...", "input": {} }] }\n' +
    '  - { "type": "plan", "steps": [{ "action": "tool", "tool": "...", "input": {} }] }\n' +
    `Diterima: ${JSON.stringify(rawDecision).slice(0, 200)}`
  );
}

module.exports = {
  requireFields,
  validateToolContract,
  validateStep,
  normalizeStep,
  normalizePlannerDecision,
  applyPlannerSuccessRespondPolicy,
};
