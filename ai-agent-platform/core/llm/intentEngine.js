"use strict";

const { callModelJsonString } = require("./modelRouter");

/**
 * Panggilan LLM untuk klasifikasi intent — hanya JSON (string mentah) dari model.
 * @param {{ prompt: string, input: string, context?: Record<string, unknown> }} opts
 * @returns {Promise<string>}
 */
async function callLLM({ prompt, input, context = {} }) {
  const ctx =
    context && typeof context === "object" && Object.keys(context).length > 0
      ? `\n\nContext (JSON):\n${JSON.stringify(context)}`
      : "";
  const userPrompt = `${typeof input === "string" ? input : String(input)}\n${ctx}`.trim();
  return callModelJsonString({
    systemPrompt: prompt,
    userPrompt,
  });
}

const INTENT_PROMPT = `
You are an AI intent classifier for an agent system.

Available skills:
- run-system-command → for ping / network
- check-server-resource → CPU / RAM / load
- check-system-health → platform health
- list-skills → list all skills
- list-plugins → list all plugins

Return ONLY JSON:

{
  "type": "skill" | "chat" | "system",
  "skill": "string | null",
  "input": {}
}

Rules:
- If user asks about CPU/RAM → check-server-resource
- If user asks ping → run-system-command
- If user asks about platform → check-system-health
- If user asks about skills → list-skills
- If user asks about plugins → list-plugins
- If greeting or casual → chat
`.trim();

/**
 * Deteksi intent lewat LLM; gagal → null (fallback ke planner rule-based).
 * @param {string} userInput
 * @param {Record<string, unknown>} context
 * @returns {Promise<object | null>}
 */
async function detectIntentLLM(userInput, context = {}) {
  let response;
  try {
    response = await callLLM({
      prompt: INTENT_PROMPT,
      input: userInput,
      context,
    });
  } catch (_e) {
    return null;
  }

  if (typeof response !== "string" || !response.trim().startsWith("{")) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(response.trim());
  } catch (_e) {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  let type = typeof parsed.type === "string" ? parsed.type.toLowerCase() : "";
  if (type !== "skill" && type !== "chat" && type !== "system") {
    return null;
  }

  let skill = parsed.skill != null ? String(parsed.skill) : null;
  if (skill === "") skill = null;

  const input = parsed.input && typeof parsed.input === "object" ? parsed.input : {};

  return { type, skill, input };
}

module.exports = { detectIntentLLM, callLLM, INTENT_PROMPT };
