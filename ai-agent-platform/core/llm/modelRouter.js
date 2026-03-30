"use strict";

const path = require("path");
const { modelManager } = require("./modelManager");

const skillResultHelperPath = path.join(__dirname, "..", "..", "..", "skills", "skill-result.helper.js");

/**
 * Ambil payload tampilan dari hasil tool (berbagai bentuk kontrak plugin).
 */
function extractSuccessPayload(result) {
  if (!result || typeof result !== "object") return undefined;
  if (result.data !== undefined) return result.data;
  if (result.verdict !== undefined) return result.verdict;
  if (result.message != null && String(result.message).trim() !== "") return result.message;
  const { success: _s, error: _e, ...rest } = result;
  if (Object.keys(rest).length > 0) return rest;
  return result;
}

/**
 * Format jawaban akhir dari hasil tool terstruktur { success, data, verdict, message, ... }
 */
function formatSkillFinalAnswer(result) {
  const summary = result.summary != null ? String(result.summary).trim() : "";
  const detail = result.detail && typeof result.detail === "object" && !Array.isArray(result.detail) ? result.detail : {};
  const ok = result.success !== false;
  const emoji = ok ? "✅" : "❌";
  const lines = [`${emoji} ${summary || (ok ? "Selesai" : "Gagal")}`];
  const entries = Object.entries(detail).filter(([, v]) => v != null && String(v).trim() !== "");
  if (entries.length > 0) {
    lines.push("");
    lines.push("📌 Detail:");
    for (const [k, v] of entries) {
      lines.push(`• ${k}: ${String(v)}`);
    }
  }
  return lines.join("\n");
}

function formatFinalAnswer(result) {
  if (!result || typeof result !== "object") {
    return "❌ Failed: hasil tool tidak valid";
  }
  if (typeof result.summary === "string" && result.detail != null && typeof result.detail === "object" && !Array.isArray(result.detail)) {
    return formatSkillFinalAnswer(result);
  }
  if (result.success === false) {
    const msg =
      result.message != null
        ? String(result.message)
        : result.summary != null
          ? String(result.summary)
          : "unknown error";
    return "❌ Failed: " + msg;
  }
  const payload = extractSuccessPayload(result);
  let body;
  if (payload === undefined) {
    body = JSON.stringify(result, null, 2);
  } else if (payload === null || typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean") {
    body = String(payload);
  } else {
    body = JSON.stringify(payload, null, 2);
  }
  return "✅ Result:\n" + body;
}

/**
 * Normalisasi keluaran skill ke { success, summary, detail } — bukan payload tool mentah.
 */
function normalizeSkillResult(raw) {
  if (
    raw &&
    typeof raw === "object" &&
    typeof raw.success === "boolean" &&
    typeof raw.summary === "string" &&
    raw.detail != null &&
    typeof raw.detail === "object" &&
    !Array.isArray(raw.detail)
  ) {
    return {
      success: raw.success,
      summary: raw.summary.trim() || (raw.success ? "Selesai" : "Gagal"),
      detail: { ...raw.detail },
    };
  }
  if (raw && typeof raw === "object" && typeof raw.success === "boolean" && typeof raw.summary === "string") {
    return {
      success: raw.success,
      summary: raw.summary.trim() || (raw.success ? "Selesai" : "Gagal"),
      detail: {},
    };
  }
  const { fromNormalizedTool } = require(skillResultHelperPath);
  const normalized = normalizeToolResult(raw);
  return fromNormalizedTool(normalized);
}

/**
 * Normalisasi output tool ke kontrak { success, data, message }
 */
function normalizeToolResult(raw) {
  if (raw && typeof raw === "object" && "success" in raw) {
    return raw;
  }
  return {
    success: true,
    data: raw,
    message: undefined,
  };
}

async function callOpenAIChat({ apiKey, modelName, systemPrompt, userPrompt, jsonMode = true }) {
  const body = {
    model: modelName,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${userPrompt}\n\nKembalikan response JSON saja tanpa markdown.` },
    ],
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errText}`);
  }

  const resBody = await response.json();
  const content = resBody?.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content);
  } catch (_err) {
    return null;
  }
}

