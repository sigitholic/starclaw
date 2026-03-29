"use strict";

/**
 * Embedding Provider — abstraksi untuk membuat vector embedding dari teks.
 *
 * Prioritas provider:
 *   1. OpenAI (text-embedding-3-small) — jika OPENAI_API_KEY tersedia & embed() ada
 *   2. Mock (charCode-based, 64 dimensi) — fallback jika OpenAI tidak tersedia
 *
 * Menggunakan 64 dimensi untuk mock (vs 10 dimensi lama) agar similarity
 * lebih akurat meski masih berbasis karakter.
 */

/**
 * Mock embedding yang lebih baik dari sebelumnya (64 dimensi, normalized).
 * Masih berbasis karakter tapi lebih representatif dari 10 dimensi.
 */
function mockEmbedding(text) {
  const DIM = 64;
  const vector = new Array(DIM).fill(0);
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    vector[i % DIM] += code;
    // Bigram: tambahkan kontribusi pasangan karakter agar lebih semantik
    if (i + 1 < str.length) {
      vector[(i * 31 + str.charCodeAt(i + 1)) % DIM] += 0.5;
    }
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map(v => v / norm);
}

/**
 * Buat embedding provider.
 * @param {object|null} llmProvider - Provider LLM (dari createOpenAIProvider). Jika null, gunakan mock.
 */
function createEmbeddingProvider(llmProvider = null) {
  const hasRealEmbed = llmProvider && typeof llmProvider.embed === "function";

  if (hasRealEmbed) {
    console.log("[EmbeddingProvider] Menggunakan OpenAI text-embedding-3-small (1536 dimensi)");
  } else {
    console.log("[EmbeddingProvider] Menggunakan mock embedding 64 dimensi (fallback)");
  }

  return {
    /**
     * Hasilkan embedding vector dari teks.
     * @param {string} text
     * @returns {Promise<number[]>} Vector embedding
     */
    async embed(text) {
      if (hasRealEmbed) {
        try {
          const vector = await llmProvider.embed(text);
          if (vector && Array.isArray(vector) && vector.length > 0) {
            return vector;
          }
        } catch (err) {
          console.warn(`[EmbeddingProvider] OpenAI embed gagal, fallback ke mock: ${err.message}`);
        }
      }
      // Fallback ke mock
      return mockEmbedding(text);
    },

    get isReal() {
      return hasRealEmbed;
    },
  };
}

module.exports = { createEmbeddingProvider, mockEmbedding };
