"use strict";

const fs = require("fs");
const path = require("path");

/**
 * SOUL System — Persistent agent identity ala OpenClaw SOUL.md.
 *
 * SOUL adalah file konfigurasi yang mendefinisikan identitas, peran,
 * kepribadian, dan batasan agent secara persisten (survive restart).
 *
 * File soul disimpan di:
 *   soul/<agent-name>.soul.md   — soul per-agent
 *   soul/DEFAULT.soul.md        — soul default (fallback)
 *
 * Format SOUL.md:
 *   # Agent Name
 *   ## Role
 *   ## Personality
 *   ## Skills
 *   ## Constraints
 *   ## Memory
 */

const SOUL_DIR = path.resolve(process.cwd(), "soul");
const SOUL_CACHE = new Map();

function loadSoulFile(agentName) {
  const cacheKey = agentName || "DEFAULT";
  if (SOUL_CACHE.has(cacheKey)) return SOUL_CACHE.get(cacheKey);

  const candidates = [
    path.join(SOUL_DIR, `${agentName}.soul.md`),
    path.join(SOUL_DIR, "DEFAULT.soul.md"),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        SOUL_CACHE.set(cacheKey, content);
        return content;
      } catch (_) {}
    }
  }
  return null;
}

/**
 * Bangun system prompt dari SOUL file.
 * Menggabungkan SOUL dengan role default jika ada.
 *
 * @param {string} agentName - Nama agent
 * @param {string} defaultRole - Role default jika SOUL tidak ada
 * @returns {string} - System prompt yang sudah digabung
 */
function buildAgentRole(agentName, defaultRole = "") {
  const soul = loadSoulFile(agentName);
  if (soul) {
    return `[SOUL — Identitas & Kepribadian Agent]\n${soul.trim()}\n\n${defaultRole}`.trim();
  }
  return defaultRole;
}

/**
 * Invalidate cache (dipanggil saat SOUL file diupdate).
 */
function invalidateSoulCache(agentName) {
  SOUL_CACHE.delete(agentName || "DEFAULT");
}

/**
 * List semua SOUL file yang ada.
 */
function listSouls() {
  if (!fs.existsSync(SOUL_DIR)) return [];
  return fs.readdirSync(SOUL_DIR)
    .filter(f => f.endsWith(".soul.md"))
    .map(f => f.replace(".soul.md", ""));
}

module.exports = { buildAgentRole, loadSoulFile, invalidateSoulCache, listSouls };
