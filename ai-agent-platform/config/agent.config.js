"use strict";

const agentConfig = {
  // ============================================================
  // Memory
  // ============================================================
  // Token budget untuk context planner (estimasi karakter/3)
  defaultTokenBudget: 4000,

  // Maksimal item short memory sebelum trim
  maxShortMemoryItems: 30,

  // Jumlah interaksi terakhir yang selalu dipertahankan di context
  plannerRecentWindow: 5,

  // Batas panjang summary (karakter)
  maxSummaryLength: 1500,

  // Gunakan LLM untuk summarization (lebih akurat tapi pakai token)
  useLLMSummarizer: false,

  // ============================================================
  // Tool Selection (Smart Prompt)
  // ============================================================
  // Kirim hanya tool relevan ke LLM (hemat ~2000-3000 token per call)
  smartToolSelection: true,

  // Jumlah maksimal tool yang dikirim ke LLM dalam satu prompt
  maxToolsInPrompt: 8,

  // ============================================================
  // Workflow Engine
  // ============================================================
  // Maksimal iterasi Re-Act loop per task
  maxIterations: 12,

  // Sliding window untuk observation buffer (cegah context explosion)
  maxObservations: 6,

  // Delay antar iterasi (ms)
  iterationDelayMs: 300,

  // ============================================================
  // Retry & Timeout
  // ============================================================
  // Default timeout tool per step (ms) — 0 = tidak ada timeout
  defaultToolTimeoutMs: 30000,

  // Default max retry tool per step
  defaultToolMaxRetries: 1,

  // ============================================================
  // Token Tracking
  // ============================================================
  // Aktifkan tracking token usage per sesi
  trackTokenUsage: true,

  // Koefisien estimasi token (karakter per token)
  // 3 = konservatif untuk Bahasa Indonesia/campuran
  // 4 = standar untuk Bahasa Inggris
  tokenCharsPerToken: 3,
};

module.exports = { agentConfig };
