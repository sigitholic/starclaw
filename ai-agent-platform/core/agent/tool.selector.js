"use strict";

/**
 * Smart Tool Selector — pilih hanya tool relevan untuk dikirim ke LLM.
 *
 * Masalah yang dipecahkan:
 *   Mengirim semua 19+ tool schemas ke LLM setiap call memakan ~3000+ token.
 *   Untuk pertanyaan sederhana ("status server?"), LLM tidak perlu tahu
 *   tentang schema genieacs-tool, mql5-tool, social-media-tool, dll.
 *
 * Strategi seleksi (berlapis):
 *   1. Tool yang SELALU ada (core essentials)
 *   2. Tool yang dipesan eksplisit oleh agent (__requiredTools)
 *   3. Tool yang relevan berdasarkan keyword pesan
 *   4. Tool dari iterasi sebelumnya (jika ada observation)
 *   5. Padding dengan tool populer jika slot masih tersisa
 */

const { agentConfig } = require("../../config/agent.config");

const SKILL_KEYWORDS = [
  {
    skills: ["check-system-health"],
    pattern: /health|cek\s+status|cek\s+sistem|status\s+(?:sistem|platform|kesehatan|server)|status platform|diagnosis|doctor/i,
  },
  { skills: ["run-system-command"], pattern: /shell|bash|command|terminal|exec|perintah|jalankan|ping\b/i },
  { skills: ["manage-files"], pattern: /file|folder|direktori|baca|tulis|hapus|buat file/i },
  { skills: ["fetch-api-data"], pattern: /http|api call|fetch|curl|request|endpoint|rest api/i },
  {
    skills: ["search-web-info"],
    pattern: /cari|search|google|informasi web|riset web|browse|website|halaman/i,
  },
  { skills: ["query-database"], pattern: /database|sqlite|query|insert|select|tabel|db/i },
  { skills: ["search-codebase"], pattern: /cari kode|codebase|source code|grep code|refactor/i },
  { skills: ["run-sub-agent"], pattern: /sub.?agent|delegasi|spawn|paralel|anak agent/i },
  { skills: ["schedule-task"], pattern: /jadwal|schedule|cron|interval|reminder|pengingat/i },
  { skills: ["manage-plugin"], pattern: /plugin|clawhub|konfigurasi plugin|plugin config/i },
  { skills: ["send-notification"], pattern: /notifikasi|email|alert|kirim pesan/i },
  { skills: ["post-to-social"], pattern: /twitter|tweet|instagram|facebook|sosmed|posting/i },
  { skills: ["manage-container"], pattern: /docker|container|image|compose/i },
  { skills: ["monitor-market"], pattern: /harga|forex|crypto|market|pasar|chart/i },
  { skills: ["execute-trading"], pattern: /mt5|metatrader|order|buy|sell|mql5|ea\b|trading live/i },
];

// Tool yang selalu disertakan (core, ringan, sering dipakai)
const ALWAYS_INCLUDE = new Set([
  "time-tool",
  "doctor-tool",
]);

// Mapping keyword → nama tool yang relevan
const TOOL_KEYWORDS = [
  { tools: ["shell-tool"], pattern: /shell|bash|command|terminal|exec|run|script|perintah|jalankan/i },
  { tools: ["fs-tool"], pattern: /file|folder|direktori|baca|tulis|hapus|buat file|write|read|directory/i },
  { tools: ["browser-tool"], pattern: /browser|web|buka url|goto|screenshot|klik|scraping|website|halaman/i },
  { tools: ["web-search-tool"], pattern: /cari|search|google|duckduckgo|temukan informasi|riset cepat/i },
  { tools: ["http-tool"], pattern: /http|api call|fetch|curl|request|endpoint|rest api|webhook/i },
  { tools: ["docker-tool"], pattern: /docker|container|image|compose|k8s|kubernetes/i },
  { tools: ["cron-tool"], pattern: /jadwal|schedule|cron|interval|setiap|rutin|reminder|pengingat|otomatis/i },
  { tools: ["plugin-tool"], pattern: /plugin|install plugin|load plugin|clawhub|extension/i },
  { tools: ["tool-builder"], pattern: /buat tool|tool builder|buat plugin tool|generate tool|self.?tool|dynamic tool/i },
  { tools: ["plugin-config-tool"], pattern: /konfigurasi plugin|setting plugin|set api key|atur plugin|plugin config/i },
  { tools: ["sub-agent-tool"], pattern: /sub.?agent|spawn|delegasi|paralel|anak agent|child agent/i },
  { tools: ["database-tool"], pattern: /database|sqlite|query|insert|select|tabel|simpan data|db/i },
  { tools: ["genieacs-tool"], pattern: /genieacs|tr.?069|cpe|ont|onu|acs|cwmp|provisioning|device isp/i },
  { tools: ["social-media-tool"], pattern: /telegram|broadcast|twitter|tweet|posting|sosmed|social.media|instagram/i },
  { tools: ["notification-tool"], pattern: /notifikasi|email|kirim pesan|alert|pushover|mailgun|sendgrid/i },
  { tools: ["market-data-tool"], pattern: /harga|price|forex|saham|crypto|bitcoin|gold|xauusd|eurusd|market|pasar/i },
  { tools: ["mql5-tool"], pattern: /mql5|expert.advisor|ea|indicator|robot.trading|script.mt5|backtest/i },
  { tools: ["mt5-bridge-tool"], pattern: /mt5|metatrader|order|buy|sell|posisi|trading.live|broker/i },
  { tools: ["codebase-search-tool"], pattern: /cari kode|codebase|source code|fungsi|class|grep code/i },
];

