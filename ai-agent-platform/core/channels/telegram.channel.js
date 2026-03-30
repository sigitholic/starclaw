"use strict";

const fs = require("fs");
const path = require("path");
const { setTimeout: sleep } = require("timers/promises");
const EventEmitter = require("events");
const { createTelegramPairingStore } = require("./telegram.pairing.store");
const { createPersonaStore } = require("./persona.store");
const { createClawHubRegistry } = require("../plugins/clawhub.registry");
const { createPluginProcessManager } = require("../plugins/process.manager");
const { cronManager } = require("../scheduler/cron.manager");
const { parseTimeFromMessage, isReminderRequest } = require("../scheduler/time-parser");
const { EVENT_TYPES } = require("../events/event.types");
const { autoFormat, isAlreadyFormatted } = require("../utils/response.formatter");
const { formatResponse: formatAgentOutput } = require("../agent/formatter");
const { modelManager } = require("../llm/modelManager");

/**
 * Semua teks ke user: jangan kirim objek/JSON mentah — pakai formatter agent.
 */
function formatUserChannelMessage(message) {
  if (message != null && typeof message === "object") {
    return formatAgentOutput(message);
  }
  const s = message == null ? "" : String(message);
  const t = s.trim();
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === "object") {
        return formatAgentOutput(parsed);
      }
    } catch (_) {
      /* teks biasa */
    }
  }
  return s;
}

