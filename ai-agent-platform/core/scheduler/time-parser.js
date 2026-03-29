"use strict";

/**
 * Time Parser — Parse waktu natural language (Indonesia) ke Date object.
 *
 * Menangani format:
 *   - "2 menit lagi" / "5 menit lagi" / "1 jam lagi"
 *   - "pukul 4:23" / "jam 16:30" / "pukul 04:05"
 *   - "nanti pukul 4:23" / "nanti jam 10"
 *
 * Semua kalkulasi menggunakan WIB (UTC+7).
 */

function getWIBNow() {
  const now = new Date();
  const wibOffset = 7 * 60; // WIB = UTC+7
  return new Date(now.getTime() + (wibOffset + now.getTimezoneOffset()) * 60000);
}

function pad(n) { return String(n).padStart(2, "0"); }

function toWIBISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}+07:00`;
}

/**
 * Parse pesan natural language Indonesia menjadi info penjadwalan.
 *
 * @param {string} text - Pesan user
 * @returns {{ type: 'relative'|'absolute'|null, datetime: string|null, delayMs: number|null, task: string|null }}
 */
function parseTimeFromMessage(text) {
  if (!text || typeof text !== "string") return { type: null };

  const lower = text.toLowerCase().trim();

  // ===== Pattern 1: Relative — "X menit/jam/detik lagi" =====
  const relativeMatch = lower.match(/(\d+)\s*(menit|jam|detik|second|minute|hour)\s*(lagi|kedepan|kemudian|dari\s*sekarang)?/i);
  if (relativeMatch) {
    const val = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    let delayMs = 0;

    switch (unit) {
      case "detik": case "second": delayMs = val * 1000; break;
      case "menit": case "minute": delayMs = val * 60 * 1000; break;
      case "jam": case "hour": delayMs = val * 3600 * 1000; break;
    }

    if (delayMs > 0) {
      const targetDate = new Date(Date.now() + delayMs);
      // Konversi ke WIB
      const wibTarget = new Date(targetDate.getTime() + (7 * 60 + targetDate.getTimezoneOffset()) * 60000);

      // Ekstrak task dari pesan (hapus bagian waktu)
      const task = extractTask(text, relativeMatch[0]);

      return {
        type: "relative",
        datetime: toWIBISO(wibTarget),
        delayMs,
        task: task || "Pengingat",
        humanTime: `${val} ${unit} lagi`,
      };
    }
  }

  // ===== Pattern 2: Absolute — "pukul HH:MM" / "jam HH:MM" / "jam H" =====
  const absoluteMatch = lower.match(/(?:pukul|jam|at)\s*(\d{1,2})(?::(\d{2}))?/i);
  if (absoluteMatch) {
    let hours = parseInt(absoluteMatch[1], 10);
    const minutes = absoluteMatch[2] ? parseInt(absoluteMatch[2], 10) : 0;

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return { type: null };
    }

    const wibNow = getWIBNow();
    const target = new Date(wibNow);
    target.setHours(hours, minutes, 0, 0);

    // Jika waktu sudah lewat hari ini, jadwalkan besok
    if (target <= wibNow) {
      target.setDate(target.getDate() + 1);
    }

    // Hitung delay dari sekarang
    const delayMs = target.getTime() - wibNow.getTime();

    // Ekstrak task dari pesan (hapus bagian waktu)
    const task = extractTask(text, absoluteMatch[0]);

    return {
      type: "absolute",
      datetime: toWIBISO(target),
      delayMs,
      task: task || "Pengingat",
      humanTime: `pukul ${pad(hours)}:${pad(minutes)} WIB`,
    };
  }

  return { type: null };
}

/**
 * Ekstrak bagian "task" dari pesan setelah menghapus bagian waktu.
 * Contoh: "ingatkan saya 2 menit lagi untuk makan" → "makan"
 */
function extractTask(text, timeFragment) {
  // Hapus kata-kata pengingat dan waktu
  let cleaned = text
    .replace(timeFragment, "")
    .replace(/ingatkan\s*(saya|aku|gue)?\s*/gi, "")
    .replace(/tolong\s*/gi, "")
    .replace(/reminder\s*/gi, "")
    .replace(/nanti\s*/gi, "")
    .replace(/untuk\s*/gi, "")
    .replace(/bahwa\s*/gi, "")
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned || null;
}

/**
 * Cek apakah pesan adalah permintaan pengingat/penjadwalan.
 */
function isReminderRequest(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  const keywords = ["ingatkan", "reminder", "jadwalkan", "jadwal", "schedule"];
  const timeWords = ["menit", "jam", "detik", "pukul", "nanti"];
  
  const hasKeyword = keywords.some(k => lower.includes(k));
  const hasTimeWord = timeWords.some(t => lower.includes(t));
  
  return hasKeyword && hasTimeWord;
}

module.exports = { parseTimeFromMessage, isReminderRequest, getWIBNow, toWIBISO };
