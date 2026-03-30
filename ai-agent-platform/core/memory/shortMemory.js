"use strict";

/**
 * Memori sesi ringkas — key-value per session (in-memory).
 * Hanya menyimpan fakta penting (mis. target ping terakhir), tanpa menimpa key lain saat patch parsial.
 */

/** @type {Map<string, Record<string, unknown>>} */
const sessions = new Map();

function safeSessionId(id) {
  const s = id != null && String(id).trim() !== "" ? String(id).trim() : "default";
  return s.slice(0, 256);
}

/**
 * @param {string} sessionId
 * @returns {Record<string, unknown>}
 */
function getSession(sessionId) {
  const sid = safeSessionId(sessionId);
  if (!sessions.has(sid)) {
    sessions.set(sid, {});
  }
  return sessions.get(sid);
}

/**
 * Gabungkan field ke memori sesi — hanya key yang diberikan yang diubah.
 * @param {string} sessionId
 * @param {Record<string, unknown>} partial
 */
function patchSession(sessionId, partial) {
  if (!partial || typeof partial !== "object") return getSession(sessionId);
  const s = getSession(sessionId);
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) {
      delete s[k];
    } else {
      s[k] = v;
    }
  }
  return s;
}

/**
 * Salinan dangkal untuk dibaca planner (imutabilitas eksternal).
 * @param {string} sessionId
 */
function getSessionSnapshot(sessionId) {
  return { ...getSession(sessionId) };
}

/**
 * Baca satu key atau seluruh snapshot sesi (untuk planner rule-based).
 * @param {string} sessionId
 * @param {string} [key] - jika diisi, kembalikan nilai key tersebut
 */
function get(sessionId, key) {
  const snap = getSessionSnapshot(sessionId);
  if (key != null && String(key).trim() !== "") {
    return snap[String(key)];
  }
  return snap;
}

/**
 * Salinan semua sesi untuk debug (jangan mutasi langsung).
 */
function getStoreSnapshot() {
  const out = {};
  for (const [sid, data] of sessions.entries()) {
    out[sid] = { ...data };
  }
  return out;
}

function clearSession(sessionId) {
  sessions.delete(safeSessionId(sessionId));
}

/** Uji / debug */
function _sessionCount() {
  return sessions.size;
}

/** API ringkas untuk planner/debug: memory.get(sessionId, key?), memory.store */
const memory = {
  get,
  get store() {
    return getStoreSnapshot();
  },
};

module.exports = {
  getSession,
  patchSession,
  getSessionSnapshot,
  get,
  getStoreSnapshot,
  memory,
  clearSession,
  _sessionCount,
};
