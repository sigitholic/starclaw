"use strict";

const { normalizePlannerDecision } = require("../utils/validator");
const { modelManager } = require("./modelManager");
const { callModelJson, ROUTING } = require("./modelRouter");

// ===================================================
// CIRCUIT BREAKER — mencegah spam ke OpenAI saat down
// State: CLOSED → OPEN (jika 3 gagal berturut) → HALF-OPEN (coba lagi setelah cooldown)
// ===================================================
function createCircuitBreaker({ failureThreshold = 3, cooldownMs = 30000 } = {}) {
  let state = "CLOSED"; // CLOSED | OPEN | HALF-OPEN
  let failures = 0;
  let openedAt = null;

  return {
    get state() { return state; },

    recordSuccess() {
      failures = 0;
      state = "CLOSED";
    },

    recordFailure() {
      failures += 1;
      if (failures >= failureThreshold) {
        state = "OPEN";
        openedAt = Date.now();
      }
    },

    isAllowed() {
      if (state === "CLOSED") return true;
      if (state === "OPEN") {
        const elapsed = Date.now() - openedAt;
        if (elapsed >= cooldownMs) {
          state = "HALF-OPEN";
          return true;
        }
        return false;
      }
      if (state === "HALF-OPEN") return true;
      return true;
    },
  };
}

// ===================================================
// EXPONENTIAL BACKOFF — retry dengan jeda meningkat
// ===================================================
async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ===================================================
// HELPER: Kirim request ke OpenAI Chat Completion
// ===================================================
async function callOpenAI({ apiKey, modelName, systemPrompt, userPrompt, temperature = 0.2 }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${userPrompt}\n\nKembalikan response JSON saja tanpa markdown.` },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errText}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(content);
  } catch (_err) {
    return null;
  }
}

function resolveOpenAiApiModel() {
  const id = modelManager.getModel();
  const route = ROUTING[id];
  if (route && route.provider === "openai") {
    return route.apiModel;
  }
  return process.env.LLM_MODEL || "gpt-4o-mini";
}

function createOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const circuit = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 });

  return {
    /**
     * plan(): Digunakan oleh Planner Agent — routing ke provider sesuai modelManager.
     */
    async plan(prompt, input = {}) {
      const userPrompt = (input && typeof input.message === "string") ? input.message : "Lanjutkan tugas sebelumnya.";

      const runPlanner = async () => {
        const modelId = modelManager.getModel();
        if (modelId.startsWith("openai")) {
          if (!apiKey) throw new Error("OPENAI_API_KEY belum diatur untuk provider openai");
          const modelName = resolveOpenAiApiModel();
          return callOpenAI({
            apiKey,
            modelName,
            systemPrompt: prompt,
            userPrompt,
          });
        }
        return callModelJson({ systemPrompt: prompt, userPrompt });
      };

      if (!circuit.isAllowed()) {
        console.warn(`[LLM] Circuit breaker OPEN — fallback ke respond. State: ${circuit.state}`);
        return normalizePlannerDecision({
          action: "respond",
          response: "Sistem AI sementara tidak tersedia (circuit breaker aktif). Silakan coba lagi dalam 30 detik.",
          summary: "Circuit breaker aktif",
        });
      }

      try {
        const parsed = await withRetry(() => runPlanner(), { maxRetries: 2, baseDelayMs: 1000 });

        circuit.recordSuccess();

        console.log(`[LLM-DEBUG] Raw LLM response action: ${parsed?.action || "null"}, tool: ${parsed?.tool_name || "none"}, steps: ${parsed?.steps?.length || 0}`);

        if (!parsed) {
          return normalizePlannerDecision({
            action: "respond",
            response: "Planner fallback: output model tidak menghasilkan JSON valid.",
            summary: "Fallback JSON tidak valid",
          });
        }

        normalizePlannerDecision(parsed);
        return parsed;
      } catch (err) {
        circuit.recordFailure();
        console.error(`[LLM] Gagal setelah retry. Circuit state: ${circuit.state}. Error: ${err.message}`);
        return normalizePlannerDecision({
          action: "respond",
          response: `LLM tidak dapat diakses saat ini: ${err.message}`,
          summary: "LLM error fallback",
        });
      }
    },

    /**
     * review(): Digunakan oleh Reviewer Agent (Security Gate).
     */
    async review(prompt) {
      const runReview = async () => {
        const modelId = modelManager.getModel();
        if (modelId.startsWith("openai")) {
          if (!apiKey) throw new Error("OPENAI_API_KEY belum diatur untuk provider openai");
          const modelName = resolveOpenAiApiModel();
          return callOpenAI({
            apiKey,
            modelName,
            systemPrompt: "Kamu adalah security reviewer agent. Kembalikan JSON dengan field: approved (boolean), reason (string), suggestedChanges (array of strings).",
            userPrompt: prompt,
            temperature: 0.1,
          });
        }
        const parsed = await callModelJson({
          systemPrompt: "Kamu adalah security reviewer. Kembalikan HANYA JSON: { \"approved\": boolean, \"reason\": string, \"suggestedChanges\": string[] }",
          userPrompt: prompt,
        });
        if (!parsed) return null;
        return {
          approved: parsed.approved ?? true,
          reason: parsed.reason || "Diizinkan oleh sistem",
          suggestedChanges: Array.isArray(parsed.suggestedChanges) ? parsed.suggestedChanges : [],
        };
      };

      if (!circuit.isAllowed()) {
        return { approved: false, reason: "Circuit breaker aktif — reviewer tidak dapat beroperasi.", suggestedChanges: [] };
      }

      try {
        const parsed = await withRetry(() => runReview(), { maxRetries: 1, baseDelayMs: 500 });

        circuit.recordSuccess();

        if (!parsed) {
          return { approved: false, reason: "Reviewer: output model tidak valid JSON", suggestedChanges: [] };
        }

        if (parsed.approved !== undefined) {
          return {
            approved: parsed.approved ?? true,
            reason: parsed.reason || "Diizinkan oleh sistem",
            suggestedChanges: Array.isArray(parsed.suggestedChanges) ? parsed.suggestedChanges : [],
          };
        }

        return { approved: false, reason: "Reviewer: format tidak dikenali", suggestedChanges: [] };
      } catch (err) {
        circuit.recordFailure();
        return { approved: false, reason: "Reviewer error: " + err.message, suggestedChanges: [] };
      }
    },

    /**
     * embed(): Hasilkan vector embedding dari teks (hanya OpenAI).
     */
    async embed(text) {
      if (!apiKey) return null;
      if (!circuit.isAllowed()) return null;

      try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: String(text).slice(0, 8000) }),
        });

        if (!response.ok) throw new Error(`Embedding API error: ${response.status}`);
        const body = await response.json();
        circuit.recordSuccess();
        return body?.data?.[0]?.embedding || null;
      } catch (err) {
        circuit.recordFailure();
        console.warn(`[LLM] Embedding gagal: ${err.message}`);
        return null;
      }
    },

    getCircuitState() {
      return circuit.state;
    },
  };
}

module.exports = { createOpenAIProvider };
