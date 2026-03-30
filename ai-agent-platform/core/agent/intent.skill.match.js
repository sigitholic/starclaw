"use strict";

/**
 * Planner deterministik: user message → chat atau skill (satu keputusan, urutan pertama menang).
 * CHAT vs SKILL dipisah jelas; tidak ada fallback ke skill dari percakapan.
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

/**
 * @param {string} userInput
 * @returns {{ type: "skill"|"chat", skill?: string, input?: object, message?: string }}
 */
function plan(userInput) {
  const msg = typeof userInput === "string" ? userInput : "";
  const text = msg.toLowerCase();

  // GREETING → CHAT (pertama)
  if (
    text.includes("halo") ||
    text.includes("hai") ||
    text.includes("pagi") ||
    text.includes("siang") ||
    text.includes("malam")
  ) {
    return { type: "chat", message: msg };
  }

  // PRIORITY 1: PING
  if (text.includes("ping")) {
    return {
      type: "skill",
      skill: "run-system-command",
      input: {
        target: extractIP(userInput) || "127.0.0.1",
      },
    };
  }

  // PRIORITY 2: CPU / RESOURCE
  if (text.includes("cpu") || text.includes("ram") || text.includes("memory")) {
    return {
      type: "skill",
      skill: "check-server-resource",
      input: {},
    };
  }

  // PRIORITY 3: PLATFORM
  if (text.includes("platform")) {
    return {
      type: "skill",
      skill: "check-system-health",
      input: {},
    };
  }

  // PRIORITY 4: SERVER (GENERIC)
  if (text.includes("server")) {
    return {
      type: "skill",
      skill: "check-server-resource",
      input: {},
    };
  }

  return { type: "chat", message: msg };
}

/** Alias kecil untuk kode yang sudah memakai nama lama. */
const planUserIntent = plan;

/** Tool yang tidak boleh dipilih langsung oleh planner (hanya lewat skill). */
const FORBIDDEN_DIRECT_TOOLS = ["shell-tool"];

/**
 * Paksa rencana ke skill jika LLM memilih tool terlarang (mis. shell-tool).
 * Hanya memetakan jika plan() sendiri mengarah ke skill yang sama; tidak ada fallback ke skill dari chat.
 * @param {object} rawPlan - output mentah dari LLM (belum normalize)
 * @param {string} userMessage
 * @param {{ has?: (name: string) => boolean } | null} skillRegistry
 * @returns {object} raw decision untuk normalizePlannerDecision
 */
function coerceForbiddenToolsToSkill(rawPlan, userMessage, skillRegistry) {
  if (!rawPlan || !skillRegistry) return rawPlan;

  const toolFromSingle =
    rawPlan.action === "tool" ? rawPlan.tool_name || rawPlan.tool : null;
  const steps = Array.isArray(rawPlan.steps) ? rawPlan.steps : [];
  const usesForbidden =
    (toolFromSingle && FORBIDDEN_DIRECT_TOOLS.includes(toolFromSingle)) ||
    steps.some(s => {
      const name = s.tool || s.tool_name;
      const isSkill = s.action === "skill" || s.skill || s.skill_name;
      return name && !isSkill && FORBIDDEN_DIRECT_TOOLS.includes(name);
    });
  if (!usesForbidden) return rawPlan;

  const intent = plan(userMessage);
  if (
    intent.type === "skill" &&
    intent.skill &&
    skillRegistry.has(intent.skill)
  ) {
    return {
      action: "skill",
      skill_name: intent.skill,
      input: intent.input,
      summary:
        intent.skill === "run-system-command"
          ? `Ping ${intent.input.target || "host"} (skill-first, mengganti ${FORBIDDEN_DIRECT_TOOLS.join("/")})`
          : intent.skill === "check-server-resource"
            ? "Memeriksa resource server (skill-first)"
            : "Memeriksa kesehatan sistem (skill-first)",
    };
  }
  return {
    action: "respond",
    message: userMessage,
    summary: "Tidak dapat memetakan ke skill; jawab sebagai percakapan",
  };
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

  const intent = plan(m);
  if (intent.type !== "skill" || !intent.skill) {
    return null;
  }
  if (!skillRegistry.has(intent.skill)) {
    return null;
  }

  let summary;
  if (intent.skill === "run-system-command") {
    summary = `Ping ${intent.input.target || "host"} melalui skill run-system-command`;
  } else if (intent.skill === "check-server-resource") {
    summary = "Memeriksa resource server melalui skill check-server-resource";
  } else {
    summary = "Memeriksa kesehatan sistem melalui skill check-system-health";
  }

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
  plan,
  planUserIntent,
  matchIntentToSkill,
  FORBIDDEN_DIRECT_TOOLS,
  coerceForbiddenToolsToSkill,
};
