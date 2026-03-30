"use strict";

const { normalizeToolResult } = require("../core/llm/modelRouter");

/**
 * Kontrak keluaran skill ke user: ringkasan manusiawi + detail terstruktur (bukan JSON mentah).
 * @param {boolean} success
 * @param {string} summary
 * @param {Record<string, string|number|boolean|null>} [detail]
 */
function skillEnvelope(success, summary, detail = {}) {
  const d = detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
  const clean = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    clean[k] = v;
  }
  return {
    success: Boolean(success),
    summary: String(summary || "").trim() || (success ? "Selesai" : "Gagal"),
    detail: clean,
  };
}

function shortValue(v, maxLen = 200) {
  if (v == null) return "—";
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `${v.length} item`;
  if (typeof v === "object") return "lihat ringkasan";
  return String(v);
}

/**
 * Satu baris ringkas dari hasil tool yang sudah dinormalisasi (tanpa mengekspos struktur internal mentah).
 */
function lineFromNormalized(n) {
  if (!n || typeof n !== "object") return "Tidak ada data";
  if (n.success === false) {
    return n.message || n.error || "Gagal";
  }
  const p = n.data !== undefined ? n.data : n;
  if (p && typeof p === "object") {
    if (Array.isArray(p.results)) {
      return `${p.results.length} hasil pencarian`;
    }
    if (p.message != null && String(p.message).trim()) return shortValue(p.message, 120);
    if (p.stdout != null || p.stderr != null) {
      const out = [p.stdout && `stdout: ${shortValue(p.stdout, 80)}`, p.stderr && `stderr: ${shortValue(p.stderr, 60)}`]
        .filter(Boolean)
        .join(" · ");
      return out || "Perintah selesai";
    }
    if (p.url != null) return `${p.method || "GET"} ${shortValue(p.url, 100)}`;
    if (Array.isArray(p.files)) return `${p.files.length} entri di direktori`;
    if (p.content != null && typeof p.content === "string") return `Isi file (${p.content.length} karakter)`;
    if (p.verdict != null) return shortValue(p.verdict, 150);
    if (p.ok != null) return p.note ? shortValue(p.note, 120) : "Permintaan HTTP selesai";
  }
  return "Berhasil";
}

/**
 * Interpretasi payload tool mentah (biasanya n.data atau objek tanpa success) → detail untuk user.
 */
function interpretPayload(payload) {
  if (payload == null) {
    return { summary: "Tidak ada data", detail: {} };
  }
  if (typeof payload !== "object" || Array.isArray(payload)) {
    return { summary: shortValue(payload, 300), detail: { Nilai: shortValue(payload, 300) } };
  }

  const detail = {};

  if (payload.error != null) {
    detail.Alasan = shortValue(payload.error, 300);
    return { summary: `Gagal: ${detail.Alasan}`, detail };
  }

  if (payload.stdout != null || payload.stderr != null || payload.error != null) {
    if (payload.stdout) detail.Output = shortValue(payload.stdout, 400);
    if (payload.stderr) detail.Stderr = shortValue(payload.stderr, 200);
    if (payload.error) detail.Error = shortValue(payload.error, 200);
    const ok = !payload.error;
    return {
      summary: ok ? "Perintah shell selesai" : "Perintah shell mengembalikan error",
      detail,
    };
  }

  if (Array.isArray(payload.results)) {
    detail.Jumlah = String(payload.results.length);
    detail.Cuplikan = payload.results
      .slice(0, 3)
      .map((r) => shortValue(r, 120))
      .join(" · ");
    return {
      summary: `${payload.results.length} hasil pencarian ditemukan`,
      detail,
    };
  }

  if (payload.method != null || payload.url != null) {
    detail.Metode = String(payload.method || "GET");
    detail.URL = String(payload.url || "—");
    if (payload.note) detail.Catatan = shortValue(payload.note, 200);
    if (payload.status != null) detail.Status = String(payload.status);
    return {
      summary: `Permintaan ${detail.Metode} selesai`,
      detail,
    };
  }

  if (Array.isArray(payload.files)) {
    detail.Jumlah = String(payload.files.length);
    detail.Sampel = payload.files.slice(0, 8).join(", ") + (payload.files.length > 8 ? "…" : "");
    return { summary: `${payload.files.length} entri di folder`, detail };
  }

  if (payload.content != null && typeof payload.content === "string") {
    detail.Panjang = `${payload.content.length} karakter`;
    detail.Cuplikan = shortValue(payload.content, 280);
    return { summary: "File berhasil dibaca", detail };
  }

  if (payload.message != null && String(payload.message).trim()) {
    const msg = String(payload.message).trim();
    const first = msg.split("\n")[0];
    detail.Pesan = shortValue(msg, 400);
    return { summary: shortValue(first, 200), detail };
  }

  if (payload.verdict != undefined) {
    detail.Verdict = shortValue(payload.verdict, 300);
    if (payload.totalChecked != null) detail.Diperiksa = String(payload.totalChecked);
    if (payload.healthy != null) detail.Sehat = String(payload.healthy);
    if (payload.broken != null) detail.Rusak = String(payload.broken);
    return { summary: shortValue(payload.verdict, 200), detail };
  }

  if (payload.report && typeof payload.report === "object") {
    const r = payload.report;
    detail.Status = r.verdict || "—";
    if (r.nodeVersion) detail.Node = String(r.nodeVersion);
    if (r.uptime) detail.Uptime = String(r.uptime);
    return { summary: shortValue(r.verdict || "Diagnosis selesai", 200), detail };
  }

  const keys = Object.keys(payload).filter((k) => !["success", "__context"].includes(k));
  if (keys.length === 0) {
    return { summary: "Selesai", detail: {} };
  }
  for (const k of keys.slice(0, 12)) {
    const val = payload[k];
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      detail[k] = `${Object.keys(val).length} field`;
    } else {
      detail[k] = shortValue(val, 160);
    }
  }
  return {
    summary: `Berhasil (${keys.length} bidang)`,
    detail,
  };
}

/**
 * Dari normalizeToolResult(raw) → envelope skill { success, summary, detail }.
 */
function fromNormalizedTool(normalized) {
  if (!normalized || typeof normalized !== "object") {
    return skillEnvelope(false, "Hasil tidak valid", { Alasan: "Objek tidak dikenali" });
  }
  if (normalized.success === false) {
    const why = normalized.message || normalized.error || "Operasi gagal";
    return skillEnvelope(false, why, { Alasan: shortValue(why, 300) });
  }

  const payload = normalized.data !== undefined ? normalized.data : normalized;
  const { summary, detail } = interpretPayload(payload);
  return skillEnvelope(true, summary, detail);
}

/**
 * Gabungan beberapa hasil tool (sudah dinormalisasi) → satu envelope.
 */
function mergeToolLines(labelPairs) {
  const detail = {};
  const parts = [];
  for (const { key, normalized } of labelPairs) {
    const line = lineFromNormalized(normalized);
    detail[key] = line;
    parts.push(`${key}: ${line}`);
  }
  return skillEnvelope(
    labelPairs.every(({ normalized }) => normalized && normalized.success !== false),
    parts.join(" · ") || "Selesai",
    detail
  );
}

module.exports = {
  skillEnvelope,
  normalizeToolResult,
  fromNormalizedTool,
  mergeToolLines,
  lineFromNormalized,
  interpretPayload,
  shortValue,
};
