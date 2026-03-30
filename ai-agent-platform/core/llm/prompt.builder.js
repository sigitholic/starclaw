"use strict";

const { autoLoadSkills } = require("../skills/skill.loader");
const { agentConfig } = require("../../config/agent.config");

// Instruksi format respons yang diinjeksi ke semua prompt
const RESPONSE_FORMAT_INSTRUCTION = `
═══ FORMAT RESPONS WAJIB ═══
Saat kamu memberikan jawaban akhir (action: respond), WAJIB gunakan format berikut:

[STATUS]
✅ Berhasil <judul singkat>  |  ❌ Gagal <judul singkat>  |  ⚠️ <judul singkat>

[RINGKASAN]
1-2 kalimat penjelasan hasil

[DETAIL]
• poin 1
• poin 2
• poin 3

[AKSI]
Apa yang bisa dilakukan user selanjutnya

Contoh BENAR:
✅ Berhasil mengambil 5 perangkat GenieACS

📋 Ringkasan:
5 perangkat ditemukan, 3 online dan 2 offline

📌 Detail:
• 🟢 ONT-001 — Online
• 🔴 ONT-002 — Offline (last seen 2 jam lalu)
• 🟢 Router-003 — Online

➡️ Aksi:
Ketik "reboot device ONT-002" untuk restart perangkat offline

DILARANG: Memberikan paragraf panjang tanpa struktur di atas.
`.trim();

function createPromptBuilder() {
  function formatRecentContext(context) {
    if (!context || !Array.isArray(context.recent) || context.recent.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      context.recent.map((entry) => {
        if (entry.role === "tool") {
          return {
            role: "tool",
            name: entry.name,
            content: entry.content,
          };
        }
        let toolLogs = "";
        if (entry.execution && Array.isArray(entry.execution.outputs) && entry.execution.outputs.length > 0) {
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
          kind: t.plannerKind || (t.name && t.name.endsWith("-tool") ? "tool" : "skill"),
          description: t.description || "",
          parameters: t.parameters || {},
        })),
        null, 2
      );

      // Daftar nama tool/skill saja — untuk reinforcement di prompt
      const toolNameList = toolSchemas.map(t => `"${t.name}"`).join(", ");

      const instructions = `
OUTPUT WAJIB: JSON murni, tanpa teks tambahan, tanpa markdown code block.

═══ PILIHAN: SKILL vs TOOL (WAJIB: SKILL DULU) ═══
- LANGKAH 1: Cek daftar [AVAILABLE] — jika ada skill (kind "skill") yang cocok dengan maksud user, WAJIB pakai action "skill" dengan skill_name tersebut.
- SKILL: tugas tingkat pengguna; memetakan ke tool internal. UTAMAKAN untuk perintah shell/terminal/ping/exec → skill "run-system-command", BUKAN "shell-tool" langsung.
- TOOL: eksekusi rendah (kind "tool"). Hanya jika TIDAK ADA skill yang cocok.
- LARANGAN: Jangan pilih "shell-tool" untuk perintah user biasa (ping, jalankan perintah, dll.) — gunakan skill "run-system-command" jika tersedia.

═══ ATURAN NAMA (WAJIB DIPATUHI) ═══
1. Untuk action "tool": field "tool_name" HARUS nama EKSAK dari daftar [AVAILABLE] dengan kind tool
2. Untuk action "skill": field "skill_name" HARUS nama EKSAK dari daftar [AVAILABLE] dengan kind skill
3. DILARANG mengarang nama yang tidak ada di daftar
4. DILARANG menggunakan nama parsial: "genieacs" SALAH → "genieacs-tool" BENAR
5. Nama yang valid termasuk: [${toolNameList}]

═══ FORMAT OUTPUT (pilih SATU) ═══

▸ FORMAT A — Eksekusi 1 tool (langsung):
{ "action": "tool", "tool_name": "<nama_eksak_tool>", "step_name": "<deskripsi>", "input": { <params> }, "summary": "..." }

▸ FORMAT A2 — Eksekusi 1 skill (disarankan untuk tugas kompleks):
{ "action": "skill", "skill_name": "<nama_eksak_skill>", "step_name": "<deskripsi>", "input": { <params> }, "summary": "..." }

▸ FORMAT B — Eksekusi BEBERAPA langkah (tool dan/atau skill):
{ "action": "multi-tool", "steps": [ { "action": "skill", "skill_name": "<skill_1>", "input": {} }, { "action": "tool", "tool_name": "<tool_2>", "input": {} } ], "summary": "..." }

▸ FORMAT C — Respond langsung (HANYA jika tugas 100% selesai):
{ "action": "respond", "response": "<teks jawaban final>", "summary": "Tugas selesai" }

▸ FORMAT D — Plan terstruktur (instruksi kompleks):
{ "type": "plan", "steps": [ { "action": "skill", "skill": "<nama_skill>", "input": {} }, { "action": "tool", "tool": "<nama_tool>", "input": {} } ] }

LARANGAN KERAS: Jangan gunakan FORMAT C untuk menjawab "sedang mengerjakan". Jika masih ada langkah eksekusi, WAJIB gunakan FORMAT A, A2, B, atau D.
LARANGAN KERAS: Setiap step dalam FORMAT B dan D HARUS punya "tool_name"/"tool" untuk action tool, atau "skill_name"/"skill" untuk action skill.

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
        `[AVAILABLE — Gunakan nama PERSIS; untuk skill pakai field "skill_name", untuk tool pakai "tool_name"]`,
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
        `Execution step (workflow): ${typeof input.__stepCount === "number" ? input.__stepCount : 1} / ${agentConfig.maxExecutionSteps || 5}`,
        (() => {
          const sm = input && input.__shortMemory;
          if (!sm || typeof sm !== "object" || Object.keys(sm).length === 0) return "";
          return `Short-term session memory (facts; reuse for follow-ups like "lagi" / "yang tadi"): ${JSON.stringify(sm)}`;
        })(),
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

      // Inject format respons — selalu ada di setiap prompt
      parts.push("");
      parts.push(RESPONSE_FORMAT_INSTRUCTION);

      parts.push(`User message: ${typeof input.message === "string" ? input.message : ""}`);

      return parts.join("\n");
    },
  };
}

module.exports = { createPromptBuilder };
