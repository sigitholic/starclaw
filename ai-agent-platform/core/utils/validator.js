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

function normalizePlannerDecision(rawDecision) {
  if (!isPlainObject(rawDecision)) {
    throw new Error("Planner output harus object JSON");
  }

  if (Array.isArray(rawDecision.steps)) {
    return {
      steps: rawDecision.steps,
      summary: rawDecision.summary || "Planner menghasilkan langkah eksekusi",
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps: Array.isArray(rawDecision.gaps) ? rawDecision.gaps : [],
      recommendations: Array.isArray(rawDecision.recommendations) ? rawDecision.recommendations : [],
      finalResponse: typeof rawDecision.finalResponse === "string" ? rawDecision.finalResponse : null,
      plannerDecision: "legacy-plan",
    };
  }

  if (rawDecision.action === "respond") {
    return {
      steps: [],
      summary: rawDecision.summary || "Planner memutuskan respon langsung",
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps: [],
      recommendations: [],
      finalResponse: rawDecision.response || "Planner tidak memberikan respon tekstual",
      plannerDecision: "respond",
    };
  }

  if (rawDecision.action === "tool") {
    if (typeof rawDecision.tool_name !== "string" || rawDecision.tool_name.trim() === "") {
      throw new Error("Planner action=tool wajib punya tool_name");
    }
    const gaps = Array.isArray(rawDecision.gaps) ? rawDecision.gaps : [];
    const recommendations = Array.isArray(rawDecision.recommendations) ? rawDecision.recommendations : [];
    return {
      steps: [
        {
          name: rawDecision.step_name || `run-${rawDecision.tool_name}`,
          tool: rawDecision.tool_name,
          input: rawDecision.input || {},
          timeoutMs: rawDecision.timeoutMs,
          maxRetries: rawDecision.maxRetries,
        },
      ],
      summary: rawDecision.summary || `Planner memutuskan memanggil tool ${rawDecision.tool_name}`,
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps,
      recommendations,
      finalResponse: typeof rawDecision.response === "string" ? rawDecision.response : null,
      plannerDecision: "tool",
    };
  }

  // Optimasi 2: Multi-step planning — LLM bisa merencanakan beberapa tool sekaligus
  if (rawDecision.action === "multi-tool") {
    if (!Array.isArray(rawDecision.steps) || rawDecision.steps.length === 0) {
      throw new Error("Planner action=multi-tool wajib punya array steps yang tidak kosong");
    }
    const normalizedSteps = rawDecision.steps.map((s, idx) => {
      if (!s.tool_name && !s.tool) {
        throw new Error(`Step #${idx + 1} di multi-tool wajib punya tool_name atau tool`);
      }
      return {
        name: s.step_name || s.name || `step-${idx + 1}`,
        tool: s.tool_name || s.tool,
        input: s.input || {},
        timeoutMs: s.timeoutMs,
        maxRetries: s.maxRetries,
      };
    });
    return {
      steps: normalizedSteps,
      summary: rawDecision.summary || `Planner merencanakan ${normalizedSteps.length} langkah sekaligus`,
      baseScore: typeof rawDecision.baseScore === "number" ? rawDecision.baseScore : 0,
      gaps: Array.isArray(rawDecision.gaps) ? rawDecision.gaps : [],
      recommendations: Array.isArray(rawDecision.recommendations) ? rawDecision.recommendations : [],
      finalResponse: typeof rawDecision.response === "string" ? rawDecision.response : null,
      plannerDecision: "tool",  // Executor memperlakukan sama seperti "tool" — sequential
    };
  }
  // ===== Fallback Heuristik =====
  // LLM kadang mengembalikan nama tool di field 'action' (misal: action="cron-tool")
  // Deteksi pattern ini dan konversi otomatis ke format yang benar
  if (typeof rawDecision.action === "string" 
      && rawDecision.action !== "respond" 
      && rawDecision.action !== "tool" 
      && rawDecision.action !== "multi-tool") {
    
    // Cek apakah action terlihat seperti nama tool (mengandung huruf/dash, bukan kalimat panjang)
    const looksLikeToolName = /^[a-z0-9_-]+$/i.test(rawDecision.action) && rawDecision.action.length < 50;
    
    if (looksLikeToolName) {
      console.log(`[Validator] Auto-fix: action="${rawDecision.action}" → konversi ke action="tool", tool_name="${rawDecision.action}"`);
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

  throw new Error("Planner output tidak valid: gunakan action respond/tool/multi-tool atau format plan legacy");
}

module.exports = {
  requireFields,
  validateToolContract,
  normalizePlannerDecision,
};
