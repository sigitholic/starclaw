"use strict";

/**
 * Step Validator — validasi hasil eksekusi setiap step.
 *
 * Memutuskan: success | fail | retry
 *
 * Setiap validator menerima:
 *   - step: definisi step dari plan
 *   - result: output dari tool execution
 *   - attempt: percobaan ke berapa
 *   - context: context akumulasi dari step sebelumnya
 *
 * Return:
 *   { valid: boolean, shouldRetry: boolean, reason: string, severity: "ok"|"warn"|"error" }
 */

const MAX_RETRIES = 2; // Max 2 retry per step (total 3 attempt)

/**
 * Validator generik untuk semua tool.
 * Dicek dalam urutan: explicit error → success flag → content check
 */
function validateGenericResult(result) {
  if (!result) {
    return { valid: false, shouldRetry: true, reason: "Tool mengembalikan null/undefined", severity: "error" };
  }

  // Explicit success: false
  if (result.success === false) {
    const reason = result.error || result.message || "Tool mengembalikan success=false";
    const isRetryable = !reason.toLowerCase().includes("tidak ditemukan") &&
                        !reason.toLowerCase().includes("not found") &&
                        !reason.toLowerCase().includes("wajib");
    return { valid: false, shouldRetry: isRetryable, reason, severity: "error" };
  }

  // Error string
  if (typeof result.error === "string" && result.error.length > 0) {
    return { valid: false, shouldRetry: true, reason: result.error, severity: "error" };
  }

  // Explicit success: true
  if (result.success === true) {
    return { valid: true, shouldRetry: false, reason: "OK", severity: "ok" };
  }

  // Tidak ada success flag — anggap valid jika ada content
  const hasContent = Object.keys(result).length > 0;
  return {
    valid: hasContent,
    shouldRetry: !hasContent,
    reason: hasContent ? "OK (no explicit success flag)" : "Tool mengembalikan object kosong",
    severity: hasContent ? "ok" : "warn",
  };
}

/**
 * Validator khusus per tool — override generic behavior.
 */
const TOOL_VALIDATORS = {
  "fs-tool": (result, step) => {
    // action=exists: valid jika exists=true (plugin ada)
    if (step.input && step.input.action === "exists") {
      if (!result.exists) {
        return {
          valid: false,
          shouldRetry: false,
          reason: `Path tidak ditemukan: ${step.input.path}`,
          severity: "error",
        };
      }
      return { valid: true, shouldRetry: false, reason: "Path ditemukan", severity: "ok" };
    }
    // action=read: valid jika ada content
    if (step.input && step.input.action === "read") {
      if (!result.content && result.success !== false) {
        return { valid: true, shouldRetry: false, reason: "File dibaca (mungkin kosong)", severity: "warn" };
      }
    }
    return validateGenericResult(result);
  },

  "plugin-tool": (result, step) => {
    // action=load: valid jika plugin berhasil dimuat
    if (step.input && step.input.action === "load") {
      if (result.success === false) {
        const isAlreadyLoaded = (result.error || "").includes("sudah dimuat");
        return {
          valid: isAlreadyLoaded,  // Sudah dimuat = valid
          shouldRetry: false,
          reason: isAlreadyLoaded ? "Plugin sudah aktif" : (result.error || "Load gagal"),
          severity: isAlreadyLoaded ? "warn" : "error",
        };
      }
    }
    // action=list: valid jika ada data (meskipun kosong)
    if (step.input && step.input.action === "list") {
      return { valid: true, shouldRetry: false, reason: `${(result.plugins || []).length} plugin terdaftar`, severity: "ok" };
    }
    return validateGenericResult(result);
  },

  "plugin-config-tool": (result, step) => {
    if (step.input && step.input.action === "schema") {
      // schema selalu valid (mungkin plugin tidak punya schema)
      return { valid: true, shouldRetry: false, reason: "Schema check selesai", severity: "ok" };
    }
    if (step.input && step.input.action === "set") {
      // set valid jika success=true
      if (result.success) return { valid: true, shouldRetry: false, reason: "Config disimpan", severity: "ok" };
      return { valid: false, shouldRetry: true, reason: result.error || "Set config gagal", severity: "error" };
    }
    return validateGenericResult(result);
  },

  "doctor-tool": (result) => {
    // Health report selalu valid — hanya informatif
    if (result.report || result.success !== false) {
      return { valid: true, shouldRetry: false, reason: "Diagnostik selesai", severity: "ok" };
    }
    return validateGenericResult(result);
  },

  "__respond__": (result) => {
    // Special tool — selalu valid
    return { valid: true, shouldRetry: false, reason: "Response dikirim", severity: "ok" };
  },
};

function createStepValidator({ logger }) {
  return {
    /**
     * Validasi hasil eksekusi satu step.
     *
     * @param {object} step - Step definition dari plan
     * @param {object} result - Output dari tool.run()
     * @param {number} attempt - Percobaan ke berapa (1-based)
     * @param {object} context - Context akumulasi
     * @returns {{ valid, shouldRetry, reason, severity, canContinue }}
     */
    validate(step, result, attempt = 1, context = {}) {
      const toolName = step.tool;

      // Gunakan validator khusus jika ada
      const specificValidator = TOOL_VALIDATORS[toolName];
      let validation;

      if (specificValidator) {
        validation = specificValidator(result, step, context);
      } else {
        validation = validateGenericResult(result);
      }

      // Batasi retry
      const retriesLeft = MAX_RETRIES - (attempt - 1);
      if (validation.shouldRetry && retriesLeft <= 0) {
        validation.shouldRetry = false;
        validation.reason = `${validation.reason} (max ${MAX_RETRIES} retry tercapai)`;
      }

      // canContinue: apakah bisa lanjut ke step berikutnya
      // Bahkan jika gagal, beberapa error boleh dilanjutkan (severity=warn)
      const canContinue = validation.valid || validation.severity === "warn";

      logger.info("Step validation", {
        tool: toolName,
        step: step.stepNumber || step.step,
        valid: validation.valid,
        shouldRetry: validation.shouldRetry,
        canContinue,
        reason: validation.reason,
        attempt,
      });

      return { ...validation, canContinue, attempt, retriesLeft: Math.max(0, retriesLeft) };
    },
  };
}

module.exports = { createStepValidator, MAX_RETRIES };
