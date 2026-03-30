"use strict";

const { createSocialMediaTool } = require("../../core/tools/social-media.tool");
const { createNotificationTool } = require("../../core/tools/notification.tool");

/**
 * Plugin: Social Media
 *
 * Plugin untuk manajemen konten dan notifikasi sosial media.
 *
 * Konfigurasi (set di .env):
 *   TELEGRAM_BOT_TOKEN     — Token bot Telegram
 *   TWITTER_BEARER_TOKEN   — Bearer token Twitter/X API v2
 *   MAILGUN_API_KEY        — API key Mailgun (untuk email)
 *   MAILGUN_DOMAIN         — Domain Mailgun
 *   SENDGRID_API_KEY       — API key SendGrid (alternatif email)
 *   SOCIAL_WEBHOOK_URL     — URL webhook default
 *   NOTIFICATION_WEBHOOK_URL — URL webhook notifikasi
 *   PUSHOVER_TOKEN         — Token Pushover
 *   PUSHOVER_USER          — User key Pushover
 *
 * Kemampuan:
 *   - Post konten ke Telegram (specific chat atau broadcast)
 *   - Post tweet ke Twitter/X
 *   - Kirim ke webhook (Discord, Slack, Zapier, dll)
 *   - Kirim email via Mailgun atau SendGrid
 *   - Push notification via Pushover
 */
module.exports = {
  name: "social-media",
  version: "1.0.0",
  description: "Posting konten ke Telegram, Twitter/X, webhook, dan kirim notifikasi email/push. Butuh konfigurasi token di .env.",

  tools: [
    createSocialMediaTool(),
    createNotificationTool(),
  ],

  workflows: [],

  activate(context) {
    const channels = [];
    if (process.env.TELEGRAM_BOT_TOKEN) channels.push("Telegram");
    if (process.env.TWITTER_BEARER_TOKEN) channels.push("Twitter/X");
    if (process.env.MAILGUN_API_KEY || process.env.SENDGRID_API_KEY) channels.push("Email");
    if (process.env.PUSHOVER_TOKEN) channels.push("Pushover");

    console.log(`[Plugin:social-media] Aktif — Channels: ${channels.length > 0 ? channels.join(", ") : "belum dikonfigurasi (set token di .env)"}`);
  },

  deactivate() {
    console.log("[Plugin:social-media] Dinonaktifkan.");
  },
};
