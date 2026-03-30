"use strict";

/**
 * Pencocokan deterministik user message → skill (sebelum LLM).
 * Skill = tugas tingkat pengguna; tools hanya fallback bila tidak ada skill.
 */

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

  // ping <host> → run-system-command (bukan shell-tool langsung)
  const pingMatch = m.match(/^\s*ping\s+(\S+)/i);
  if (pingMatch && skillRegistry.has("run-system-command")) {
    return {
      action: "skill",
      skill_name: "run-system-command",
      input: { target: pingMatch[1] },
      summary: `Ping ${pingMatch[1]} melalui skill run-system-command`,
    };
  }

  // "cek status" / status sistem → check-system-health
  if (
    /(?:^|\b)(?:cek|periksa|check)\s+status\b|status\s+(?:sistem|platform|kesehatan|server)/i.test(m) &&
    skillRegistry.has("check-system-health")
  ) {
    return {
      action: "skill",
      skill_name: "check-system-health",
      input: {},
      summary: "Memeriksa kesehatan sistem melalui skill check-system-health",
    };
  }

  return null;
}

module.exports = { matchIntentToSkill };
