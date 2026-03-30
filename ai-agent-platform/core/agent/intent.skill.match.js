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

/**
 * Salam percakapan — prioritas di atas command lemah (hanya jika bukan perintah).
 * @param {string} text
 * @returns {boolean}
 */
function isGreeting(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("halo") ||
    t.includes("hai") ||
    t.includes("pagi") ||
    t.includes("siang") ||
    t.includes("malam")
  );
}

/**
 * Hanya kata kerja aksi — bukan kata kunci domain (cpu/server) itu di detectSkill.
 * @param {string} text
 * @returns {boolean}
 */
function isCommand(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("cek") ||
    t.includes("ping") ||
    t.includes("monitor") ||
    t.includes("ambil") ||
    t.includes("tampilkan")
  );
}

/**
 * @param {string} userInput
 * @returns {{ type: "skill"|"chat", skill?: string, input?: object, message?: string }}
 */
function planUserIntent(userInput) {
  const msg = typeof userInput === "string" ? userInput : "";
  // 1) salam → chat, kecuali ada kata perintah eksplisit (mis. "halo cek cpu")
  if (isGreeting(msg) && !isCommand(msg)) {
    return { type: "chat", message: msg };
  }
  // 2) bukan perintah → chat
  if (!isCommand(msg)) {
    return { type: "chat", message: msg };
  }
  const intent = detectSkill(msg);
  if (intent) {
    return {
      type: "skill",
      skill: intent.skill,
      input: intent.input,
    };
  }
  return { type: "chat", message: msg };
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
 * Deteksi skill dari teks (normalisasi + toleransi typo ringan).
 * Hanya dipanggil dari jalur command (isCommand).
 * Prioritas: resource → platform → ping → fallback status umum.
 * @returns {{ skill: string, input: object } | null}
 */
function detectSkill(text) {
  const t = normalize(text);
  if (!t) return null;

  const resourceIntent =
    t.includes("cpu") ||
    t.includes("ram") ||
    t.includes("memory") ||
    t.includes("server") ||
    t.includes("srv");

  if (resourceIntent) {
    return {
      skill: "check-server-resource",
      input: {},
    };
  }

  if (t.includes("platform")) {
    return {
      skill: "check-system-health",
      input: {},
    };
  }

  if (t.includes("ping")) {
    return {
      skill: "run-system-command",
      input: { target: extractIP(text) || "127.0.0.1" },
    };
  }

  if (
    t.includes("monitor") ||
    (t.includes("tampilkan") && (t.includes("cek") || t.includes("crk") || t.includes("periksa")))
  ) {
    return {
      skill: "check-system-health",
      input: {},
    };
  }

  if (
    t.includes("cek") ||
    t.includes("status") ||
    t.includes("kondisi") ||
    t.includes("crk") ||
    t.includes("tampilkan")
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

  if (isGreeting(m) && !isCommand(m)) return null;
  if (!isCommand(m)) return null;

  const intent = detectSkill(m);
  if (!intent || !skillRegistry.has(intent.skill)) {
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
  isGreeting,
  isCommand,
  planUserIntent,
  detectSkill,
  matchIntentToSkill,
  FORBIDDEN_DIRECT_TOOLS,
  coerceForbiddenToolsToSkill,
};
