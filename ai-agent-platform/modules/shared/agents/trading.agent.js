"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { buildAgentRole } = require("../../../core/soul/soul.loader");

/**
 * Trading Agent — Spesialis analisis market, MQL5/EA, dan eksekusi order MT5.
 *
 * Kemampuan:
 *   - Analisis teknikal lengkap (RSI, MACD, MA, Bollinger Bands)
 *   - Generate EA/Indicator/Script MQL5 yang siap pakai
 *   - Eksekusi order via MT5 Bridge (jika dikonfigurasi)
 *   - Monitor posisi aktif
 *   - Riset berita dan fundamental
 *
 * Tools utama: market-data-tool, mql5-tool, mt5-bridge-tool
 * Skills: trading (auto-injected)
 * Soul: soul/trading-agent.soul.md
 */
function createTradingAgent() {
  return createBaseAgent({
    name: "trading-agent",
    customTools: [],
    promptBuilder: {
      buildPlanningPrompt(input, toolSchemas) {
        const { createPromptBuilder } = require("../../../core/llm/prompt.builder");
        const base = createPromptBuilder();
        const soulRole = buildAgentRole("trading-agent",
          "Kamu adalah Trading Agent Starclaw. Spesialisasi: analisis pasar finansial, buat EA MQL5, dan trading otonom via MT5. SELALU konfirmasi sebelum eksekusi order di akun real."
        );
        const modInput = {
          ...input,
          __agentRole: soulRole,
          __agentSkills: ["trading"],
        };
        return base.buildPlanningPrompt(modInput, toolSchemas);
      }
    },
  });
}

module.exports = { createTradingAgent };
