"use strict";

/**
 * Layer wajib: semua keluaran ke user melalui formatter (bukan raw JSON mentah).
 */
function formatResponse(result) {
  if (result == null || result === undefined) {
    return "❌ No result";
  }

  if (typeof result === "string") {
    return result;
  }

  if (typeof result === "object" && result.success === false) {
    const msg = result.message != null ? String(result.message) : "Unknown error";
    return `❌ ${msg}`;
  }

  return `✅ Success\n\n${JSON.stringify(result, null, 2)}`;
}

module.exports = { formatResponse };
