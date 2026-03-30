"use strict";

/**
 * Session Store — persist short memory antar restart.
 *
 * Menyimpan state percakapan per agent ke:
 *   data/memory/sessions/<agent-name>.json
 *
 * Yang disimpan:
 *   - interactions: 10 terakhir (bukan semua, hemat disk)
 *   - summary: ringkasan history lama
 *   - savedAt: timestamp
 *
 * Auto-load saat agent init, auto-save saat remember().
 */

const fs = require("fs");
const path = require("path");

const SESSIONS_DIR = path.join(process.cwd(), "data", "memory", "sessions");

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function sessionPath(agentName) {
  // Sanitasi nama file
  const safe = String(agentName).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SESSIONS_DIR, `${safe}.json`);
}

function loadSession(agentName) {
  ensureDir();
  const filePath = sessionPath(agentName);
  try {
    if (!fs.existsSync(filePath)) return { interactions: [], summary: "" };
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return {
      interactions: Array.isArray(data.interactions) ? data.interactions : [],
      summary: typeof data.summary === "string" ? data.summary : "",
    };
  } catch (_) {
    return { interactions: [], summary: "" };
  }
}

function saveSession(agentName, interactions, summary) {
  ensureDir();
  const filePath = sessionPath(agentName);
  // Hanya simpan 10 interaksi terakhir (hemat disk, cukup untuk konteks)
  const toSave = {
    agentName,
    interactions: interactions.slice(-10),
    summary: typeof summary === "string" ? summary.slice(0, 1500) : "",
    savedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2), "utf-8");
  } catch (err) {
    console.warn(`[SessionStore] Gagal simpan session '${agentName}': ${err.message}`);
  }
}

function deleteSession(agentName) {
  const filePath = sessionPath(agentName);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function listSessions() {
  ensureDir();
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"));
          return {
            agent: data.agentName || f.replace(".json", ""),
            interactions: (data.interactions || []).length,
            savedAt: data.savedAt || null,
          };
        } catch (_) {
          return { agent: f.replace(".json", ""), interactions: 0, savedAt: null };
        }
      });
  } catch (_) {
    return [];
  }
}

module.exports = { loadSession, saveSession, deleteSession, listSessions, sessionPath };
