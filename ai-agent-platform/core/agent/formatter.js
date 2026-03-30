"use strict";

const {
  formatToolResult,
  autoFormat,
  formatResponse: formatStructuredResponse,
} = require("../utils/response.formatter");

/**
 * Layer wajib: semua keluaran ke user melalui formatter (bukan raw JSON mentah).
 * Objek hasil tool diformat via formatToolResult (response terstruktur, bukan JSON.stringify).
 *
 * @param {*} result - string, objek hasil tool, atau nilai lain
 * @param {string} [toolName] - nama tool (untuk format spesifik per-tool)
 * @returns {string}
 */
function formatResponse(result, toolName) {
  if (result == null || result === undefined) {
    return "❌ Tidak ada hasil";
  }

  if (typeof result === "string") {
    const t = result.trim();
    if (!t) return "❌ Tidak ada hasil";
    if (t.startsWith("{") && t.endsWith("}")) {
      try {
        const parsed = JSON.parse(t);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return formatToolResult(toolName || "agent", parsed);
        }
      } catch (_) {
        /* bukan JSON valid — kembalikan teks apa adanya */
      }
    }
    return result;
  }

  if (typeof result === "object") {
    if (Array.isArray(result)) {
      const details = result.slice(0, 20).map((x) => {
        if (x == null) return "• (kosong)";
        if (typeof x === "object") {
          const s = JSON.stringify(x);
          return `• ${s.length > 120 ? `${s.slice(0, 117)}...` : s}`;
        }
        return `• ${String(x)}`;
      });
      return formatStructuredResponse({
        status: "success",
        title: `${result.length} item`,
        details,
      });
    }
    return formatToolResult(toolName || "agent", result);
  }

  return autoFormat(String(result));
}

module.exports = { formatResponse };
