"use strict";

/**
 * Social Media Tool — Post konten ke berbagai platform.
 *
 * Platform yang didukung:
 *   - Telegram (via Bot API — broadcast ke semua paired chat, atau specific chatId)
 *   - Webhook (generic — cocok untuk Zapier, Make, n8n, Discord, Slack, dll)
 *   - Twitter/X (via API v2, butuh bearer token)
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN       — Token bot Telegram
 *   TWITTER_BEARER_TOKEN     — Bearer token Twitter/X API v2
 *   TWITTER_API_KEY          — Consumer API Key
 *   TWITTER_API_SECRET       — Consumer API Secret
 *   TWITTER_ACCESS_TOKEN     — Access Token
 *   TWITTER_ACCESS_SECRET    — Access Token Secret
 *   SOCIAL_WEBHOOK_URL       — Default webhook URL (opsional)
 */
function createSocialMediaTool() {
  async function postTelegram(chatId, text, parseMode = "Markdown") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
    const body = await res.json();
    if (!body.ok) throw new Error(`Telegram error: ${JSON.stringify(body)}`);
    return { platform: "telegram", chatId, messageId: body.result.message_id };
  }

  async function postWebhook(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Webhook error ${res.status}: ${text.slice(0, 200)}`);
    }
    return { platform: "webhook", url, status: res.status };
  }

  async function postTwitter(text) {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) throw new Error("TWITTER_BEARER_TOKEN belum diset di .env");

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Twitter error: ${JSON.stringify(body)}`);
    return { platform: "twitter", tweetId: body.data.id, text: body.data.text };
  }

  return {
    name: "social-media-tool",
    description: "Post konten ke sosial media: Telegram (broadcast atau specific chat), webhook (Discord, Slack, Zapier, dll), atau Twitter/X. Gunakan untuk posting konten, notifikasi, atau broadcast pesan.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'telegram-send' (kirim ke specific chatId), 'telegram-broadcast' (kirim ke semua paired chat), 'webhook' (kirim ke URL webhook), 'twitter-post' (tweet)"
        },
        text: {
          type: "string",
          description: "Teks konten yang akan dipost. Untuk Telegram bisa pakai format Markdown (*bold*, _italic_, `code`)"
        },
        chatId: {
          type: "string",
          description: "(untuk telegram-send) ID chat Telegram tujuan"
        },
        parseMode: {
          type: "string",
          description: "(untuk Telegram) Format teks: 'Markdown' atau 'HTML' (default: Markdown)"
        },
        webhookUrl: {
          type: "string",
          description: "(untuk webhook) URL endpoint tujuan. Jika tidak diisi, pakai SOCIAL_WEBHOOK_URL dari env"
        },
        webhookPayload: {
          type: "object",
          description: "(untuk webhook) Custom payload JSON. Jika tidak diisi, default: { text, timestamp, source: 'starclaw' }"
        },
        platform: {
          type: "string",
          description: "(untuk webhook) Hint platform tujuan untuk format payload: 'discord', 'slack', 'generic' (default: generic)"
        },
      },
      required: ["action", "text"],
    },

    async run(input) {
      try {
        switch (input.action) {

          case "telegram-send": {
            if (!input.chatId) return { success: false, error: "chatId wajib untuk telegram-send" };
            const result = await postTelegram(input.chatId, input.text, input.parseMode || "Markdown");
            return { success: true, ...result };
          }

          case "telegram-broadcast": {
            // Load paired chats dari file pairing store
            const path = require("path");
            const fs = require("fs");
            const pairingPath = process.env.TELEGRAM_PAIRING_STORE_PATH ||
              path.join(process.cwd(), "data/telegram.pairing.json");

            let pairedChats = [];
            try {
              const data = JSON.parse(fs.readFileSync(pairingPath, "utf-8"));
              pairedChats = data.paired || [];
            } catch (_) {
              return { success: false, error: "Tidak ada paired chat. Gunakan telegram-send dengan chatId spesifik." };
            }

            if (pairedChats.length === 0) {
              return { success: false, error: "Tidak ada chat yang paired. User harus /pair terlebih dahulu." };
            }

            const results = [];
            const errors = [];
            for (const chatId of pairedChats) {
              try {
                const r = await postTelegram(chatId, input.text, input.parseMode || "Markdown");
                results.push(r);
              } catch (e) {
                errors.push({ chatId, error: e.message });
              }
            }
            return {
              success: errors.length === 0,
              sent: results.length,
              failed: errors.length,
              results,
              errors,
              message: `Broadcast selesai: ${results.length} berhasil, ${errors.length} gagal dari ${pairedChats.length} chat`,
            };
          }

          case "webhook": {
            const url = input.webhookUrl || process.env.SOCIAL_WEBHOOK_URL;
            if (!url) return { success: false, error: "webhookUrl wajib (atau set SOCIAL_WEBHOOK_URL di .env)" };

            let payload = input.webhookPayload;
            if (!payload) {
              // Format sesuai platform
              const plat = (input.platform || "generic").toLowerCase();
              if (plat === "discord") {
                payload = { content: input.text };
              } else if (plat === "slack") {
                payload = { text: input.text };
              } else {
                payload = { text: input.text, timestamp: new Date().toISOString(), source: "starclaw" };
              }
            }

            const result = await postWebhook(url, payload);
            return { success: true, ...result, message: "Webhook berhasil dikirim" };
          }

          case "twitter-post": {
            if (input.text.length > 280) {
              return { success: false, error: `Tweet terlalu panjang (${input.text.length}/280 karakter). Potong konten.` };
            }
            const result = await postTwitter(input.text);
            return { success: true, ...result, message: `Tweet berhasil dipost` };
          }

          default:
            return { success: false, error: `Action '${input.action}' tidak dikenal. Pilih: telegram-send, telegram-broadcast, webhook, twitter-post` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createSocialMediaTool };
