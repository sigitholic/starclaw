"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Registry untuk skill runtime (JS) — membungkus tools tanpa mengubah definisi tool.
 * Skill names tidak boleh bentrok dengan tool names; skill memakai kebab-case tanpa suffix -tool.
 */
class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(skill) {
    if (!skill || typeof skill.name !== "string" || !skill.name.trim()) {
      throw new Error("Skill wajib punya name string");
    }
    if (typeof skill.run !== "function") {
      throw new Error(`Skill ${skill.name} wajib punya async run({ tools, input })`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name) {
    return this.skills.get(name);
  }

  has(name) {
    return this.skills.has(name);
  }

  list() {
    return Array.from(this.skills.keys());
  }

  getSkillList() {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: (s.description || "").split(".")[0] || s.name,
    }));
  }

  getSkillSchemas() {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description || "Skill tingkat tugas",
      parameters: s.parameters || { type: "object", properties: {} },
    }));
  }
}

/** skills/ di root workspace (sibling ai-agent-platform/) */
const DEFAULT_SKILLS_DIR = path.join(__dirname, "..", "..", "..", "skills");

/**
 * Muat skill runtime dari folder /skills:
 * - *.skill.js — konvensi lama
 * - *.js — konvensi baru (nama file = entry, tanpa .skill suffix); file .skill.js dimuat dulu lalu .js (override nama jika sama)
 */
function loadSkillsFromDir(dir = DEFAULT_SKILLS_DIR, registry = new SkillRegistry()) {
  if (!fs.existsSync(dir)) return registry;
  const names = fs.readdirSync(dir);
  const legacyFiles = names.filter(f => f.endsWith(".skill.js")).sort();
  const plainFiles = names.filter(f => f.endsWith(".js") && !f.endsWith(".skill.js")).sort();
  for (const file of [...legacyFiles, ...plainFiles]) {
    const full = path.join(dir, file);
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const mod = require(full);
    const exp = mod && mod.default ? mod.default : mod;
    if (exp && typeof exp.run === "function") {
      registry.register(exp);
    }
  }
  return registry;
}

function createDefaultSkillRegistry() {
  return loadSkillsFromDir();
}

/** Satu registry untuk app — skillRegistry.register(skill) menambah/menimpa skill di instance ini */
const skillRegistry = createDefaultSkillRegistry();

module.exports = {
  SkillRegistry,
  loadSkillsFromDir,
  createDefaultSkillRegistry,
  DEFAULT_SKILLS_DIR,
  skillRegistry,
};
