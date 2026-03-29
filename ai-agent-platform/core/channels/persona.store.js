"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Persona Store — simpan konfigurasi persona (nama, karakter, skill, panggilan)
 * per chat Telegram. Persist ke JSON file.
 *
 * Schema per chatId:
 * {
 *   agentName: "Jarvis",
 *   character: "ramah, profesional, humoris",
 *   skills: "web scraping, coding, analisis data",
 *   ownerCallSign: "Boss",
 *   onboardingStep: "done" | "awaiting_name" | "awaiting_character" | "awaiting_skills" | "awaiting_callsign",
 *   createdAt: "2026-...",
 *   updatedAt: "2026-..."
 * }
 */
function createPersonaStore({ dataFilePath } = {}) {
  const resolvedPath = dataFilePath || path.join(process.cwd(), "data", "persona.json");

  function ensureFile() {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(resolvedPath)) {
      fs.writeFileSync(resolvedPath, JSON.stringify({}, null, 2), "utf-8");
    }
  }

  function readAll() {
    ensureFile();
    try {
      return JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
    } catch {
      return {};
    }
  }

  function writeAll(data) {
    ensureFile();
    fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    /**
     * Ambil persona untuk chatId tertentu.
     */
    get(chatId) {
      const all = readAll();
      return all[String(chatId)] || null;
    },

    /**
     * Set/update field persona.
     */
    set(chatId, updates) {
      const all = readAll();
      const key = String(chatId);
      const existing = all[key] || { createdAt: new Date().toISOString() };
      all[key] = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      writeAll(all);
      return all[key];
    },

    /**
     * Cek apakah onboarding sudah selesai.
     */
    isOnboarded(chatId) {
      const persona = this.get(chatId);
      return persona && persona.onboardingStep === "done";
    },

    /**
     * Ambil step onboarding saat ini.
     */
    getOnboardingStep(chatId) {
      const persona = this.get(chatId);
      return persona ? persona.onboardingStep || null : null;
    },

    /**
     * Hapus persona.
     */
    delete(chatId) {
      const all = readAll();
      delete all[String(chatId)];
      writeAll(all);
    },

    /**
     * Build system prompt dari persona.
     */
    buildSystemContext(chatId) {
      const persona = this.get(chatId);
      if (!persona || persona.onboardingStep !== "done") {
        return null;
      }
      return {
        agentName: persona.agentName || "Starclaw",
        character: persona.character || "profesional dan membantu",
        skills: persona.skills || "general assistant",
        ownerCallSign: persona.ownerCallSign || "Kak",
        prompt: [
          `Nama kamu adalah ${persona.agentName || "Starclaw"}.`,
          `Karakter kamu: ${persona.character || "profesional dan membantu"}.`,
          `Skill utama kamu: ${persona.skills || "general assistant"}.`,
          `Panggil user dengan sebutan "${persona.ownerCallSign || "Kak"}".`,
          `Selalu gunakan persona ini dalam setiap respons. Jangan pernah keluar dari karakter.`,
        ].join("\n"),
      };
    },

    filePath: resolvedPath,
  };
}

module.exports = { createPersonaStore };
