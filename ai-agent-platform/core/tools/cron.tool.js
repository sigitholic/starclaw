"use strict";

/**
 * Cron Tool — LLM-facing tool untuk menjadwalkan task otomatis.
 *
 * Agent bisa membuat, menghapus, dan mengelola cron jobs secara otonom.
 * Contoh: "jadwalkan cek website setiap 5 menit" → agent buat cron job.
 *
 * @param {object} cronManager — Instance dari createCronManager()
 */
function createCronTool(cronManager) {
  return {
    name: "cron-tool",
    description: "Kelola jadwal task otomatis (cron jobs). Bisa membuat jadwal berulang (interval) atau jadwal satu-kali (datetime). Interval format: '30s', '5m'. Datetime format: ISO8601.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'add' (buat job baru), 'remove' (hapus job), 'list' (daftar semua), 'enable' (aktifkan), 'disable' (nonaktifkan)"
        },
        name: {
          type: "string",
          description: "(untuk add) Nama deskriptif untuk job"
        },
        task: {
          type: "string",
          description: "(untuk add) Perintah/task yang akan dijalankan"
        },
        interval: {
          type: "string",
          description: "(untuk add rutin) Interval jadwal: '30s', '5m', '1h', '1d'"
        },
        datetime: {
          type: "string",
          description: "(untuk add 1-kali) Waktu spesifik eksekusi dalam format ISO8601 (contoh: 2026-03-30T15:37:00.000Z). Gunakan ini ATAU interval."
        },
        jobId: {
          type: "string",
          description: "(untuk remove/enable/disable) ID job"
        },
      },
      required: ["action"],
    },

    async run(input, globalInput) {
      // globalInput berisi data dari orchestrator (termasuk __chatId)
      const chatId = input.__chatId || (globalInput && globalInput.__chatId) || null;
      
      switch (input.action) {
        case "add": {
          if (!input.task) return { error: "Parameter 'task' wajib" };
          if (!input.interval && !input.datetime) return { error: "Harus menyertakan 'interval' (untuk rutin) atau 'datetime' (untuk 1-kali)" };
          return cronManager.addJob({
            name: input.name || input.task.slice(0, 50),
            task: input.task,
            interval: input.interval,
            datetime: input.datetime,
            chatId,
          });
        }

        case "remove": {
          if (!input.jobId) return { error: "Parameter 'jobId' wajib" };
          return cronManager.removeJob(input.jobId);
        }

        case "list": {
          const jobs = cronManager.listJobs();
          return {
            success: true,
            jobs,
            total: jobs.length,
            active: jobs.filter(j => j.active).length,
            message: jobs.length > 0
              ? `${jobs.length} cron job (${jobs.filter(j => j.active).length} aktif)`
              : "Belum ada cron job. Buat dengan action 'add'.",
          };
        }

        case "enable": {
          if (!input.jobId) return { error: "Parameter 'jobId' wajib" };
          return cronManager.toggleJob(input.jobId, true);
        }

        case "disable": {
          if (!input.jobId) return { error: "Parameter 'jobId' wajib" };
          return cronManager.toggleJob(input.jobId, false);
        }

        default:
          return { error: `Action '${input.action}' tidak dikenal. Pilih: add, remove, list, enable, disable` };
      }
    },
  };
}

module.exports = { createCronTool };
