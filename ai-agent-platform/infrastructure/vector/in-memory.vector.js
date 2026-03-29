"use strict";

/**
 * A simple in-memory vector store using cosine similarity
 * Useful as a lightweight implementation of long-term memory for the Agent framework.
 */
class InMemoryVectorStore {
  constructor() {
    this.vectors = []; // Array of { id, metadata, embedding }
  }

  /**
   * Add a new vector to the store
   * @param {string} id Unique identifier
   * @param {number[]} embedding Vector embedding (array of numbers)
   * @param {object} metadata Additional metadata (text, timestamps, etc)
   */
  add(id, embedding, metadata = {}) {
    this.vectors.push({ id, metadata, embedding });
  }

  /**
   * Search for top-k similar vectors using cosine similarity
   * @param {number[]} queryEmbedding The query vector
   * @param {number} k Number of results to return
   * @returns {Array} Top k results sorted by similarity score
   */
  search(queryEmbedding, k = 3) {
    if (this.vectors.length === 0) return [];

    const results = this.vectors.map(item => {
      const score = this.cosineSimilarity(queryEmbedding, item.embedding);
      return { ...item, score };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = { InMemoryVectorStore };
