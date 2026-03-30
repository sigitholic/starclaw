"use strict";

/**
 * Pencocokan deterministik user message → skill (sebelum / menggantikan tool dari LLM).
 * Alur wajib: User → Skill → Tool (bukan User → Tool).
 */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractIP(text) {
  const match = String(text || "").match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  return match ? match[0] : null;
}

function fallbackToSkill() {
  return {
    action: "skill",
    skill_name: "check-system-health",
    input: {},
    summary: "Fallback skill-first — intent tidak jelas atau tool langsung dilarang",
  };
}

/** Tool yang tidak boleh dipilih langsung oleh planner (hanya lewat skill). */
const FORBIDDEN_DIRECT_TOOLS = ["shell-tool"];

/**
 * Paksa rencana ke skill jika LLM memilih tool terlarang (mis. shell-tool).
 * @param {object} rawPlan - output mentah dari LLM (belum normalize)
 * @param {string} userMessage
 * @param {{ has?: (name: string) => boolean } | null} skillRegistry
 * @returns {object} raw decision untuk normalizePlannerDecision
 */
function coerceForbiddenToolsToSkill(rawPlan, userMessage, skillRegistry) {
  if (!rawPlan || !skillRegistry) return rawPlan;

  const toolFromSingle =
    rawPlan.action === "tool"
      ? rawPlan.tool_name || rawPlan.tool
      : null;
  const steps = Array.isArray(rawPlan.steps) ? rawPlan.steps : [];
  const usesForbidden =
    (toolFromSingle && FORBIDDEN_DIRECT_TOOLS.includes(toolFromSingle)) ||
    steps.some(s => {
      const name = s.tool || s.tool_name;
      const isSkill = s.action === "skill" || s.skill || s.skill_name;
      return name && !isSkill && FORBIDDEN_DIRECT_TOOLS.includes(name);
    });
  if (!usesForbidden) return rawPlan;

  const intent = detectSkill(userMessage);
  if (intent && skillRegistry.has(intent.skill)) {
    return {
      action: "skill",
      skill_name: intent.skill,
      input: intent.input,
      summary: intent.skill === "run-system-command"
        ? `Ping ${intent.input.target || "host"} (skill-first, mengganti ${FORBIDDEN_DIRECT_TOOLS.join("/")})`
        : "Memeriksa kesehatan sistem (skill-first)",
    };
  }
  if (skillRegistry.has("check-system-health")) {
    return fallbackToSkill();
  }
  return rawPlan;
}

/**
 * Deteksi skill dari teks (normalisasi + toleransi typo ringan).
 * @returns {{ skill: string, input: object } | null}
 */
function detectSkill(text) {
  const t = normalize(text);
  if (!t) return null;

  if (t.includes("ping")) {
    return {
      skill: "run-system-command",
      input: { target: extractIP(text) || "127.0.0.1" },
    };
  }

  if (
    t.includes("cek") ||
    t.includes("status") ||
    t.includes("kondisi") ||
    t.includes("crk")
  ) {
    return {
      skill: "check-system-health",
      input: {},
    };
  }

  return null;
}

/**
 * @param {string} message
 * @param {{ has?: (name: string) => boolean } | null} skillRegistry
 * @returns {object | null} raw decision untuk normalizePlannerDecision, atau null
 */
function matchIntentToSkill(message, skillRegistry) {
  if (!skillRegistry || typeof skillRegistry.has !== "function" || typeof message !== "string") {
    return null;
  }
  const m = message.trim();
  if (!m) return null;

  const intent = detectSkill(m);
  if (!intent || !skillRegistry.has(intent.skill)) {
    return null;
  }

  const summary =
    intent.skill === "run-system-command"
      ? `Ping ${intent.input.target || "host"} melalui skill run-system-command`
      : "Memeriksa kesehatan sistem melalui skill check-system-health";

  return {
    action: "skill",
    skill_name: intent.skill,
    input: intent.input,
    summary,
  };
}

module.exports = {
  normalize,
  extractIP,
  detectSkill,
  fallbackToSkill,
  matchIntentToSkill,
  FORBIDDEN_DIRECT_TOOLS,
  coerceForbiddenToolsToSkill,
};
