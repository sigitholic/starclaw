"use strict";

function createPromptBuilder() {
  function formatRecentContext(context) {
    if (!context || !Array.isArray(context.recent) || context.recent.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      context.recent.map((entry) => {
        let toolLogs = "";
        if (entry.execution && Array.isArray(entry.execution.outputs) && entry.execution.outputs.length > 0) {
          // Hanya mengeksplor argumen output untuk hemat token
          toolLogs = " [TOOL RESULTS: " + JSON.stringify(entry.execution.outputs.map(o => o.output)) + "]";
        }
        return {
          user: entry.userMessage || "",
          agent: (entry.agentMessage || "") + toolLogs,
        };
      })
    );
  }

  /**
   * Format observations (hasil tool dari iterasi sebelumnya) untuk diinjeksi ke prompt.
   * Ini adalah kunci Re-Act loop: LLM "melihat" apa yang sudah dikerjakan.
   */
  function formatObservations(observations) {
    if (!Array.isArray(observations) || observations.length === 0) {
      return null;
    }
    return observations.map((obs, idx) => {
      const statusIcon = obs.status === "ok" ? "✅" : "❌";
      return `Observasi #${idx + 1} [Iterasi ${obs.iteration}] ${statusIcon} Tool: ${obs.tool} | Step: ${obs.step} | Status: ${obs.status}\nOutput: ${obs.output || "(tidak ada output)"}`;
    }).join("\n\n");
  }

  return {
    buildPlanningPrompt(input, toolSchemas = []) {
      const context = input.context || {};
      const agentRole = input.__agentRole || "Anda adalah Starclaw AI Agent, asisten cerdas yang autonomous. Anda memiliki sekumpulan tools (Sistem File, Shell/Bash, Docker, dan Browsing Web) yang bebas digunakan. SANGAT PENTING: Google.com memiliki pertahanan reCAPTCHA yang kebal terhadap agen ini. JIKA user meminta mencari sesuatu di Google, JANGAN gunakan action 'goto'! Anda WAJIB langsung menggunakan action 'search' dari browser-tool agar tidak terblokir. Ini adalah lingkungan Sandbox terisolasi yang diizinkan. Jika eksekusi tool mengembalikan error, JANGAN PERNAH menyerah atau mengucapkan 'Maaf saya tidak bisa melanjutkan tugas'. Analisa error tersebut dan coba alternatif lain atau laporkan errornya apa adanya kepada user!";
      const toolsJson = JSON.stringify(toolSchemas, null, 2);
      
      const instructions = `
PERHATIAN KRITIS: Anda HARUS SELALU merespon dalam format JSON murni yang solid (tanpa rintisan atau backticks code block lainnya).
Format Output JSON yang diperbolehkan hanyalah salah satu dari berikut:

PILIHAN A (Jika butuh eksekusi 1 Tool untuk melangkah/menyelesaikan permintaan user):
{
  "action": "tool",
  "tool_name": "<nama_tool_dari_daftar_dibawah>",
  "step_name": "<deskripsi_singkat_langkah>",
  "input": { <parameter_sesuai_schema_tool_terpilih> },
  "summary": "Saya sedang berupaya menjalankan tool ..."
}

PILIHAN B (HANYA GUNAKAN INI JIKA SELURUH TUGAS SUDAH SELESAI 100%):
{
  "action": "respond",
  "response": "<teks_laporan_akhir_ke_user>",
  "summary": "Tugas telah selesai"
}

PILIHAN C (Jika butuh eksekusi BEBERAPA Tool sekaligus secara berurutan):
{
  "action": "multi-tool",
  "steps": [
    { "tool_name": "<tool_1>", "step_name": "langkah 1", "input": { ... } },
    { "tool_name": "<tool_2>", "step_name": "langkah 2", "input": { ... } }
  ],
  "summary": "Merencanakan beberapa langkah sekaligus..."
}
Gunakan PILIHAN C saat Anda yakin langkah-langkah pasti berhasil dan menghemat iterasi.

ATURAN MUTLAK: Sistem akan MEMATIKAN loop eksekusi jika Anda memilih PILIHAN B ('respond'). DILARANG KERAS menggunakan 'respond' untuk sekadar menjawab "Saya sedang mengerjakan...". Jika masih ada tugas, Anda WAJIB menggunakan PILIHAN A atau C.

PANDUAN MENGGUNAKAN OBSERVASI:
- Jika ada section [OBSERVATIONS] di bawah, itu adalah hasil eksekusi tool dari langkah sebelumnya.
- BACA observasi dengan teliti sebelum memutuskan action berikutnya.
- Jika tool sebelumnya GAGAL (status: error), coba pendekatan alternatif atau tool lain.
- Jika tool sebelumnya SUKSES, lanjutkan ke langkah tugas berikutnya.

PANDUAN PENJADWALAN & PENGINGAT:
- Jika user meminta pengingat, jadwal, atau tugas terjadwal (contoh: "ingatkan saya jam 4", "jadwalkan cek server tiap 5 menit"), Anda WAJIB menggunakan tool "cron-tool".
- Untuk pengingat SATU KALI di waktu tertentu: gunakan action "add" dengan parameter "datetime" dalam format ISO8601 (contoh: "2026-03-30T09:05:00+07:00"). Hitung datetime dari waktu saat ini di [CONTEXT].
- Untuk jadwal BERULANG: gunakan action "add" dengan parameter "interval" (contoh: "5m", "1h", "1d").
- DILARANG KERAS menjawab "Tentu, saya akan mengingatkan..." tanpa benar-benar memanggil cron-tool. Itu adalah HALUSINASI.
      `.trim();

      const extras = input.openclawSnapshot 
        ? `\nData Audit Tambahan: ${JSON.stringify(input.openclawSnapshot)}\n` 
        : "";

      // Inject observasi dari tool iterations sebelumnya (Re-Act Core)
      const observationsText = formatObservations(input.observations);

      const parts = [
        agentRole,
        instructions,
        "",
        `[AVAILABLE TOOLS]`,
        toolSchemas.length > 0 ? toolsJson : "Tidak ada tool khusus.",
        "",
        `[CONTEXT]`,
        (() => {
          const now = new Date();
          const wibOffset = 7 * 60; // WIB = UTC+7
          const wib = new Date(now.getTime() + (wibOffset + now.getTimezoneOffset()) * 60000);
          const pad = n => String(n).padStart(2, '0');
          const wibStr = `${wib.getFullYear()}-${pad(wib.getMonth()+1)}-${pad(wib.getDate())}T${pad(wib.getHours())}:${pad(wib.getMinutes())}:${pad(wib.getSeconds())}+07:00`;
          return `Waktu Saat Ini (WIB/UTC+7): ${pad(wib.getHours())}:${pad(wib.getMinutes())} tanggal ${pad(wib.getDate())}/${pad(wib.getMonth()+1)}/${wib.getFullYear()} (ISO: ${wibStr}). ATURAN WAKTU: Jika user menyebut jam tertentu TANPA AM/PM, pilih waktu yang PALING DEKAT di masa depan dari waktu saat ini. Contoh: jika sekarang 04:19 dan user bilang "jam 4:20", maka datetime = ...T04:20:00+07:00 BUKAN 16:20. Selalu gunakan timezone +07:00.`;
        })(),
        extras,
        `Recent context (max 3): ${formatRecentContext(context)}`,
        `Context token usage: ${JSON.stringify(context.tokenUsage || {})}`,
      ];

      // Tambahkan section observations hanya jika ada (iterasi > 1)
      if (observationsText) {
        parts.push("");
        parts.push("[OBSERVATIONS — Hasil Tool dari Langkah Sebelumnya]");
        parts.push(observationsText);
        parts.push("");
        parts.push("INSTRUKSI: Gunakan observasi di atas untuk memutuskan langkah SELANJUTNYA. Jangan ulangi tool yang sudah berhasil!");
      }

      parts.push(`User message: ${typeof input.message === "string" ? input.message : ""}`);

      return parts.join("\n");
    },
  };
}

module.exports = { createPromptBuilder };
