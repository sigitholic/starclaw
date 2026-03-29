"use strict";

const { InMemoryVectorStore } = require("../../infrastructure/vector/in-memory.vector");
const { createJsonStorage } = require("../../infrastructure/storage/json.storage");
const { mockEmbedding } = require("../llm/embedding.provider");
const path = require("path");

/**
 * Long Memory Store — memori jangka panjang agent yang persist antar restart.
 *
 * Fitur:
 *   - Persistent key-value store (JSON file backend)
 *   - Vector search untuk semantic similarity
 *   - Support async embedding (OpenAI atau mock fallback)
 *   - Auto-load data dari file saat inisialisasi
 *
 * @param {object} options
 * @param {object|null} options.embeddingProvider - Dari createEmbeddingProvider(). Null = mock.
 * @param {string} options.storagePath - Path ke file JSON persistensi (default: data/memory/long-memory.json)
 */
function createLongMemoryStore({ embeddingProvider = null, storagePath = null } = {}) {
  const defaultPath = path.resolve(process.cwd(), "data/memory/long-memory.json");
  const jsonStore = createJsonStorage(storagePath || defaultPath);
  const vectorStore = new InMemoryVectorStore();

  const hasAsyncEmbed = embeddingProvider && typeof embeddingProvider.embed === "function";

  // Rebuild vector store dari data yang sudah di-persist saat inisialisasi
  const existingEntries = jsonStore.all();
  for (const entry of existingEntries) {
    if (entry.value && entry.value.__embedding) {
      vectorStore.add(entry.key, entry.value.__embedding, {
        key: entry.key,
        text: entry.value.text || "",
        at: entry.at,
      });
    }
  }

  if (existingEntries.length > 0) {
    console.log(`[LongMemory] Loaded ${existingEntries.length} entries dari persisted storage`);
  }

  return {
    /**
     * Simpan data ke long-term memory.
     * @param {string} key - Unique identifier
     * @param {any} value - Data yang disimpan (object, string, dll)
     */
    async put(key, value) {
      const textToEmbed = typeof value === "string" ? value : (value?.text || JSON.stringify(value));

      // Dapatkan embedding (async jika pakai OpenAI, sync jika mock)
      let embedding;
      if (hasAsyncEmbed) {
        try {
          embedding = await embeddingProvider.embed(textToEmbed);
        } catch (_err) {
          embedding = mockEmbedding(textToEmbed); // fallback
        }
      } else {
        embedding = mockEmbedding(textToEmbed);
      }

      // Simpan ke vector store untuk search
      vectorStore.add(key, embedding, {
        key, text: textToEmbed, at: new Date().toISOString(),
      });

      // Simpan ke persistent JSON storage
      jsonStore.put(key, {
        ...((typeof value === "object" && value !== null) ? value : { text: value }),
        __embedding: embedding,
      });
    },

    get(key) {
      const stored = jsonStore.get(key);
      if (!stored) return null;
      // Jangan expose __embedding ke caller
      const { __embedding, ...cleanValue } = stored.value || {};
      return { value: cleanValue, at: stored.at };
    },

    all() {
      return jsonStore.all().map(entry => {
        const { __embedding, ...cleanValue } = entry.value || {};
        return { key: entry.key, value: cleanValue, at: entry.at };
      });
    },

    /**
     * Cari data yang mirip secara semantik.
     * @param {string} queryText - Teks query
     * @param {number} limit - Jumlah hasil maksimal
     */
    async searchSimilar(queryText, limit = 3) {
      let queryEmbedding;
      if (hasAsyncEmbed) {
        try {
          queryEmbedding = await embeddingProvider.embed(queryText);
        } catch (_err) {
          queryEmbedding = mockEmbedding(queryText);
        }
      } else {
        queryEmbedding = mockEmbedding(queryText);
      }
      return vectorStore.search(queryEmbedding, limit);
    },

    /**
     * Flush semua data ke disk (panggil sebelum shutdown).
     */
    flush() {
      jsonStore.flush();
    },

    get size() { return jsonStore.size; },
  };
}

module.exports = { createLongMemoryStore };
