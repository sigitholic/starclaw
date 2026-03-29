"use strict";

/**
 * Context Summarizer — tingkatkan dengan LLM-based summarization.
 *
 * Strategi:
 *   1. Jika LLM provider tersedia, gunakan untuk membuat ringkasan cerdas
 *   2. Fallback ke rule-based summarization (cepat, tanpa API call)
 *
 * Rule-based summary sudah cukup baik untuk kasus normal.
 * LLM summary berguna saat percakapan sangat panjang/kompleks.
 */

// Cache LLM provider (di-set via setSummarizerLLM)
let summarizerLLM = null;

/**
 * Set LLM provider untuk summarization canggih.
 * Panggil di entry point: setSummarizerLLM(llmProvider)
 */
function setSummarizerLLM(llmProvider) {
  if (llmProvider && typeof llmProvider.plan === "function") {
    summarizerLLM = llmProvider;
    console.log("[Summarizer] LLM-based summarization diaktifkan");
  }
}

function summarizeGaps(gaps) {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return "Tidak ada gap kritis terdeteksi.";
  }

  return gaps
    .map((gap, index) => `${index + 1}. ${gap.area}: ${gap.issue}`)
    .join("\n");
}

/**
 * Summarize interactions — rule-based (default) atau LLM-powered.
 *
 * @param {string} previousSummary - Ringkasan sebelumnya
 * @param {Array} interactions - Array interaksi { userMessage, agentMessage }
 * @param {object} options - { useLLM: boolean }
 */
function summarizeInteractions(previousSummary, interactions = [], options = {}) {
  // Rule-based summarization (cepat, tanpa API call)
  const compactEntries = interactions
    .map((interaction) => {
      const userText = interaction.userMessage || "-";
      const agentText = interaction.agentMessage || "-";
      // Potong pesan panjang agar ringkas
      const trimmedUser = userText.length > 100 ? userText.slice(0, 100) + "..." : userText;
      const trimmedAgent = agentText.length > 150 ? agentText.slice(0, 150) + "..." : agentText;
      return `U:${trimmedUser} | A:${trimmedAgent}`;
    })
    .slice(-6);

  const merged = [previousSummary, ...compactEntries]
    .filter(Boolean)
    .join(" || ");

  if (!merged) {
    return "";
  }

  // Batasi panjang summary supaya tidak membesar tanpa kontrol.
  return merged.length > 1500 ? merged.slice(merged.length - 1500) : merged;
}

/**
 * LLM-based summarization — gunakan AI untuk meringkas percakapan.
 * Async karena perlu panggil API.
 * Fallback ke rule-based jika LLM gagal.
 */
async function summarizeWithLLM(previousSummary, interactions = []) {
  if (!summarizerLLM) {
    return summarizeInteractions(previousSummary, interactions);
  }

  try {
    const conversationText = interactions.map(i => {
      return `User: ${(i.userMessage || "-").slice(0, 200)}\nAgent: ${(i.agentMessage || "-").slice(0, 300)}`;
    }).join("\n---\n");

    const prompt = [
      "Ringkas percakapan berikut menjadi SATU paragraf singkat (maks 200 kata).",
      "Fokus pada: keputusan kunci, tool yang digunakan, dan hasil penting.",
      "",
      previousSummary ? `Konteks sebelumnya: ${previousSummary.slice(0, 300)}` : "",
      "",
      "Percakapan terbaru:",
      conversationText,
      "",
      'Kembalikan JSON: { "action": "respond", "response": "<ringkasan>", "summary": "Summarization selesai" }',
    ].join("\n");

    const result = await summarizerLLM.plan(prompt, {});
    if (result && result.response) {
      return typeof result.response === "string"
        ? result.response.slice(0, 1500)
        : summarizeInteractions(previousSummary, interactions);
    }
  } catch (err) {
    console.warn(`[Summarizer] LLM summarization gagal, fallback ke rule-based: ${err.message}`);
  }

  return summarizeInteractions(previousSummary, interactions);
}

module.exports = { summarizeGaps, summarizeInteractions, summarizeWithLLM, setSummarizerLLM };
