"use strict";

/**
 * Structured Planner — buat seluruh plan sebelum eksekusi dimulai.
 *
 * Berbeda dengan Re-Act Planner yang membuat 1 step per iterasi,
 * Structured Planner menghasilkan array step lengkap dalam satu LLM call.
 *
 * Output format:
 *   [
 *     { "step": 1, "task": "Deskripsi", "tool": "plugin-tool", "input": {...} },
 *     { "step": 2, "task": "Deskripsi", "tool": "plugin-config-tool", "input": {...} },
 *     ...
 *   ]
 *
 * Jika LLM tidak tersedia (mock), gunakan rule-based planner untuk
 * perintah yang sudah dikenal (aktifkan plugin, konfigurasi, dll).
 */

const SYSTEM_PROMPT = `Kamu adalah Starclaw Structured Planner Agent.
Tugasmu: Membuat rencana eksekusi step-by-step yang LENGKAP sebelum dijalankan.

ATURAN WAJIB:
1. Outputkan HANYA array JSON — tidak ada teks lain
2. Setiap step harus punya: step (number), task (string), tool (string), input (object)
3. JANGAN eksekusi — hanya rencanakan
4. Step harus berurutan dan tidak ada yang bisa di-skip
5. Gunakan tool yang tersedia di daftar [AVAILABLE TOOLS]

Format output WAJIB:
[
  { "step": 1, "task": "Deskripsi langkah", "tool": "nama-tool", "input": { ... } },
  { "step": 2, "task": "Deskripsi langkah", "tool": "nama-tool", "input": { ... } }
]

Jika perintah sudah selesai tanpa tool, outputkan:
[{ "step": 1, "task": "Respond", "tool": "__respond__", "input": { "message": "..." } }]`;

/**
 * Rule-based planner untuk perintah yang sudah dikenal.
 * Digunakan sebagai fallback saat LLM tidak tersedia atau untuk efisiensi.
 */
const KNOWN_COMMANDS = [
  {
    pattern: /aktifkan?\s+plugin\s+([a-z0-9_-]+)/i,
    buildPlan: (match) => {
      const pluginName = match[1];
      return [
        {
          step: 1,
          task: `Cek konfigurasi plugin '${pluginName}' yang dibutuhkan`,
          tool: "plugin-config-tool",
          input: { action: "schema", plugin: pluginName },
        },
        {
          step: 2,
          task: `Load dan aktifkan plugin '${pluginName}'`,
          tool: "plugin-tool",
          input: { action: "load", pluginName },
        },
        {
          step: 3,
          task: `Verifikasi plugin '${pluginName}' berhasil dimuat dan tampilkan status`,
          tool: "plugin-tool",
          input: { action: "list" },
        },
      ];
    },
  },
  {
    pattern: /set\s+(?:url|api|konfigurasi|config)\s+([a-z0-9_-]+)\s+(?:ke|to|=)\s+(.+)/i,
    buildPlan: (match) => {
      const pluginOrKey = match[1];
      const value = match[2].trim();
      return [
        {
          step: 1,
          task: `Lihat schema konfigurasi untuk '${pluginOrKey}'`,
          tool: "plugin-config-tool",
          input: { action: "schema", plugin: pluginOrKey },
        },
        {
          step: 2,
          task: `Simpan nilai konfigurasi`,
          tool: "plugin-config-tool",
          input: { action: "set", plugin: pluginOrKey, key: "GENIEACS_URL", value },
        },
        {
          step: 3,
          task: `Verifikasi konfigurasi tersimpan`,
          tool: "plugin-config-tool",
          input: { action: "get", plugin: pluginOrKey },
        },
      ];
    },
  },
  {
    pattern: /(?:cek|check|status)\s+(?:plugin|sistem|platform)/i,
    buildPlan: () => [
      {
        step: 1,
        task: "Jalankan diagnostik lengkap platform",
        tool: "doctor-tool",
        input: { action: "health-report" },
      },
      {
        step: 2,
        task: "Daftar semua plugin yang terinstall",
        tool: "plugin-tool",
        input: { action: "list" },
      },
    ],
  },
  {
    pattern: /jalankan\s+plugin\s+([a-z0-9_-]+)/i,
    buildPlan: (match) => {
      const pluginName = match[1];
      return [
        {
          step: 1,
          task: `Validasi plugin '${pluginName}' sebelum dijalankan`,
          tool: "plugin-config-tool",
          input: { action: "schema", plugin: pluginName },
        },
        {
          step: 2,
          task: `Jalankan plugin '${pluginName}' sebagai service`,
          tool: "plugin-tool",
          input: { action: "load", pluginName },
        },
      ];
    },
  },
];