async function callAnthropicMessages({ apiKey, modelName, systemPrompt, userPrompt }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${userPrompt}\n\nKembalikan HANYA JSON valid tanpa markdown atau teks lain.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errText}`);
  }

  const resBody = await response.json();
  const textBlock = (resBody.content || []).find((c) => c.type === "text");
  const content = textBlock?.text || "";
  try {
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch (_err) {
    return null;
  }
}

async function callGeminiJson({ apiKey, modelName, systemPrompt, userPrompt }) {
  let GoogleGenerativeAI;
  try {
    ({ GoogleGenerativeAI } = require("@google/generative-ai"));
  } catch (_e) {
    throw new Error("Paket @google/generative-ai belum terpasang");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(
    `${userPrompt}\n\nKembalikan HANYA JSON valid tanpa markdown.`
  );
  const text = result.response.text();
  try {
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch (_err) {
    return null;
  }
}

const ROUTING = {
  "openai:gpt-4o": { provider: "openai", apiModel: "gpt-4o" },
  "openai:gpt-4.1-mini": { provider: "openai", apiModel: "gpt-4.1-mini" },
  "anthropic:claude-3-opus": { provider: "anthropic", apiModel: "claude-3-opus-20240229" },
  "google:gemini-1.5-pro": { provider: "google", apiModel: "gemini-1.5-pro" },
};

/**
 * Pilih model berdasarkan task (auto-routing) — dipakai saat payload.__modelMode === "auto".
 * Heuristik sederhana; bisa diganti dengan policy eksternal.
 */
function selectModelForTask(message = "") {
  const m = String(message || "").toLowerCase();
  if (
    /code|refactor|typescript|javascript|python|bug|error stack|stack trace/.test(m) ||
    /implement|function|class|api|endpoint/.test(m)
  ) {
    return "openai:gpt-4o";
  }
  if (/(write|tulis|essay|artikel|blog|story|cerita|marketing|copy)/.test(m)) {
    return "anthropic:claude-3-opus";
  }
  if (/(summarize|ringkas|translate|terjemah|multimodal|gambar|image)/.test(m)) {
    return "google:gemini-1.5-pro";
  }
  if (m.length > 2000) {
    return "google:gemini-1.5-pro";
  }
  return "openai:gpt-4.1-mini";
}

/**
 * Panggilan planner: kembalikan objek JSON (sama seperti output OpenAI plan)
 */
async function callModelJson({ systemPrompt, userPrompt }) {
  const fullId = modelManager.getModel();
  console.log("MODEL:", modelManager.getModel());

  const route = ROUTING[fullId];
  if (!route) {
    throw new Error(`Model tidak dikenal di router: ${fullId}`);
  }

  if (route.provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) throw new Error("OPENAI_API_KEY belum diatur");
    return callOpenAIChat({
      apiKey,
      modelName: route.apiModel,
      systemPrompt,
      userPrompt,
      jsonMode: true,
    });
  }

  if (route.provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY || "";
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY belum diatur");
    return callAnthropicMessages({
      apiKey,
      modelName: route.apiModel,
      systemPrompt,
      userPrompt,
    });
  }

  if (route.provider === "google") {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("GEMINI_API_KEY belum diatur");
    return callGeminiJson({
      apiKey,
      modelName: route.apiModel,
      systemPrompt,
      userPrompt,
    });
  }

  throw new Error(`Provider tidak diimplementasi: ${route.provider}`);
}

/**
 * Teks bebas (untuk embedding ringan / debug) — opsional
 */
async function callModel(prompt) {
  const fullId = modelManager.getModel();
  const route = ROUTING[fullId];
  if (route?.provider === "google") {
    let GoogleGenerativeAI;
    ({ GoogleGenerativeAI } = require("@google/generative-ai"));
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("GEMINI_API_KEY belum diatur");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: route.apiModel });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
  const parsed = await callModelJson({
    systemPrompt: "Kamu adalah asisten. Jawab singkat dan jelas.",
    userPrompt: prompt,
  });
  return parsed ? JSON.stringify(parsed) : "";
}

module.exports = {
  extractSuccessPayload,
  callModel,
  callModelJson,
  /** @deprecated gunakan callModelJson */
  callModelWithJsonPlan: function callModelWithJsonPlan(opts) {
    return callModelJson(opts);
  },
  formatFinalAnswer,
  formatSkillFinalAnswer,
  normalizeToolResult,
  normalizeSkillResult,
  ROUTING,
  selectModelForTask,
};