function createTelegramChannel({
  botToken,
  orchestrator,
  logger,
  pairingCode,
  pairingStorePath,
  pairingEnabled = true,
}) {
  const apiBase = `https://api.telegram.org/bot${botToken}`;
  const store = createTelegramPairingStore({ dataFilePath: pairingStorePath });
  const personaStore = createPersonaStore();
  const clawHub = createClawHubRegistry();
  const processManager = createPluginProcessManager();
  
  // Setup cron job handler
  cronManager.setJobHandler(async (job) => {
    if (!job.chatId) return;
    const persona = personaStore.get(job.chatId);
    try {
      if (typeof tgCall === "function") {
        if (job.isReminder) {
          // Pengingat sederhana: langsung kirim!
          await sendMessageToUser({
            chat_id: job.chatId,
            text: `🔔 *[PENGINGAT]* Waktunya: *${job.task}*!`,
            parse_mode: "Markdown"
          });
          return;
        }

        // Agent Task: biarkan LLM mengeksekusi secara silent
        const result = await orchestrator.run("platform-assistant", {
          message: `[CRON JOB TRIGGERED] Tolong jalankan tugas otomatis ini sekarang juga secara rahasia:\n\nTask: ${job.task}\n\nSetelah selesai, berikan laporan singkat mengenai hasilnya kepada user.`,
          __agentName: persona ? persona.agentName : "Assistant",
          __chatId: job.chatId,
        });

        await sendMessageToUser({
          chat_id: job.chatId,
          text: `🤖 *[Laporan Eksekusi Otomatis: ${job.name}]*\n\n${result.finalResponse || result.summary || "Selesai."}`,
          parse_mode: "Markdown"
        });
      }
    } catch (err) {
      if (typeof tgCall === "function") {
        await sendMessageToUser({
          chat_id: job.chatId,
          text: `❌ *[Cron Error] ${job.name}*\n\nGagal dieksekusi: ${err.message}`,
          parse_mode: "Markdown"
        });
      }
    }
  });

  let running = false;
  let offset = 0;

  async function tgCallRaw(method, payload = {}) {
    const response = await fetch(`${apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API ${method} gagal: ${response.status} ${text}`);
    }

    const body = await response.json();
    if (!body.ok) {
      throw new Error(`Telegram API ${method} error: ${JSON.stringify(body)}`);
    }

    return body.result;
  }

  /**
   * Wrapper tgCall dengan auto-fallback ke plain text.
   * Jika Telegram menolak karena Markdown tidak valid (can't parse entities),
   * otomatis kirim ulang tanpa parse_mode — berlaku untuk SEMUA tgCall di channel ini.
   */
  async function tgCall(method, payload = {}) {
    try {
      return await tgCallRaw(method, payload);
    } catch (err) {
      const isParseError = err.message && (
        err.message.includes("can't parse entities") ||
        err.message.includes("Can't find end of the entity") ||
        err.message.includes("Bad Request: can't parse")
      );

      // Jika error entity parsing DAN payload pakai parse_mode → retry tanpa formatting
      if (isParseError && payload.parse_mode) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.parse_mode;
        return await tgCallRaw(method, fallbackPayload);
      }

      throw err;
    }
  }

  /**
   * Kirim pesan teks ke user — objek diformat; log baris final untuk debug.
   */
  async function sendMessageToUser(payload) {
    const p = { ...payload };
    if (Object.prototype.hasOwnProperty.call(p, "text")) {
      p.text = formatUserChannelMessage(p.text);
      console.log("FINAL USER MESSAGE:", p.text);
    }
    return tgCall("sendMessage", p);
  }

  async function editUserMessageText(payload) {
    const p = { ...payload };
    if (Object.prototype.hasOwnProperty.call(p, "text")) {
      p.text = formatUserChannelMessage(p.text);
      console.log("FINAL USER MESSAGE:", p.text);
    }
    return tgCall("editMessageText", p);
  }

  /**
   * Kirim pesan dengan Markdown, fallback ke plain text jika entity parsing gagal.
   * Ini mencegah error "can't parse entities" saat response AI mengandung
   * Markdown yang tidak lengkap (misal * atau _ yang tidak tertutup).
   */
  async function sendMarkdownToUser(chatId, text, messageIdToEdit = null) {
    const formatted = formatUserChannelMessage(text);
    const plainText = String(formatted || "").trim() || "(tidak ada respons)";

    // Coba dengan parse_mode Markdown
    try {
      if (messageIdToEdit) {
        return await editUserMessageText({
          chat_id: chatId,
          message_id: messageIdToEdit,
          text: plainText,
          parse_mode: "Markdown",
        });
      }
      return await sendMessageToUser({
        chat_id: chatId,
        text: plainText,
        parse_mode: "Markdown",
      });
    } catch (err) {
      // Jika gagal karena entity parsing — kirim ulang tanpa parse_mode
      const isParseError = err.message && (
        err.message.includes("can't parse entities") ||
        err.message.includes("Bad Request") ||
        err.message.includes("parse_mode")
      );
      if (!isParseError) throw err;

      // Fallback: kirim sebagai plain text (tanpa formatting)
      if (messageIdToEdit) {
        try {
          return await editUserMessageText({
            chat_id: chatId,
            message_id: messageIdToEdit,
            text: plainText,
          });
        } catch (_editErr) {
          // editMessageText gagal (misal pesan sudah terlalu lama) — kirim baru
          return await sendMessageToUser({ chat_id: chatId, text: plainText });
        }
      }
      return await sendMessageToUser({ chat_id: chatId, text: plainText });
    }
  }

  function buildOpenClawSnapshotFromText(text) {
    const lower = String(text || "").toLowerCase();
    return {
      modules: ["agent-core", "basic-tools", lower.includes("orchestrator") ? "orchestrator" : ""].filter(Boolean),
      observability: {
        tracing: lower.includes("tracing"),
        metrics: lower.includes("metrics"),
      },
      reliability: {
        retries: lower.includes("retries"),
        queue: lower.includes("queue"),
      },
      memory: {
        longTerm: lower.includes("long memory") || lower.includes("long-term"),
      },
    };
  }

  // =========================================================
  // ONBOARDING FLOW — Step-by-step persona creation
  // =========================================================
  async function handleOnboardingStep(chatId, text) {
    const chatIdStr = String(chatId);
    const step = personaStore.getOnboardingStep(chatIdStr);

    switch (step) {
      case "awaiting_name": {
        personaStore.set(chatIdStr, { agentName: text, onboardingStep: "awaiting_character" });
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `✨ Nama yang bagus! Mulai sekarang panggil aku *${text}*!\n\n` +
            `Sekarang, tentukan *karakter dan kepribadian* ku.\n` +
            `Contoh: "ramah, humoris, suka bercanda tapi tetap profesional" atau "serius, efisien, to the point"\n\n` +
            `Silakan ketik karakter yang kamu inginkan:`,
          parse_mode: "Markdown",
        });
        return true;
      }

      case "awaiting_character": {
        personaStore.set(chatIdStr, { character: text, onboardingStep: "awaiting_skills" });
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `💪 Karakter diterima!\n\n` +
            `Sekarang, tentukan *skill dan keahlian* utama yang harus aku kuasai.\n` +
            `Contoh: "web scraping, coding Python, analisis data, riset pasar" atau "trading, analisis teknikal, manajemen risiko"\n\n` +
            `Silakan ketik skill yang kamu inginkan:`,
          parse_mode: "Markdown",
        });
        return true;
      }

      case "awaiting_skills": {
        personaStore.set(chatIdStr, { skills: text, onboardingStep: "awaiting_callsign" });
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `🎯 Skill tercatat!\n\n` +
            `Terakhir, aku harus memanggil kamu dengan sebutan apa?\n` +
            `Contoh: "Boss", "Kak", "Master", "Bro", atau nama kamu langsung\n\n` +
            `Silakan ketik panggilan yang kamu mau:`,
          parse_mode: "Markdown",
        });
        return true;
      }

      case "awaiting_callsign": {
        personaStore.set(chatIdStr, { ownerCallSign: text, onboardingStep: "done" });
        const persona = personaStore.get(chatIdStr);
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `🎉 *Setup Selesai!*\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `🤖 *Nama:* ${persona.agentName}\n` +
            `🎭 *Karakter:* ${persona.character}\n` +
            `💡 *Skill:* ${persona.skills}\n` +
            `👤 *Panggilan:* ${persona.ownerCallSign}\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Halo ${persona.ownerCallSign}! Aku *${persona.agentName}* siap melayani kamu. ` +
            `Silakan kirim pesan apa saja dan aku akan merespons sesuai karakter ku.\n\n` +
            `Gunakan /reset\\_persona untuk mengatur ulang persona.`,
          parse_mode: "Markdown",
        });
        return true;
      }

      default:
        return false;
    }
  }

  // =========================================================
  // MESSAGE HANDLER UTAMA
  // =========================================================
  async function handleMessage(message) {
    const chatId = message?.chat?.id;
    const text = String(message?.text || "").trim();
    if (!chatId || !text) {
      return;
    }

    const chatIdStr = String(chatId);

    // /pair — pairing flow (sebelum semua)
    if (text.startsWith("/pair")) {
      if (!pairingEnabled) {
        await sendMessageToUser({ chat_id: chatId, text: "Mode pairing tidak aktif." });
        return;
      }

      const providedCode = text.replace(/^\/pair\s*/i, "").trim();
      if (!pairingCode) {
        await sendMessageToUser({ chat_id: chatId, text: "Pairing code belum dikonfigurasi di server." });
        return;
      }

      if (providedCode !== pairingCode) {
        await sendMessageToUser({ chat_id: chatId, text: "Pairing code salah." });
        return;
      }

      store.pair(chatIdStr);
      await sendMessageToUser({
        chat_id: chatId,
        text: `Pairing berhasil. Chat ${chatIdStr} sekarang terdaftar.`,
      });
      return;
    }

    if (text.startsWith("/unpair")) {
      store.unpair(chatIdStr);
      await sendMessageToUser({
        chat_id: chatId,
        text: `Chat ${chatIdStr} sudah dihapus dari daftar pairing.`,
      });
      return;
    }

    // /start harus diizinkan sebelum pengecekan pairing agar user baru bisa onboarding
    if (text === "/start") {
      // Jika pairing aktif dan belum paired, /start hanya tampilkan instruksi pairing
      if (pairingEnabled && !store.isPaired(chatIdStr)) {
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `👋 *Selamat datang!*\n\n` +
            `Bot ini memerlukan pairing untuk pertama kali.\n` +
            `Silakan gunakan kode akses yang diberikan admin:\n\n` +
            `/pair <kode_akses>`,
          parse_mode: "Markdown",
        });
        return;
      }
      personaStore.set(chatIdStr, { onboardingStep: "awaiting_name" });
      await sendMessageToUser({
        chat_id: chatId,
        text:
          `🌟 *Selamat Datang di AI Agent Platform Starclaw!*\n\n` +
          `Sepertinya aku baru saja dilahirkan! 🐣\n\n` +
          `Sebelum kita mulai, aku butuh kamu untuk mengatur identitas ku:\n\n` +
          `1️⃣ *Nama* — Mau kasih nama aku siapa?\n` +
          `2️⃣ *Karakter* — Kepribadian seperti apa?\n` +
          `3️⃣ *Skill* — Keahlian apa saja yang harus aku kuasai?\n` +
          `4️⃣ *Panggilan* — Aku harus memanggil kamu siapa?\n\n` +
          `Mari kita mulai! 🚀\n` +
          `*Mau kasih nama aku siapa?*`,
        parse_mode: "Markdown",
      });
      return;
    }

    // Semua command selain /pair, /unpair, /start wajib paired terlebih dahulu
    if (pairingEnabled && !store.isPaired(chatIdStr)) {
      await sendMessageToUser({
        chat_id: chatId,
        text: "Akses ditolak. Chat belum terdaftar.\nSilakan pairing dulu: /pair <code>",
      });
      return;
    }

    // /reset_persona — reset persona & mulai onboarding ulang
    if (text === "/reset_persona") {
      personaStore.delete(chatIdStr);
      personaStore.set(chatIdStr, { onboardingStep: "awaiting_name" });
      await sendMessageToUser({
        chat_id: chatId,
        text:
          `🔄 Persona direset!\n\n` +
          `Aku siap dibentuk ulang. *Mau kasih nama aku siapa?*`,
        parse_mode: "Markdown",
      });
      return;
    }

    // Cek apakah sedang dalam flow onboarding
    const onboardingStep = personaStore.getOnboardingStep(chatIdStr);
    if (onboardingStep && onboardingStep !== "done") {
      const handled = await handleOnboardingStep(chatId, text);
      if (handled) return;
    }

    // Jika belum pernah onboarding, arahkan ke /start
    if (!personaStore.isOnboarded(chatIdStr)) {
      await sendMessageToUser({
        chat_id: chatId,
        text: "Aku belum punya identitas! Ketik /start untuk memulai setup persona.",
      });
      return;
    }

    // /help
    if (text === "/help") {
      const persona = personaStore.get(chatIdStr);
      await sendMessageToUser({
        chat_id: chatId,
        text:
          `🤖 *${persona.agentName}* — Bantuan\n\n` +
          `*Command:*\n` +
          `/start — Setup ulang persona\n` +
          `/reset\\_persona — Reset identitas\n` +
          `/audit <teks> — Audit arsitektur\n` +
          `/noc — Trigger workflow NOC\n` +
          `/doctor — Cek kesehatan sistem\n` +
          `/help — Tampilkan bantuan ini\n\n` +
          `Atau kirim pesan biasa dan aku akan merespons, ${persona.ownerCallSign}!`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /model — set atau lihat model LLM aktif
    if (text.startsWith("/model")) {
      const sub = text.replace(/^\/model\s*/i, "").trim();
      if (!sub || sub === "get") {
        await sendMessageToUser({
          chat_id: chatId,
          text: `🧠 Model aktif: \`${modelManager.getModel()}\`\n\nDidukung:\n${modelManager.listSupported().map(m => `• \`${m}\``).join("\n")}\n\nContoh: /model set gemini-1.5-pro`,
          parse_mode: "Markdown",
        });
        return;
      }
      if (sub.startsWith("set ")) {
        const id = sub.replace(/^set\s+/i, "").trim();
        try {
          const set = modelManager.setModel(id);
          await sendMessageToUser({
            chat_id: chatId,
            text: `✅ Model diset ke: \`${set}\``,
            parse_mode: "Markdown",
          });
        } catch (e) {
          await sendMessageToUser({ chat_id: chatId, text: `❌ ${e.message}` });
        }
        return;
      }
      await sendMessageToUser({
        chat_id: chatId,
        text: "⚠️ Gunakan: /model get  atau  /model set <model-id>",
      });
      return;
    }

    // /status — tampilkan info persona & status platform
    if (text === "/status") {
      const persona = personaStore.get(chatIdStr);
      const uptimeSec = Math.floor(process.uptime());
      const mem = process.memoryUsage();
      await sendMessageToUser({
        chat_id: chatId,
        text:
          `📊 *Status Agent*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `🤖 *Nama:* ${persona.agentName}\n` +
          `🎭 *Karakter:* ${persona.character}\n` +
          `💡 *Skill:* ${persona.skills}\n` +
          `👤 *Panggilan:* ${persona.ownerCallSign}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `⏱ *Uptime:* ${Math.floor(uptimeSec / 3600)}j ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s\n` +
          `💾 *Memory:* ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB\n` +
          `🟢 *Node:* ${process.version}\n` +
          `━━━━━━━━━━━━━━━━━━━━━`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /plugin — manage plugins via Telegram
    if (text.startsWith("/plugin")) {
      const persona = personaStore.get(chatIdStr);
      const subCmd = text.replace(/^\/plugin\s*/i, "").trim().toLowerCase();

      // /plugin (tanpa argumen) — tampilkan menu plugin
      if (!subCmd) {
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `🔌 *Plugin Manager — ${persona.agentName}*\n\n` +
            `Gunakan command berikut:\n\n` +
            `/plugin list — Lihat plugin terinstall\n` +
            `/plugin store — Browse ClawHub Store\n` +
            `/plugin create <nama> — Buat plugin baru\n` +
            `/plugin install <github:user/repo> — Install dari GitHub\n` +
            `/plugin run <nama> — 🚀 Jalankan plugin app\n` +
            `/plugin stop <nama> — 🔴 Hentikan plugin app\n` +
            `/plugin proses — ⚡ List plugin process aktif\n` +
            `/plugin logs <nama> — 📋 Lihat logs plugin\n\n` +
            `Atau cukup minta aku secara natural:\n` +
            `_"Buatkan plugin untuk monitor website"_`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /plugin list
      if (subCmd === "list") {
        const pluginsDir = path.resolve(process.cwd(), "plugins");
        let folders = [];
        if (fs.existsSync(pluginsDir)) {
          folders = fs.readdirSync(pluginsDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && fs.existsSync(path.join(pluginsDir, d.name, "index.js")))
            .map(d => {
              try {
                const mod = require(path.join(pluginsDir, d.name, "index.js"));
                return `• *${mod.name || d.name}* v${mod.version || "?"} — ${mod.description || "Tanpa deskripsi"}`;
              } catch {
                return `• *${d.name}* — ⚠️ Error load`;
              }
            });
        }
        await sendMessageToUser({
          chat_id: chatId,
          text: folders.length > 0
            ? `🔌 *Plugin Terinstall (${folders.length}):*\n\n${folders.join("\n")}`
            : "📭 Belum ada plugin. Gunakan `/plugin create <nama>` atau `/plugin store`.",
          parse_mode: "Markdown",
        });
        return;
      }

      // /plugin store — browse ClawHub registry
      if (subCmd === "store") {
        const available = clawHub.listAvailable();
        const lines = available.map(p => {
          const status = p.installed ? "✅" : "⬜";
          return `${status} *${p.name}* — ${p.description}`;
        });
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `🏪 *ClawHub Plugin Store*\n\n` +
            lines.join("\n") + "\n\n" +
            `Install dari GitHub:\n` +
            `/plugin install github:user/repo`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /plugin create <nama>
      if (subCmd.startsWith("create ")) {
        const pluginName = subCmd.replace("create ", "").trim();
        if (!pluginName) {
          await sendMessageToUser({ chat_id: chatId, text: "⚠️ Format: /plugin create <nama_plugin>" });
          return;
        }
        const result = clawHub.createPluginTemplate(pluginName, {
          description: `Plugin ${pluginName} dibuat oleh ${persona.ownerCallSign}`,
        });
        await sendMessageToUser({
          chat_id: chatId,
          text: result.success
            ? `✅ Plugin *${pluginName}* berhasil dibuat!\n\nFile: \`plugins/${pluginName}/index.js\`\n\nEdit file tersebut untuk menambahkan logika, lalu aktifkan dengan:\n/plugin load ${pluginName}`
            : `❌ ${result.error}`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /plugin install <source>
      if (subCmd.startsWith("install ")) {
        const source = subCmd.replace("install ", "").trim();
        const inferredName = source.split("/").pop().replace(".git", "");
        await sendMessageToUser({ chat_id: chatId, text: `⏳ Installing dari ${source}...` });
        const result = await clawHub.installFromGitHub(inferredName, source);
        await sendMessageToUser({
          chat_id: chatId,
          text: result.success
            ? `✅ ${result.message}`
            : `❌ ${result.error}`,
        });
        return;
      }

      // /plugin load <nama>
      if (subCmd.startsWith("load ")) {
        const pluginName = subCmd.replace("load ", "").trim();
        await sendMessageToUser({
          chat_id: chatId,
          text: `⏳ Memuat plugin '${pluginName}'... Gunakan pesan biasa untuk memerintahkan agent meload plugin.`,
        });
        return;
      }

      // /plugin loadall
      if (subCmd === "loadall") {
        await sendMessageToUser({
          chat_id: chatId,
          text: `⏳ Memuat semua plugin... Kirim pesan: "muat semua plugin" untuk mengaktifkan via agent.`,
        });
        return;
      }

      // /plugin run <nama> — jalankan plugin app sebagai child process
      if (subCmd.startsWith("run ")) {
        const pluginName = subCmd.replace("run ", "").trim();
        const pluginDir = path.resolve(process.cwd(), "plugins", pluginName);
        if (!fs.existsSync(pluginDir)) {
          await sendMessageToUser({ chat_id: chatId, text: `❌ Plugin '${pluginName}' tidak ditemukan di plugins/` });
          return;
        }
        await sendMessageToUser({ chat_id: chatId, text: `⏳ Menjalankan '${pluginName}' sebagai service...` });
        const result = await processManager.startPlugin(pluginName, pluginDir);
        await sendMessageToUser({
          chat_id: chatId,
          text: result.success
            ? `🟢 *${pluginName}* berjalan!\n\n🌐 URL: ${result.url}\n🔢 Port: ${result.port}\n📌 PID: ${result.pid}`
            : `❌ Gagal: ${result.error}${result.logs ? '\n\nLogs:\n' + result.logs.join('\n') : ''}`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /plugin stop <nama> — hentikan plugin process
      if (subCmd.startsWith("stop ")) {
        const pluginName = subCmd.replace("stop ", "").trim();
        const result = processManager.stopPlugin(pluginName);
        await sendMessageToUser({
          chat_id: chatId,
          text: result.success ? `🔴 ${result.message}` : `❌ ${result.error}`,
        });
        return;
      }

      // /plugin proses — daftar semua plugin process yang berjalan
      if (subCmd === "proses" || subCmd === "ps") {
        const list = processManager.listProcesses();
        if (list.length === 0) {
          await sendMessageToUser({ chat_id: chatId, text: "📭 Tidak ada plugin process yang berjalan." });
          return;
        }
        const lines = list.map(p => {
          const statusIcon = p.status === "running" ? "🟢" : p.status === "crashed" ? "🔴" : "⚪";
          return `${statusIcon} *${p.name}* — Port ${p.port} (PID: ${p.pid})\n   URL: ${p.url} | ${p.command}`;
        });
        await sendMessageToUser({
          chat_id: chatId,
          text: `⚡ *Plugin Processes (${list.length}):*\n\n${lines.join("\n\n")}`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /plugin logs <nama> — lihat logs plugin
      if (subCmd.startsWith("logs ")) {
        const pluginName = subCmd.replace("logs ", "").trim();
        const logs = processManager.getLogs(pluginName, 15);
        if (!logs) {
          await sendMessageToUser({ chat_id: chatId, text: `❌ Plugin '${pluginName}' tidak ditemukan` });
          return;
        }
        await sendMessageToUser({
          chat_id: chatId,
          text: `📋 *Logs: ${pluginName}*\n\n\`\`\`\n${logs.join("\n") || "(kosong)"}\n\`\`\``,
          parse_mode: "Markdown",
        });
        return;
      }

      await sendMessageToUser({
        chat_id: chatId,
        text: "⚠️ Sub-command tidak dikenal. Ketik /plugin untuk melihat bantuan.",
      });
      return;
    }

    // /cron — manage cron jobs
    if (text.startsWith("/cron")) {
      const persona = personaStore.get(chatIdStr);
      const subCmd = text.replace(/^\/cron\s*/i, "").trim();

      // /cron (tanpa argumen) — menu bantuan
      if (!subCmd) {
        await sendMessageToUser({
          chat_id: chatId,
          text:
            `⏰ *Cron Job Manager — ${persona.agentName}*\n\n` +
            `Jadwalkan task otomatis:\n\n` +
            `/cron add <interval> <task>\n` +
            `  Contoh: /cron add 5m cek status website\n` +
            `  Interval: 30s, 5m, 1h, 6h, 1d\n\n` +
            `/cron list — Lihat semua jadwal\n` +
            `/cron remove <id> — Hapus jadwal\n\n` +
            `Atau minta secara natural:\n` +
            `_"Jadwalkan monitor website setiap 10 menit"_`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /cron list
      if (subCmd === "list") {
        const jobs = cronManager.listJobs();
        if (jobs.length === 0) {
          await sendMessageToUser({ chat_id: chatId, text: "📭 Belum ada cron job. Buat dengan:\n/cron add 5m cek status website" });
          return;
        }
        const lines = jobs.map((j, i) => {
          const status = j.active ? "🟢" : "⚪";
          const lastRun = j.lastRun ? new Date(j.lastRun).toLocaleTimeString() : "-";
          const schedule = j.datetime 
            ? `📅 Sekali pada ${new Date(j.datetime).toLocaleString()}`
            : `🔁 Setiap ${j.interval}`;
          const typeLabel = j.datetime ? "[1x]" : "[rutin]";
          return `${status} *${j.name}* ${typeLabel}\n   ${schedule} | Run: ${j.runCount}x | Last: ${lastRun}\n   ID: \`${j.id}\``;
        });
        await sendMessageToUser({
          chat_id: chatId,
          text: `⏰ *Cron Jobs (${jobs.length}):*\n\n${lines.join("\n\n")}`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /cron add <waktu/interval> <task>
      if (subCmd.startsWith("add ")) {
        const parts = subCmd.replace("add ", "").trim().split(/\s+/);
        const timeStr = parts[0];
        const task = parts.slice(1).join(" ");
        if (!timeStr || !task) {
          await sendMessageToUser({ chat_id: chatId, text: "⚠️ Format: /cron add <interval> <task>\nContoh: /cron add 5m cek status website" });
          return;
        }

        const isInterval = /^\d+[smhd]$/i.test(timeStr);
        const interval = isInterval ? timeStr : null;
        const datetime = !isInterval ? timeStr : null;

        const result = cronManager.addJob({ name: task.slice(0, 50), task, interval, datetime, chatId: chatIdStr });
        await sendMessageToUser({
          chat_id: chatId,
          text: result.success
            ? `✅ *Cron job dibuat!*\n\n📋 *Task:* ${task}\n⏱ *Jadwal:* ${isInterval ? "Setiap " + interval : new Date(datetime).toLocaleString()}\n🆔 *ID:* \`${result.job.id}\`\n\nJob akan berjalan otomatis dan mengirim hasilnya ke chat ini.`
            : `❌ ${result.error}`,
          parse_mode: "Markdown",
        });
        return;
      }

      // /cron remove <id>
      if (subCmd.startsWith("remove ")) {
        const jobId = subCmd.replace("remove ", "").trim();
        const result = cronManager.removeJob(jobId);
        await sendMessageToUser({
          chat_id: chatId,
          text: result.success ? `✅ ${result.message}` : `❌ ${result.error}`,
        });
        return;
      }

      await sendMessageToUser({ chat_id: chatId, text: "⚠️ Sub-command tidak dikenal. Ketik /cron untuk bantuan." });
      return;
    }

    // /doctor — health check via doctor tool
    if (text === "/doctor") {
      const persona = personaStore.get(chatIdStr);
      await sendMessageToUser({
        chat_id: chatId,
        text: `⏳ ${persona.agentName} sedang menjalankan diagnostik sistem...`,
      });

      try {
        const doctorResult = await orchestrator.run("platform-assistant", {
          message: "Jalankan doctor-tool action health-report dan laporkan hasilnya",
          __agentName: persona.agentName,
        });
        await sendMessageToUser({
          chat_id: chatId,
          text: doctorResult.finalResponse || doctorResult.summary || "Diagnostik selesai.",
        });
      } catch (err) {
        await sendMessageToUser({
          chat_id: chatId,
          text: `❌ Error diagnostik: ${err.message}`,
        });
      }
      return;
    }

    // /noc — NOC workflow
    if (text.startsWith("/noc")) {
      const result = await orchestrator.run("noc-incident-workflow", {
        taskId: `tg-${Date.now()}`,
        signal: "telegram-trigger",
        severity: "high",
        action: "reroute-link",
      });

      await sendMessageToUser({
        chat_id: chatId,
        text:
          "NOC workflow selesai.\n" +
          `Task: ${result.taskId}\n` +
          `Monitor: ${result.monitor.summary}\n` +
          `Analyzer: ${result.analyzer.summary}\n` +
          `Executor: ${result.executor.summary}`,
      });
      return;
    }

    // /audit — OpenClaw audit
    if (text.startsWith("/audit")) {
      const inputText = text.replace(/^\/audit\s*/i, "").trim() || text;
      const progressMsg = await sendMessageToUser({
        chat_id: chatId,
        text: "⏳ Menjalankan audit OpenClaw...",
      });

      try {
        const auditResult = await orchestrator.run("openclaw-audit", {
          message: inputText,
          openclawSnapshot: buildOpenClawSnapshotFromText(inputText),
        });

        await editUserMessageText({
          chat_id: chatId,
          message_id: progressMsg.message_id,
          text:
            "Demo audit module selesai.\n" +
            `Score: ${auditResult.score}\n` +
            `Summary: ${auditResult.summary}\n` +
            `Gaps: ${auditResult.gaps.map((g) => `${g.area}`).join(", ") || "-"}`,
        });
      } catch (err) {
        await editUserMessageText({
          chat_id: chatId,
          message_id: progressMsg.message_id,
          text: `❌ Error: ${err.message}`
        });
      }
      return;
    }

    // =========================================================
    // INTERCEPT PENGINGAT — Parse waktu server-side, TANPA LLM
    // =========================================================
    if (isReminderRequest(text)) {
      const parsed = parseTimeFromMessage(text);
      if (parsed.type) {
        const persona = personaStore.get(chatIdStr);
        const result = cronManager.addJob({
          name: parsed.task || "Pengingat",
          task: parsed.task || "Pengingat",
          datetime: parsed.datetime,
          chatId: chatIdStr,
          isReminder: true, // Flag khusus untuk membedakan dari task LLM
        });

        if (result.success) {
          await sendMessageToUser({
            chat_id: chatId,
            text: `✅ *Pengingat dibuat!*\n\n` +
              `📋 *Task:* ${parsed.task}\n` +
              `⏰ *Waktu:* ${parsed.humanTime}\n` +
              `🆔 *ID:* \`${result.job.id}\`\n\n` +
              `Saya akan mengingatkan ${persona ? persona.ownerCallSign : "Anda"} tepat waktu! 🔔`,
            parse_mode: "Markdown",
          });
        } else {
          await sendMessageToUser({
            chat_id: chatId,
            text: `❌ Gagal membuat pengingat: ${result.error}`,
          });
        }
        return;
      }
    }

    // =========================================================
    // PESAN BIASA — Gunakan persona + kirim ke platform-assistant
    // =========================================================
    try {
      const persona = personaStore.get(chatIdStr);
      const personaContext = personaStore.buildSystemContext(chatIdStr);

      const progressMsg = await sendMessageToUser({
        chat_id: chatId,
        text: `⏳ ${persona.agentName} sedang berpikir...`,
      });

      const localBus = new EventEmitter();
      let stepCounter = 1;

      localBus.on(EVENT_TYPES.TOOL_CALLED, (evt) => {
        const tool = evt.payload.tool;
        const attempt = evt.payload.attempt > 1 ? ` (retry ${evt.payload.attempt})` : "";
        editUserMessageText({
          chat_id: chatId,
          message_id: progressMsg.message_id,
          text: `⏳ ${persona.agentName} Step ${stepCounter++}: ${tool}${attempt}...`
        }).catch(() => {});
      });

      // Inject persona ke pesan — HANYA gaya bahasa, JANGAN menimpa instruksi tool
      const personalizedMessage = personaContext
        ? `[PERSONA — Gunakan gaya bahasa ini, TAPI tetap jalankan tool jika diminta]\nNama kamu: ${personaContext.agentName}. Karakter: ${personaContext.character}. Panggil user: "${personaContext.ownerCallSign}".\n[/PERSONA]\n\nPesan dari ${personaContext.ownerCallSign}: ${text}`
        : text;

      const assistantResult = await orchestrator.run("platform-assistant", {
        message: personalizedMessage,
        __eventBus: localBus,
        __agentName: persona ? persona.agentName : "platform-assistant",
        __chatId: chatIdStr,
      });

      const rawResponse = assistantResult.finalResponse || assistantResult.summary || "";

      // Auto-format jika LLM tidak mengikuti format standar
      const responseText = isAlreadyFormatted(rawResponse)
        ? rawResponse
        : autoFormat(rawResponse);

      await sendMarkdownToUser(chatId, responseText, progressMsg.message_id);
    } catch (e) {
      await sendMarkdownToUser(chatId, `❌ Error: ${e.message}\n\n➡️ Ketik 'cek status platform' untuk diagnostik`);
    }
  }

  async function pollLoop() {
    running = true;
    logger.info("Telegram channel start polling");

    while (running) {
      try {
        const updates = await tgCall("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message"],
        });

        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.message) {
            handleMessage(update.message).catch((err) => {
              logger.error("Error saat memproses pesan via handleMessage", { error: err.message, chat_id: update.message.chat.id });
            });
          }
        }
      } catch (error) {
        logger.error("Telegram polling error", { message: error.message });
        await sleep(1200);
      }
    }
  }

  return {
    async start() {
      if (!botToken) {
        throw new Error("TELEGRAM_BOT_TOKEN belum diset");
      }
      logger.info("Telegram pairing config", {
        pairingEnabled,
        pairedChats: store.list().length,
        pairingStorePath: store.filePath,
      });

      // Start all enabled cron jobs
      const startedJobs = cronManager.startAll();
      logger.info(`CronManager started with ${startedJobs} active jobs`);

      // =========================================================
      // REGISTER BOT MENU COMMANDS — muncul di UI Telegram
      // =========================================================
      try {
        await tgCall("setMyCommands", {
          commands: [
            { command: "start", description: "🐣 Mulai / Setup persona agent baru" },
            { command: "help", description: "📖 Tampilkan daftar perintah" },
            { command: "doctor", description: "🩺 Cek kesehatan sistem agent" },
            { command: "audit", description: "🔍 Audit arsitektur platform" },
            { command: "noc", description: "🌐 Trigger workflow NOC incident" },
            { command: "reset_persona", description: "🔄 Reset identitas persona agent" },
            { command: "status", description: "📊 Status agent & info persona" },
            { command: "model", description: "🧠 Lihat / ubah model LLM (GPT, Claude, Gemini)" },
            { command: "plugin", description: "🔌 Kelola plugin & install dari ClawHub" },
            { command: "cron", description: "⏰ Jadwalkan task otomatis (cron jobs)" },
            { command: "pair", description: "🔗 Pairing chat dengan kode akses" },
            { command: "unpair", description: "🔓 Hapus pairing chat" },
          ],
        });
        logger.info("Menu command Telegram berhasil didaftarkan (9 menu)");
      } catch (err) {
        logger.warn("Gagal set menu command Telegram", { error: err.message });
      }

      await pollLoop();
    },
    stop() {
      running = false;
    },
  };
}

module.exports = { createTelegramChannel };
