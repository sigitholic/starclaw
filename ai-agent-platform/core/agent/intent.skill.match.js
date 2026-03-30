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
 * Ucapan lanjutan yang mengisyaratkan memakai konteks sebelumnya (mis. target ping).
 * Sengaja tidak memakai /\blagi\b/ global — hindari salah positif ("halo lagi").
 */
function isFollowUpIntent(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return false;
  if (/^\s*(lagi|ulang)\s*[!.?…]*\s*$/i.test(t)) return true;
  if (/\bping\s+(lagi|ulang)\b/.test(t)) return true;
  if (/\b(lagi|ulang)\s+ping\b/.test(t)) return true;
  if (/\bcoba\s+lagi\b/.test(t)) return true;
  if (/yang\s+tadi/.test(t)) return true;
  if (/yang\s+sama/.test(t)) return true;
  if (/sekali\s+lagi/.test(t)) return true;
  if (/\bsama\s+itu\b/.test(t)) return true;
  if (/\brepeat\b/.test(t)) return true;
  return false;
}

/**
 * @param {string} userInput
 * @param {Record<string, unknown> | null} shortMemory - snapshot memori sesi (mis. lastPingTarget)
 * @returns {{ type: "skill"|"chat", skill?: string, input?: object, message?: string }}
 */
function plan(userInput, shortMemory = null) {
  const msg = typeof userInput === "string" ? userInput : "";
  const text = msg.toLowerCase();
  const mem = shortMemory && typeof shortMemory === "object" ? shortMemory : {};
  const lastPing =
    typeof mem.lastPingTarget === "string" && mem.lastPingTarget.trim()
      ? mem.lastPingTarget.trim()
      : null;

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

  // PRIORITY 1: PING (+ reuse target dari memori sesi untuk follow-up)
  if (text.includes("ping")) {
    const ip = extractIP(userInput);
    if (isFollowUpIntent(text) && !ip && lastPing) {
      return {
        type: "skill",
        skill: "run-system-command",
        input: { target: lastPing },
      };
    }
    return {
      type: "skill",
      skill: "run-system-command",
      input: {
        target: ip || "127.0.0.1",
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

  // Follow-up singkat (mis. "lagi", "yang tadi") → ulangi ping ke target terakhir dari memori sesi
  if (isFollowUpIntent(text) && lastPing) {
    return {
      type: "skill",
      skill: "run-system-command",
      input: { target: lastPing },
    };
  }

  return { type: "chat", message: msg };
}

/** Alias kecil untuk kode yang sudah memakai nama lama. */
const planUserIntent = plan;

/**
 * Satu titik masuk planner rule-based: input → skill atau respons teks (tanpa LLM).
 * @param {string} userInput
 * @param {Record<string, unknown> | { get?: (sid: string, key?: string) => unknown }} sessionMemory
 *   snapshot sesi atau API memori dengan `get(sessionId, key?)`
 * @param {string} [sessionId]
 * @returns {{ plannerDecision: "skill"|"tool"|"respond", raw: object, intent: object }}
 */
function newPlanner(userInput, sessionMemory, sessionId, extra = {}) {
  const sid =
    sessionId != null && String(sessionId).trim() !== ""
      ? String(sessionId).trim()
      : "default";
  let mem = {};
  if (sessionMemory && typeof sessionMemory.get === "function") {
    const got = sessionMemory.get(sid);
    mem = got && typeof got === "object" ? got : {};
  } else if (sessionMemory && typeof sessionMemory === "object") {
    mem = sessionMemory;
  }

  const msg = typeof userInput === "string" ? userInput : "";
  const snap =
    extra && extra.openclawSnapshot && typeof extra.openclawSnapshot === "object"
      ? extra.openclawSnapshot
      : null;
  const wantsOpenClawAudit =
    (snap && Object.keys(snap).length > 0) ||
    /audit|openclaw|architecture|arsitektur|gap|map\s/i.test(msg);
  if (wantsOpenClawAudit) {
    return {
      plannerDecision: "tool",
      intent: { type: "tool", tool: "openclaw-gap-analyzer-tool" },
      raw: {
        action: "tool",
        tool_name: "openclaw-gap-analyzer-tool",
        input: { openclawSnapshot: snap || {} },
        summary: "Analisis gap OpenClaw / arsitektur (rule-based)",
      },
    };
  }

  const intent = plan(userInput, mem);
  if (intent.type === "skill" && intent.skill) {
    return {
      plannerDecision: "skill",
      intent,
      raw: {
        action: "skill",
        skill_name: intent.skill,
        input: intent.input || {},
        summary:
          intent.skill === "run-system-command"
            ? `Ping ${(intent.input && intent.input.target) || "host"} melalui skill run-system-command`
            : intent.skill === "check-server-resource"
              ? "Memeriksa resource server melalui skill check-server-resource"
              : "Memeriksa kesehatan sistem melalui skill check-system-health",
      },
    };
  }
  const chatText = typeof intent.message === "string" ? intent.message : String(userInput || "");
  return {
    plannerDecision: "respond",
    intent,
    raw: {
      action: "respond",
      message: chatText,
      response: chatText,
      summary: "Percakapan (rule-based, bukan skill)",
    },
  };
}

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
function coerceForbiddenToolsToSkill(rawPlan, userMessage, skillRegistry, shortMemory = null) {
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

  const intent = plan(userMessage, shortMemory);
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
function matchIntentToSkill(message, skillRegistry, shortMemory = null) {
  if (!skillRegistry || typeof skillRegistry.has !== "function" || typeof message !== "string") {
    return null;
  }
  const m = message.trim();
  if (!m) return null;

  const intent = plan(m, shortMemory);
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
  isFollowUpIntent,
  plan,
  planUserIntent,
  newPlanner,
  matchIntentToSkill,
  FORBIDDEN_DIRECT_TOOLS,
  coerceForbiddenToolsToSkill,
};
