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

  throw new Error("Planner output tidak valid: gunakan action respond/tool atau format plan legacy");
}

module.exports = {
  requireFields,
  validateToolContract,
  normalizePlannerDecision,
};
