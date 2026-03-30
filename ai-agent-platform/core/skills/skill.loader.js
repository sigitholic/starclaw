"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Skill Loader — Sistem skills ala OpenClaw untuk Starclaw.
 *
 * Skills adalah file Markdown yang diinjeksi ke system prompt LLM,
 * mengajarkan agent KAPAN dan BAGAIMANA menggunakan tools secara efektif.
 *
 * Hierarki pencarian skill (prioritas tinggi ke rendah):
 *   1. skills/custom/     — skill buatan user (prioritas tertinggi)
 *   2. skills/            — skill bawaan platform
 *   3. skills/shared/     — skill shared antar agent
 *
 * Skill aktif ditentukan berdasarkan:
 *   - Nama agent
 *   - Keyword dalam pesan user
 *   - Daftar skill yang dikonfigurasi per-agent
 */

const SKILLS_DIR = path.resolve(process.cwd(), "skills");
const SKILL_CACHE = new Map(); // path → content

function loadSkillFile(filePath) {
  if (SKILL_CACHE.has(filePath)) return SKILL_CACHE.get(filePath);
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    SKILL_CACHE.set(filePath, content);
    return content;
  } catch (_) {
    return null;
  }
}

/**
 * Parse frontmatter YAML sederhana dari SKILL.md.
 * Format:
 *   ---
 *   name: skill-name
 *   requires:
 *     env: [VAR1, VAR2]
 *   ---
 */
function parseSkillFrontmatter(content) {
  if (!content || !content.startsWith("---")) return {};
  const end = content.indexOf("---", 3);
  if (end === -1) return {};
  const yaml = content.slice(3, end).trim();
  const meta = {};
  for (const line of yaml.split("\n")) {
    const match = line.match(/^\s*([\w-]+)\s*:\s*(.+)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      // Parse simple array: [VAR1, VAR2]
      if (val.startsWith("[")) {
        meta[key] = val.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
      } else {
        meta[key] = val;
      }
    }
  }
  return meta;
}

/**
 * Cek apakah skill memenuhi syarat (requires.env terpenuhi dari plugin config atau process.env).
 */
function isSkillEligible(filePath) {
  const content = loadSkillFile(filePath);
  if (!content) return false;
  const meta = parseSkillFrontmatter(content);
  const requiresEnv = Array.isArray(meta["requires.env"]) ? meta["requires.env"] : [];
  // Skill eligible jika semua required env tersedia
  return requiresEnv.every(envKey => !!process.env[envKey]);
}

function findSkillFile(name) {
  const candidates = [
    path.join(SKILLS_DIR, "custom", `${name}.skill.md`),
    path.join(SKILLS_DIR, `${name}.skill.md`),
    path.join(SKILLS_DIR, "shared", `${name}.skill.md`),
    path.join(SKILLS_DIR, name, "SKILL.md"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function listAvailableSkills() {
  const skills = new Set();
  const dirs = [
    SKILLS_DIR,
    path.join(SKILLS_DIR, "custom"),
    path.join(SKILLS_DIR, "shared"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(".skill.md")) {
        skills.add(file.replace(".skill.md", ""));
      }
    }
  }
  return Array.from(skills);
}

/**
 * Deteksi skill yang relevan berdasarkan konten pesan user.
 * Digunakan untuk auto-inject skill tanpa konfigurasi manual.
 */
const SKILL_KEYWORDS = {
  "genieacs":     /genieacs|tr.?069|cwmp|acs|cpe|ont|onu|router|device.manag/i,
  "social-media": /twitter|tweet|instagram|facebook|sosmed|social.media|posting|konten|caption|schedule.post/i,
  "coding":       /code|coding|program|debug|script|javascript|python|function|class|bug|error|refactor/i,
  "server-ops":   /server|nginx|docker|systemd|service|deploy|linux|bash|port|firewall|ssl|ssh|cpu|memory|disk/i,
  "data-analysis":/analisis|analyz|statistik|grafik|csv|excel|data.processing|correlation|dataset/i,
  "networking":   /ip|subnet|vlan|bgp|ospf|mikrotik|switch|firewall|ping|traceroute|bandwidth|latency/i,
  "research":     /riset|research|cari informasi|temukan|investigasi|kumpulkan data|competitive/i,
  "trading":      /trading|trader|forex|saham|crypto|bitcoin|gold|xauusd|eurusd|gbpusd|mt5|metatrader|ea|expert.advisor|mql5|indikator|rsi|macd|moving.average|bollinger|candlestick|teknikal|fundamental|order|buy|sell|lot|pips|stop.loss|take.profit|backtest|robot.trading/i,
  "coding":       /plugin baru|buat plugin|create plugin|plugin config|setting plugin|konfigurasi plugin/i,
};

function detectRelevantSkills(message) {
  if (!message || typeof message !== "string") return [];
  const detected = [];
  for (const [skillName, pattern] of Object.entries(SKILL_KEYWORDS)) {
    if (pattern.test(message)) {
      detected.push(skillName);
    }
  }
  return detected;
}

/**
 * Load dan gabungkan skills menjadi satu blok teks untuk diinjeksi ke prompt.
 *
 * @param {string[]} skillNames - Nama-nama skill yang ingin diload
 * @returns {string} - Teks gabungan semua skill, siap diinjeksi ke prompt
 */
function loadSkills(skillNames = []) {
  if (!skillNames || skillNames.length === 0) return "";

  const blocks = [];
  for (const name of skillNames) {
    const filePath = findSkillFile(name);
    if (!filePath) continue;
    const content = loadSkillFile(filePath);
    if (content) {
      blocks.push(`\n--- SKILL: ${name.toUpperCase()} ---\n${content.trim()}\n`);
    }
  }

  if (blocks.length === 0) return "";
  return `\n[INJECTED SKILLS — Gunakan panduan ini saat relevan dengan task]\n${blocks.join("\n")}`;
}

/**
 * Auto-load skills berdasarkan pesan user + skill wajib agent.
 *
 * @param {string} message - Pesan user
 * @param {string[]} agentSkills - Skill yang selalu diload untuk agent ini
 * @returns {string} - Teks skill untuk diinjeksi ke prompt
 */
function autoLoadSkills(message, agentSkills = []) {
  const detected = detectRelevantSkills(message);
  const allSkills = Array.from(new Set([...agentSkills, ...detected]));
  return loadSkills(allSkills);
}

/**
 * List semua skill beserta status (eligible/missing config).
 */
function listAvailableSkillsWithStatus() {
  const skills = listAvailableSkills();
  return skills.map(name => {
    const filePath = findSkillFile(name);
    const content = filePath ? loadSkillFile(filePath) : null;
    const meta = content ? parseSkillFrontmatter(content) : {};
    const requiresEnv = Array.isArray(meta["requires.env"]) ? meta["requires.env"] : [];
    const missingEnv = requiresEnv.filter(k => !process.env[k]);
    return {
      name,
      eligible: missingEnv.length === 0,
      requiresEnv,
      missingEnv,
    };
  });
}

module.exports = {
  loadSkills,
  autoLoadSkills,
  listAvailableSkills,
  listAvailableSkillsWithStatus,
  detectRelevantSkills,
  findSkillFile,
  isSkillEligible,
  parseSkillFrontmatter,
};
