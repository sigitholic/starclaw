"use strict";

/**
 * Response Formatter — Format semua respons agent ke struktur standar.
 *
 * Format standar:
 *   [STATUS]    ✅ / ❌ / ⚠️
 *   [RINGKASAN] 1-2 kalimat
 *   [DETAIL]    poin-poin
 *   [AKSI]      langkah berikutnya
 *
 * Digunakan di:
 *   - Telegram channel (sebelum dikirim ke user)
 *   - API response (opsional)
 *   - CLI output
 */

// ============================================================
// Status detector — baca konten untuk tentukan status
// ============================================================
function detectStatus(text) {
  if (!text) return "unknown";
  const lower = text.toLowerCase();
  // Sudah ada emoji status → jangan override
  if (text.includes("✅") || text.includes("❌") || text.includes("⚠️")) return "has-status";
  if (/error|gagal|fail|tidak bisa|tidak dapat|tidak ditemukan|tidak valid/i.test(lower)) return "error";
  if (/warning|peringatan|belum dikonfigurasi|belum diset|perlu|harus/i.test(lower)) return "warning";
  return "success";
}

const STATUS_EMOJI = {
  "success":    "✅",
  "error":      "❌",
  "warning":    "⚠️",
  "info":       "ℹ️",
  "running":    "⏳",
  "has-status": "",
  "unknown":    "ℹ️",
};

// ============================================================
// Structured formatter — buat format terstruktur
// ============================================================

/**
 * Format respons ke struktur standar.
 *
 * @param {object} options
 * @param {string} options.status     - "success"|"error"|"warning"|"info"|"running"
 * @param {string} options.title      - Judul/summary singkat (1 baris)
 * @param {string} [options.summary]  - Penjelasan 1-2 kalimat
 * @param {string[]} [options.details]- Array poin-poin detail
 * @param {string} [options.action]   - Aksi lanjutan yang bisa dilakukan user
 * @param {object} [options.raw]      - Data mentah (untuk debugging)
 */
function formatResponse({ status, title, summary, details = [], action, raw } = {}) {
  const emoji = STATUS_EMOJI[status] || STATUS_EMOJI["info"];
  const parts = [];

  // Status + title
  parts.push(`${emoji} ${title || "Selesai"}`);

  // Summary
  if (summary && summary.trim()) {
    parts.push(`\n📋 *Ringkasan:*\n${summary.trim()}`);
  }

  // Detail
  if (details && details.length > 0) {
    const detailLines = details
      .filter(d => d && String(d).trim())
      .map(d => `• ${String(d).trim()}`);
    if (detailLines.length > 0) {
      parts.push(`\n📌 *Detail:*\n${detailLines.join("\n")}`);
    }
  }

  // Aksi lanjutan
  if (action && action.trim()) {
    parts.push(`\n➡️ *Aksi:*\n${action.trim()}`);
  }

  return parts.join("\n");
}

// ============================================================
// Auto-formatter — deteksi dan format respons teks bebas
// ============================================================

/**
 * Cek apakah teks sudah dalam format standar (ada emoji status di awal).
 */
function isAlreadyFormatted(text) {
  if (!text) return false;
  return /^[✅❌⚠️ℹ️⏳🟢🔴🟡]/.test(text.trim());
}

/**
 * Format teks bebas menjadi format standar.
 * Digunakan sebagai fallback jika LLM tidak mengikuti format.
 */
function autoFormat(text, statusOverride) {
  if (!text || !text.trim()) return text;

  // Jika sudah terformat → kembalikan apa adanya
  if (isAlreadyFormatted(text)) return text;

  // Deteksi status
  const status = statusOverride || detectStatus(text);
  const emoji = STATUS_EMOJI[status] || STATUS_EMOJI["info"];

  // Pisahkan teks menjadi bagian-bagian
  const lines = text.trim().split("\n").filter(l => l.trim());

  if (lines.length === 0) return text;
  if (lines.length === 1) {
    // Teks singkat — tambahkan emoji saja
    return `${emoji} ${lines[0]}`;
  }

  // Teks multiline — ambil baris pertama sebagai title
  const title = lines[0];
  const rest = lines.slice(1);

  // Pisahkan menjadi detail poin (baris yang mulai dengan "-", "•", angka)
  const detailLines = rest.filter(l => /^[-•*\d]/.test(l.trim()) || l.trim().startsWith("-"));
  const paragraphLines = rest.filter(l => !/^[-•*\d]/.test(l.trim()) && !l.trim().startsWith("-"));

  const parts = [`${emoji} ${title}`];

  if (paragraphLines.length > 0) {
    const para = paragraphLines.join(" ").trim();
    if (para) parts.push(`\n📋 *Ringkasan:*\n${para}`);
  }

  if (detailLines.length > 0) {
    const formatted = detailLines.map(l => l.trim().startsWith("-") ? `•${l.slice(1)}` : l).join("\n");
    parts.push(`\n📌 *Detail:*\n${formatted}`);
  }

  return parts.join("\n");
}

