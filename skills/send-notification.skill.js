"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

/** URL publik yang menerima POST JSON — dipakai bila planner tidak mengisi `to`. */
const DEFAULT_WEBHOOK_URL = "https://httpbin.org/post";

module.exports = {
  name: "send-notification",
  description: "Mengirim notifikasi (notification-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      channel: o.channel || "webhook",
      message: o.message || "Starclaw: notifikasi skill (self-contained).",
      ...(o.to != null && o.to !== "" ? { to: o.to } : { to: process.env.NOTIFICATION_WEBHOOK_URL || DEFAULT_WEBHOOK_URL }),
      ...(o.subject != null ? { subject: o.subject } : {}),
      ...(o.title != null ? { title: o.title } : {}),
      ...(o.html != null ? { html: o.html } : {}),
      ...(o.priority != null ? { priority: o.priority } : {}),
      ...(o.emailProvider != null ? { emailProvider: o.emailProvider } : {}),
    };
    const raw = await tools["notification-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
