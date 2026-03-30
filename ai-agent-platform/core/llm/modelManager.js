"use strict";

const DEFAULT_MODEL = "openai:gpt-4o";

const SUPPORTED_MODELS = new Set([
  "openai:gpt-4o",
  "openai:gpt-4.1-mini",
  "anthropic:claude-3-opus",
  "google:gemini-1.5-pro",
]);

/**
 * Alias singkat untuk channel (tanpa prefix provider)
 */
const SHORT_ALIASES = {
  "gpt-4o": "openai:gpt-4o",
  "gpt-4.1-mini": "openai:gpt-4.1-mini",
  "claude-3-opus": "anthropic:claude-3-opus",
  "gemini-1.5-pro": "google:gemini-1.5-pro",
};

class ModelManager {
  constructor() {
    this.currentModel = process.env.AGENT_MODEL || DEFAULT_MODEL;
    if (!SUPPORTED_MODELS.has(this.currentModel)) {
      this.currentModel = DEFAULT_MODEL;
    }
  }

  /**
   * Normalisasi input: "openai:gpt-4o" atau "gemini-1.5-pro"
   */
  normalizeModelId(input) {
    if (!input || typeof input !== "string") {
      return null;
    }
    const trimmed = input.trim();
    if (SUPPORTED_MODELS.has(trimmed)) {
      return trimmed;
    }
    if (SHORT_ALIASES[trimmed]) {
      return SHORT_ALIASES[trimmed];
    }
    return null;
  }

  setModel(model) {
    const normalized = this.normalizeModelId(model);
    if (!normalized) {
      throw new Error(
        `Model tidak didukung: ${model}. Didukung: ${Array.from(SUPPORTED_MODELS).join(", ")}`
      );
    }
    this.currentModel = normalized;
    process.env.AGENT_MODEL = normalized;
    return this.currentModel;
  }

  getModel() {
    return this.currentModel;
  }

  listSupported() {
    return Array.from(SUPPORTED_MODELS);
  }
}

const singleton = new ModelManager();

module.exports = {
  ModelManager,
  modelManager: singleton,
  SUPPORTED_MODELS,
  DEFAULT_MODEL,
};