// ============================================================
// Tool result formatter — format hasil eksekusi tool
// ============================================================

/**
 * Format hasil tool menjadi response terstruktur.
 * Dipanggil sebelum dikirim ke user via channel.
 */
function formatToolResult(toolName, result, userMessage) {
  if (!result) {
    return formatResponse({ status: "error", title: "Tool tidak mengembalikan hasil" });
  }

  // Error
  if (result.success === false || result.error) {
    return formatResponse({
      status: "error",
      title: `Gagal menjalankan ${toolName}`,
      summary: result.error || result.message || "Terjadi kesalahan",
      action: "Coba perintah berbeda atau ketik 'cek status platform' untuk diagnostik",
    });
  }

  // Tool-specific formatters
  switch (toolName) {
    case "genieacs-tool":
      return formatGenieAcsResult(result);
    case "doctor-tool":
      return formatDoctorResult(result);
    case "plugin-tool":
      return formatPluginResult(result);
    case "plugin-config-tool":
      return formatPluginConfigResult(result);
    case "cron-tool":
      return formatCronResult(result);
    default:
      return formatGenericResult(result, toolName);
  }
}

function formatGenieAcsResult(result) {
  if (result.devices !== undefined) {
    const devices = result.devices || [];
    const online = devices.filter(d => d.lastInform && (Date.now() - new Date(d.lastInform).getTime()) < 300000);
    return formatResponse({
      status: "success",
      title: `${result.total || devices.length} perangkat ditemukan di ACS`,
      summary: `${online.length} online, ${devices.length - online.length} offline`,
      details: devices.slice(0, 10).map(d => {
        const isOnline = d.lastInform && (Date.now() - new Date(d.lastInform).getTime()) < 300000;
        return `${isOnline ? "🟢" : "🔴"} ${d.id || d.serialNumber || "Unknown"} — ${d.manufacturer || ""} ${d.productClass || ""}`.trim();
      }),
      action: devices.length > 0 ? `Ketik "reboot device <ID>" untuk restart perangkat` : "Ketik 'konfigurasi genieacs' untuk mengatur koneksi ACS",
    });
  }
  if (result.faults !== undefined) {
    const faults = result.faults || [];
    return formatResponse({
      status: faults.length === 0 ? "success" : "warning",
      title: faults.length === 0 ? "Tidak ada fault" : `${faults.length} fault ditemukan`,
      details: faults.slice(0, 10).map(f => `• ${f.device || "?"} — ${f.code || f.type || "unknown"}`),
      action: faults.length > 0 ? `Ketik "clear fault <id>" untuk menghapus fault` : null,
    });
  }
  return formatGenericResult(result, "genieacs-tool");
}

function formatDoctorResult(result) {
  if (result.report) {
    const r = result.report;
    const isHealthy = !r.verdict || r.verdict.includes("SEHAT");
    return formatResponse({
      status: isHealthy ? "success" : "warning",
      title: isHealthy ? "Platform Starclaw SEHAT" : "Platform perlu perhatian",
      summary: r.verdict || "",
      details: [
        `Node.js: ${r.nodeVersion || process.version}`,
        `Uptime: ${r.uptime || "?"}`,
        `Memory: ${r.memory ? `${r.memory.heapUsed} / ${r.memory.heapTotal}` : "?"}`,
        r.modules ? `Modules: ${r.modules.healthy}/${r.modules.total} sehat` : null,
        ...(r.warnings || []).map(w => `⚠️ ${w}`),
      ].filter(Boolean),
      action: isHealthy ? null : "Ketik 'perbaiki platform' untuk self-repair otomatis",
    });
  }
  if (result.verdict !== undefined) {
    return formatResponse({
      status: result.broken === 0 ? "success" : "error",
      title: result.verdict || "Diagnostik selesai",
      details: [
        `Total check: ${result.totalChecked || 0}`,
        `Healthy: ${result.healthy || 0}`,
        result.broken > 0 ? `Broken: ${result.broken}` : null,
        ...(result.warnings || []).map(w => `⚠️ ${w}`),
      ].filter(Boolean),
    });
  }
  return formatGenericResult(result, "doctor-tool");
}