function createStructuredPlanner({ llmProvider, toolsRegistry, logger }) {
  /**
   * Coba match perintah ke rule-based plan.
   */
  function tryRuleBasedPlan(command) {
    for (const cmd of KNOWN_COMMANDS) {
      const match = command.match(cmd.pattern);
      if (match) {
        const plan = cmd.buildPlan(match);
        logger.info("Rule-based plan ditemukan", { command: command.slice(0, 60), steps: plan.length });
        return plan;
      }
    }
    return null;
  }

  /**
   * Gunakan LLM untuk buat plan jika rule-based tidak cocok.
   */
  async function llmBasedPlan(command, toolSchemas) {
    const toolList = toolSchemas.map(t => `- ${t.name}: ${t.description}`).join("\n");
    const prompt = [
      SYSTEM_PROMPT,
      "",
      "[AVAILABLE TOOLS]",
      toolList,
      "",
      `[PERINTAH USER]`,
      command,
    ].join("\n");

    try {
      const rawResult = await llmProvider.plan(prompt, { message: command });

      // Parse JSON dari response
      let parsed;
      if (typeof rawResult.response === "string") {
        // Coba parse langsung
        try {
          parsed = JSON.parse(rawResult.response);
        } catch (_) {
          // Coba ekstrak array JSON dari dalam teks
          const jsonMatch = rawResult.response.match(/\[[\s\S]*\]/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        }
      } else if (Array.isArray(rawResult)) {
        parsed = rawResult;
      } else if (rawResult.steps) {
        parsed = rawResult.steps;
      }

      if (Array.isArray(parsed) && parsed.length > 0) {
        logger.info("LLM-based plan berhasil", { steps: parsed.length });
        return parsed;
      }
    } catch (err) {
      logger.warn("LLM-based plan gagal, fallback ke rule-based", { error: err.message });
    }
    return null;
  }

  return {
    /**
     * Buat full plan untuk perintah user.
     * Urutan: rule-based → LLM → error
     *
     * @param {string} command - Perintah user
     * @returns {Array} - Array of steps
     */
    async createPlan(command) {
      logger.info("Structured Planner memproses perintah", { command: command.slice(0, 80) });

      // 1. Coba rule-based plan dulu (cepat, deterministik)
      const rulePlan = tryRuleBasedPlan(command);
      if (rulePlan) return rulePlan;

      // 2. Fallback ke LLM
      const allSchemas = toolsRegistry ? toolsRegistry.getToolSchemas() : [];
      const llmPlan = await llmBasedPlan(command, allSchemas);
      if (llmPlan) return llmPlan;

      // 3. Fallback generik — doctor + respond
      logger.warn("Tidak ada plan spesifik, gunakan fallback generik");
      return [
        {
          step: 1,
          task: "Cek status platform dan coba pahami perintah",
          tool: "doctor-tool",
          input: { action: "health-report" },
        },
        {
          step: 2,
          task: "Respond ke user dengan informasi yang tersedia",
          tool: "__respond__",
          input: { message: `Tidak dapat membuat plan spesifik untuk: "${command}"` },
        },
      ];
    },
  };
}

module.exports = { createStructuredPlanner };
