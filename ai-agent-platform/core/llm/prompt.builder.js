"use strict";

const { autoLoadSkills } = require("../skills/skill.loader");

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

      // Format tool list sebagai structured JSON yang lebih mudah diparsing LLM
      // Setiap tool dengan nama EKSAK yang harus digunakan
      const toolsJson = JSON.stringify(
        toolSchemas.map(t => ({
          name: t.name,                                    // EKSAK — wajib digunakan persis ini
          description: t.description || "",
          parameters: t.parameters || {},
        })),
        null, 2
      );

      // Daftar nama tool saja — untuk reinforcement di prompt
      const toolNameList = toolSchemas.map(t => `"${t.name}"`).join(", ");

      const instructions = `
OUTPUT WAJIB: JSON murni, tanpa teks tambahan, tanpa markdown code block.

═══ ATURAN TOOL (WAJIB DIPATUHI) ═══
1. Field "tool_name" HARUS nama EKSAK dari daftar [AVAILABLE TOOLS] di bawah
2. DILARANG mengarang nama tool yang tidak ada di daftar
3. DILARANG menggunakan nama parsial: "genieacs" SALAH → "genieacs-tool" BENAR
4. DILARANG membuat step tanpa field "tool_name"
5. Tool yang valid: [${toolNameList}]

═══ FORMAT OUTPUT (pilih SATU) ═══

▸ FORMAT A — Eksekusi 1 tool:
{ "action": "tool", "tool_name": "<nama_eksak_tool>", "step_name": "<deskripsi>", "input": { <params> }, "summary": "..." }

▸ FORMAT B — Eksekusi BEBERAPA tool berurutan:
{ "action": "multi-tool", "steps": [ { "action": "tool", "tool_name": "<tool_1>", "input": {} }, { "action": "tool", "tool_name": "<tool_2>", "input": {} } ], "summary": "..." }

▸ FORMAT C — Respond langsung (HANYA jika tugas 100% selesai):
{ "action": "respond", "response": "<teks jawaban final>", "summary": "Tugas selesai" }

▸ FORMAT D — Plan terstruktur (untuk instruksi kompleks):
{ "type": "plan", "steps": [ { "action": "tool", "tool": "<nama_eksak_tool>", "input": {} }, { "action": "tool", "tool": "<nama_eksak_tool>", "input": {} } ] }

LARANGAN KERAS: Jangan gunakan FORMAT C untuk menjawab "sedang mengerjakan". Jika masih ada tool yang harus dijalankan, WAJIB gunakan FORMAT A, B, atau D.
LARANGAN KERAS: Setiap step dalam FORMAT B dan D HARUS punya field "tool_name" atau "tool".

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
        `[AVAILABLE TOOLS — Gunakan nama tool PERSIS seperti di bawah ini di field "tool_name"]`,
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

      // Injeksi skills yang relevan berdasarkan pesan user
      const agentSkills = input.__agentSkills || [];
      const skillsText = autoLoadSkills(typeof input.message === "string" ? input.message : "", agentSkills);
      if (skillsText) {
        parts.push(skillsText);
      }

      parts.push(`User message: ${typeof input.message === "string" ? input.message : ""}`);

      return parts.join("\n");
    },
  };
}

module.exports = { createPromptBuilder };