function formatPluginResult(result) {
  if (Array.isArray(result.plugins)) {
    const active = result.plugins.filter(p => p.status === "active").length;
    const needConfig = result.plugins.filter(p => p.status === "config-needed").length;
    return formatResponse({
      status: needConfig > 0 ? "warning" : "success",
      title: `${result.plugins.length} plugin terdaftar`,
      summary: `${active} aktif${needConfig > 0 ? `, ${needConfig} perlu konfigurasi` : ""}`,
      details: result.plugins.map(p => {
        const icon = p.status === "active" ? "🟢" : p.status === "config-needed" ? "🟡" : "🔴";
        const hint = p.missingConfig && p.missingConfig.length > 0 ? ` (butuh: ${p.missingConfig.join(", ")})` : "";
        return `${icon} ${p.name} v${p.version}${hint}`;
      }),
      action: needConfig > 0 ? `Ketik "konfigurasi plugin <nama>" untuk setup plugin yang belum dikonfigurasi` : null,
    });
  }
  if (result.name) {
    return formatResponse({
      status: "success",
      title: `Plugin '${result.name}' berhasil dimuat`,
      details: [
        `Tools: ${(result.tools || []).join(", ") || "tidak ada"}`,
        result.configKeys && result.configKeys.length > 0 ? `Config keys: ${result.configKeys.join(", ")}` : null,
      ].filter(Boolean),
      action: `Gunakan tool '${(result.tools || [])[0] || result.name}' untuk berinteraksi`,
    });
  }
  return formatGenericResult(result, "plugin-tool");
}

function formatPluginConfigResult(result) {
  if (result.message && result.message.includes("Konfigurasi plugin")) {
    const status = result.message.includes("BELUM DISET") ? "warning" : "success";
    return formatResponse({
      status,
      title: status === "warning" ? "Konfigurasi belum lengkap" : "Konfigurasi plugin",
      summary: result.description || null,
      details: result.message
        .split("\n")
        .filter(l => l.startsWith("•"))
        .map(l => l.trim()),
      action: status === "warning"
        ? `Ketik: "set <KEY> <nilai>" untuk mengisi konfigurasi yang kosong`
        : null,
    });
  }
  if (result.success && result.key) {
    return formatResponse({
      status: "success",
      title: `Konfigurasi disimpan`,
      details: [`${result.key} berhasil diset`],
      action: `Konfigurasi efektif langsung tanpa restart`,
    });
  }
  return formatGenericResult(result, "plugin-config-tool");
}

function formatCronResult(result) {
  if (Array.isArray(result.jobs)) {
    return formatResponse({
      status: "success",
      title: `${result.total || 0} cron job terdaftar`,
      summary: `${result.active || 0} aktif`,
      details: result.jobs.slice(0, 10).map(j => {
        const icon = j.active ? "🟢" : "⚪";
        const schedule = j.datetime ? `sekali pada ${new Date(j.datetime).toLocaleString("id-ID")}` : `setiap ${j.interval}`;
        return `${icon} ${j.name} — ${schedule} (run: ${j.runCount || 0}x)`;
      }),
      action: result.total > 0 ? `Ketik "hapus cron <id>" untuk menghapus jadwal` : `Ketik "jadwalkan <task> setiap <interval>" untuk membuat jadwal baru`,
    });
  }
  if (result.job) {
    return formatResponse({
      status: "success",
      title: "Cron job dibuat",
      details: [
        `Task: ${result.job.task}`,
        result.job.interval ? `Interval: setiap ${result.job.interval}` : null,
        result.job.datetime ? `Waktu: ${new Date(result.job.datetime).toLocaleString("id-ID")}` : null,
        `ID: ${result.job.id}`,
      ].filter(Boolean),
      action: `Ketik "/cron list" untuk melihat semua jadwal`,
    });
  }
  return formatGenericResult(result, "cron-tool");
}

function formatGenericResult(result, toolName) {
  if (result.success === true && result.message) {
    return formatResponse({
      status: "success",
      title: result.message.split("\n")[0],
      details: result.message.split("\n").slice(1).filter(l => l.trim()),
    });
  }
  if (result.message || result.summary) {
    return autoFormat(result.message || result.summary);
  }
  // Last resort: ringkas per kunci (tanpa JSON.stringify objek utuh)
  const lines = Object.entries(result)
    .filter(([k]) => !["success", "__context"].includes(k))
    .map(([k, v]) => {
      if (v == null) return `${k}: —`;
      if (typeof v === "object") {
        if (Array.isArray(v)) return `${k}: ${v.length} item`;
        const n = Object.keys(v).length;
        return `${k}: (${n} field)`;
      }
      const s = String(v);
      return `${k}: ${s.length > 100 ? `${s.slice(0, 97)}…` : s}`;
    });
  return formatResponse({
    status: result.success === false ? "error" : "info",
    title: `Hasil ${toolName}`,
    details: lines.slice(0, 8),
  });
}

module.exports = {
  formatResponse,
  autoFormat,
  formatToolResult,
  isAlreadyFormatted,
  detectStatus,
};
