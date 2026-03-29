"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Cron Manager — Jadwalkan task otomatis untuk AI Agent.
 *
 * Fitur:
 *   - Cron-like scheduling (interval-based, bukan cron syntax — lebih simpel)
 *   - Persistent storage (survive restart)
 *   - Callback ke orchestrator/Telegram saat task dijalankan
 *   - Setiap job bisa mengirim hasil ke Telegram chat owner
 *
 * Supported interval format:
 *   "5m"  → tiap 5 menit
 *   "1h"  → tiap 1 jam
 *   "30s" → tiap 30 detik
 *   "1d"  → tiap 1 hari
 */
function createCronManager({ dataFilePath, onJobRun } = {}) {
  const resolvedPath = dataFilePath || path.join(process.cwd(), "data", "cron-jobs.json");
  const timers = new Map(); // jobId → setInterval handle
  let jobCounter = 0;

  // ===== Persistence =====
  function ensureFile() {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(resolvedPath)) {
      fs.writeFileSync(resolvedPath, JSON.stringify({ jobs: [] }, null, 2), "utf-8");
    }
  }

  function readJobs() {
    ensureFile();
    try {
      const data = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
      return data.jobs || [];
    } catch { return []; }
  }

  function writeJobs(jobs) {
    ensureFile();
    fs.writeFileSync(resolvedPath, JSON.stringify({ jobs, updatedAt: new Date().toISOString() }, null, 2), "utf-8");
  }

  // ===== Interval Parsing =====
  function parseInterval(str) {
    if (!str) return null;
    const match = String(str).match(/^(\d+)\s*(s|m|h|d)$/i);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    switch (match[2].toLowerCase()) {
      case "s": return val * 1000;
      case "m": return val * 60 * 1000;
      case "h": return val * 3600 * 1000;
      case "d": return val * 86400 * 1000;
      default: return null;
    }
  }

  function formatInterval(ms) {
    if (ms >= 86400000) return `${ms / 86400000}d`;
    if (ms >= 3600000) return `${ms / 3600000}h`;
    if (ms >= 60000) return `${ms / 60000}m`;
    return `${ms / 1000}s`;
  }

  // ===== Job Execution =====
  function startJobTimer(job) {
    if (timers.has(job.id)) return; // sudah berjalan
    if (!job.enabled) return;

    // Tipe 1: Interval (berulang)
    if (job.interval) {
      const intervalMs = parseInterval(job.interval);
      if (!intervalMs) return;

      const handle = setInterval(async () => {
        executeJob(job);
      }, intervalMs);
      
      timers.set(job.id, { type: "interval", handle });
    } 
    // Tipe 2: Datetime (satu kali eksekusi)
    else if (job.datetime) {
      const targetTime = new Date(job.datetime).getTime();
      const delay = targetTime - Date.now();

      // Jika waktu sudah lewat, disable job dan jangan jalankan lagi
      if (delay <= 0) {
        job.enabled = false;
        job.lastError = "Waktu eksekusi sudah terlewat saat sistem dimuat.";
        const jobs = readJobs();
        const idx = jobs.findIndex(j => j.id === job.id);
        if (idx >= 0) {
          jobs[idx] = job;
          writeJobs(jobs);
        }
        return;
      }

      console.log(`[CronManager] Job satu-kali '${job.name}' dijadwalkan dalam ${Math.round(delay/1000)}s`);
      const handle = setTimeout(async () => {
        await executeJob(job);
        // Setelah eksekusi satu kali, nonaktifkan job
        timers.delete(job.id);
        job.enabled = false;
        const jobs = readJobs();
        const idx = jobs.findIndex(j => j.id === job.id);
        if (idx >= 0) {
          jobs[idx] = job;
          writeJobs(jobs);
        }
      }, delay);

      timers.set(job.id, { type: "timeout", handle });
    }
  }

  async function executeJob(job) {
    job.lastRun = new Date().toISOString();
    job.runCount = (job.runCount || 0) + 1;

    console.log(`[CronManager] Menjalankan job '${job.name}' (run #${job.runCount})`);

    // Callback ke handler (orchestrator/Telegram)
    if (typeof onJobRun === "function") {
      try {
        await onJobRun(job);
      } catch (err) {
        console.error(`[CronManager] Job '${job.name}' error: ${err.message}`);
        job.lastError = err.message;
      }
    }

    // Update persistence
    const jobs = readJobs();
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx >= 0) {
      jobs[idx] = { ...jobs[idx], lastRun: job.lastRun, runCount: job.runCount, lastError: job.lastError || null };
      writeJobs(jobs);
    }
  }

  function stopJobTimer(jobId) {
    const timer = timers.get(jobId);
    if (timer) {
      if (timer.type === "interval") clearInterval(timer.handle);
      if (timer.type === "timeout") clearTimeout(timer.handle);
      timers.delete(jobId);
    }
  }

  // ===== Public API =====
  return {
    /**
     * Set handler eksekusi job (dipanggil saat startup/inisialisasi app).
     */
    setJobHandler(handler) {
      onJobRun = handler;
    },

    /**
     * Tambah cron job baru.
     * @param {object} opts - { name, task, interval, datetime, chatId, enabled }
     */
    addJob({ name, task, interval, datetime, chatId = null, enabled = true }) {
      let ms = null;
      if (interval) {
        ms = parseInterval(interval);
        if (!ms) return { success: false, error: `Format interval tidak valid: '${interval}'. Gunakan: 30s, 5m, 1h, 1d` };
        if (ms < 10000) return { success: false, error: "Interval minimum 10 detik (10s)" };
      } else if (datetime) {
        const targetTime = new Date(datetime).getTime();
        if (isNaN(targetTime)) return { success: false, error: `Format datetime tidak valid: '${datetime}'. Gunakan format ISO8601.` };
        if (targetTime <= Date.now()) return { success: false, error: "Waktu penjadwalan harus di masa depan." };
      } else {
        return { success: false, error: "Harus menentukan 'interval' atau 'datetime'" };
      }

      const jobs = readJobs();
      const id = `job-${++jobCounter}-${Date.now()}`;

      const job = {
        id,
        name: name || `Job ${id}`,
        task,
        interval: interval || null,
        intervalMs: ms,
        datetime: datetime || null,
        chatId,
        enabled,
        createdAt: new Date().toISOString(),
        lastRun: null,
        runCount: 0,
        lastError: null,
      };

      jobs.push(job);
      writeJobs(jobs);

      if (enabled) startJobTimer(job);

      return {
        success: true,
        job: { id, name: job.name, interval, datetime, task, enabled },
        message: interval 
          ? `Cron job '${job.name}' dibuat! Berjalan setiap ${interval}.`
          : `Tugas satu kali '${job.name}' dijadwalkan pada ${new Date(datetime).toLocaleString()}.`,
      };
    },

    /**
     * Hapus cron job.
     */
    removeJob(jobId) {
      stopJobTimer(jobId);
      const jobs = readJobs().filter(j => j.id !== jobId);
      writeJobs(jobs);
      return { success: true, message: `Job '${jobId}' dihapus.` };
    },

    /**
     * Enable/disable job.
     */
    toggleJob(jobId, enabled) {
      const jobs = readJobs();
      const job = jobs.find(j => j.id === jobId);
      if (!job) return { success: false, error: `Job '${jobId}' tidak ditemukan` };

      job.enabled = enabled;
      writeJobs(jobs);

      if (enabled) {
        startJobTimer(job);
      } else {
        stopJobTimer(jobId);
      }

      return { success: true, message: `Job '${job.name}' ${enabled ? "diaktifkan" : "dinonaktifkan"}.` };
    },

    /**
     * Daftar semua jobs.
     */
    listJobs() {
      return readJobs().map(j => ({
        id: j.id,
        name: j.name,
        task: j.task,
        interval: j.interval,
        datetime: j.datetime,
        type: j.datetime ? "one-off" : "recurring",
        enabled: j.enabled,
        lastRun: j.lastRun,
        runCount: j.runCount || 0,
        lastError: j.lastError || null,
        active: timers.has(j.id),
      }));
    },

    /**
     * Mulai semua job yang enabled (dipanggil saat startup).
     */
    startAll() {
      const jobs = readJobs();
      let started = 0;
      for (const job of jobs) {
        if (job.enabled) {
          startJobTimer(job);
          started++;
        }
      }
      console.log(`[CronManager] ${started}/${jobs.length} cron jobs dimulai`);
      return started;
    },

    /**
     * Stop semua timer (graceful shutdown).
     */
    stopAll() {
      for (const [id] of timers) {
        stopJobTimer(id);
      }
    },

    get activeCount() { return timers.size; },
    get totalCount() { return readJobs().length; },
    formatInterval,
    parseInterval,
  };
}

const cronManager = createCronManager();

module.exports = { createCronManager, cronManager };
