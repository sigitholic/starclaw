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

module.exports = {
  loadSkills,
  autoLoadSkills,
  listAvailableSkills,
  detectRelevantSkills,
  findSkillFile,
};