/**
 * Pilih tool yang relevan berdasarkan pesan dan konteks.
 *
 * @param {object[]} allTools - Semua tool dari registry (dengan name, description, parameters)
 * @param {string} message - Pesan user
 * @param {object} options
 * @param {string[]} options.requiredTools - Tool yang wajib disertakan
 * @param {string[]} options.previousTools - Tool yang dipakai di iterasi sebelumnya
 * @param {number} options.maxTools - Batas jumlah tool (default dari config)
 * @returns {object[]} - Subset tool schemas yang relevan
 */
/**
 * Gabungkan schema tool + skill untuk prompt planner (skill = task-oriented layer).
 */
function mergePlannerSchemas(toolSchemas = [], skillSchemas = []) {
  const tools = (toolSchemas || []).map(s => ({ ...s, plannerKind: "tool" }));
  const skills = (skillSchemas || []).map(s => ({
    ...s,
    plannerKind: "skill",
    name: s.name,
    description: `[SKILL] ${s.description || s.name}`,
  }));
  return [...skills, ...tools];
}

function selectRelevantTools(allTools, message = "", options = {}) {
  if (!agentConfig.smartToolSelection) {
    return allTools;
  }

  const max = options.maxTools || agentConfig.maxToolsInPrompt || 8;
  const selected = new Set();
  const toolMap = new Map(allTools.map(t => [t.name, t]));

  // Layer 1: ALWAYS_INCLUDE
  for (const name of ALWAYS_INCLUDE) {
    if (toolMap.has(name)) selected.add(name);
  }

  // Layer 2: Tool wajib dari agent
  for (const name of (options.requiredTools || [])) {
    if (toolMap.has(name)) selected.add(name);
  }

  // Layer 3: Tool dari iterasi sebelumnya (agar agent bisa retry)
  for (const name of (options.previousTools || [])) {
    if (toolMap.has(name) && selected.size < max) selected.add(name);
  }

  // Layer 4: Keyword matching dari pesan (tools + skills)
  if (message) {
    for (const { tools, pattern } of TOOL_KEYWORDS) {
      if (selected.size >= max) break;
      if (pattern.test(message)) {
        for (const toolName of tools) {
          if (toolMap.has(toolName) && selected.size < max) {
            selected.add(toolName);
          }
        }
      }
    }
    for (const { skills, pattern } of SKILL_KEYWORDS) {
      if (selected.size >= max) break;
      if (pattern.test(message)) {
        for (const skillName of skills) {
          if (toolMap.has(skillName) && selected.size < max) {
            selected.add(skillName);
          }
        }
      }
    }

    // Skill mengalahkan tool rendah: jangan tawarkan shell-tool jika run-system-command dipilih
    if (selected.has("run-system-command") && selected.has("shell-tool")) {
      selected.delete("shell-tool");
    }
  }

  // Layer 5: Jika masih kurang dari minimum (4), tambah tool populer
  const fallbacks = ["shell-tool", "fs-tool", "http-tool", "web-search-tool", "browser-tool"];
  for (const name of fallbacks) {
    if (selected.size >= Math.min(4, max)) break;
    if (name === "shell-tool" && selected.has("run-system-command")) continue;
    if (toolMap.has(name)) selected.add(name);
  }

  const result = Array.from(selected)
    .map(name => toolMap.get(name))
    .filter(Boolean);

  return result;
}

/**
 * Ekstrak nama tool yang digunakan di iterasi sebelumnya dari observation buffer.
 */
function extractPreviousTools(observations = []) {
  return [...new Set(observations.map(o => o.tool).filter(Boolean))];
}

module.exports = { selectRelevantTools, extractPreviousTools, mergePlannerSchemas, SKILL_KEYWORDS };
