"use strict";

/**
 * Notification Tool — Kirim notifikasi ke berbagai channel.
 *
 * Channel yang didukung:
 *   - Email via SMTP (nodemailer-less, pakai raw SMTP atau Mailgun/SendGrid API)
 *   - Webhook (generic)
 *   - Telegram (via Bot API)
 *   - Pushover (push notification ke HP)
 *
 * Environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   MAILGUN_API_KEY, MAILGUN_DOMAIN
 *   SENDGRID_API_KEY
 *   TELEGRAM_BOT_TOKEN
 *   PUSHOVER_TOKEN, PUSHOVER_USER
 *   NOTIFICATION_WEBHOOK_URL
 */
function createNotificationTool() {

  async function sendMailgun(to, subject, text, html) {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const from = process.env.SMTP_FROM || `noreply@${domain}`;
    if (!apiKey || !domain) throw new Error("MAILGUN_API_KEY dan MAILGUN_DOMAIN wajib diset di .env");

    const body = new URLSearchParams({ from, to, subject, text });
    if (html) body.set("html", html);

    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Mailgun error: ${JSON.stringify(data)}`);
    return data;
  }

  async function sendSendGrid(to, subject, text, html) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const from = process.env.SMTP_FROM || "noreply@starclaw.local";
    if (!apiKey) throw new Error("SENDGRID_API_KEY wajib diset di .env");

    const body = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: "text/plain", value: text }],
    };
    if (html) body.content.push({ type: "text/html", value: html });

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SendGrid error ${res.status}: ${err.slice(0, 200)}`);
    }
    return { provider: "sendgrid", to, subject };
  }

  async function sendTelegram(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset");
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const body = await res.json();
    if (!body.ok) throw new Error(`Telegram error: ${JSON.stringify(body)}`);
    return { provider: "telegram", chatId };
  }

  async function sendPushover(title, message, priority = 0) {
    const token = process.env.PUSHOVER_TOKEN;
    const user = process.env.PUSHOVER_USER;
    if (!token || !user) throw new Error("PUSHOVER_TOKEN dan PUSHOVER_USER wajib diset di .env");

    const body = new URLSearchParams({ token, user, title, message, priority: String(priority) });
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 1) throw new Error(`Pushover error: ${JSON.stringify(data)}`);
    return { provider: "pushover", title };
  }

  return {
    name: "notification-tool",
    description: "Kirim notifikasi ke berbagai channel: email (Mailgun/SendGrid), Telegram, Pushover, atau webhook generic. Gunakan untuk alert, laporan otomatis, atau notifikasi sistem.",
    parameters: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description: "'email' (via Mailgun atau SendGrid), 'telegram', 'pushover', 'webhook'"
        },
        to: {
          type: "string",
          description: "(email) Alamat email tujuan | (telegram) chatId | (webhook) URL tujuan"
        },
        subject: {
          type: "string",
          description: "(email) Subject email"
        },
        message: {
          type: "string",
          description: "Isi pesan / body notifikasi"
        },
        title: {
          type: "string",
          description: "(pushover) Judul notifikasi (opsional)"
        },
        html: {
          type: "string",
          description: "(email) Versi HTML dari pesan (opsional)"
        },
        priority: {
          type: "number",
          description: "(pushover) Prioritas: -2 (terendah), -1 (low), 0 (normal), 1 (high), 2 (emergency)"
        },
        emailProvider: {
          type: "string",
          description: "(email) Provider: 'mailgun' atau 'sendgrid' (default: auto-detect dari env)"
        },
      },
      required: ["channel", "message"],
    },

    async run(input) {
      try {
        switch (input.channel) {

          case "email": {
            if (!input.to) return { success: false, error: "'to' (alamat email) wajib" };
            if (!input.subject) return { success: false, error: "'subject' wajib untuk email" };

            // Auto-detect provider
            const provider = input.emailProvider ||
              (process.env.MAILGUN_API_KEY ? "mailgun" :
               process.env.SENDGRID_API_KEY ? "sendgrid" : null);

            if (!provider) return { success: false, error: "Set MAILGUN_API_KEY atau SENDGRID_API_KEY di .env" };

            let result;
            if (provider === "mailgun") {
              result = await sendMailgun(input.to, input.subject, input.message, input.html);
            } else if (provider === "sendgrid") {
              result = await sendSendGrid(input.to, input.subject, input.message, input.html);
            } else {
              return { success: false, error: `Provider email '${provider}' tidak dikenal. Pilih: mailgun, sendgrid` };
            }

            return { success: true, channel: "email", provider, to: input.to, subject: input.subject, result };
          }

          case "telegram": {
            const chatId = input.to || process.env.TELEGRAM_DEFAULT_CHAT_ID;
            if (!chatId) return { success: false, error: "'to' (chatId Telegram) wajib, atau set TELEGRAM_DEFAULT_CHAT_ID di .env" };
            const result = await sendTelegram(chatId, input.message);
            return { success: true, ...result, message: "Notifikasi Telegram terkirim" };
          }

          case "pushover": {
            const result = await sendPushover(input.title || "Starclaw Alert", input.message, input.priority || 0);
            return { success: true, ...result, message: "Push notification Pushover terkirim" };
          }

          case "webhook": {
            const url = input.to || process.env.NOTIFICATION_WEBHOOK_URL;
            if (!url) return { success: false, error: "'to' (URL webhook) wajib, atau set NOTIFICATION_WEBHOOK_URL di .env" };
            const payload = { title: input.title || "Starclaw Alert", message: input.message, timestamp: new Date().toISOString() };
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`Webhook error ${res.status}`);
            return { success: true, channel: "webhook", url, message: "Notifikasi webhook terkirim" };
          }

          default:
            return { success: false, error: `Channel '${input.channel}' tidak dikenal. Pilih: email, telegram, pushover, webhook` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createNotificationTool };
