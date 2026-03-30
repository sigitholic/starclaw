"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

const DEFAULT_WEBHOOK_URL = "https://httpbin.org/post";

module.exports = {
  name: "post-to-social",
  description: "Posting ke media sosial (social-media-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      action: o.action || "webhook",
      text: o.text || "Starclaw: posting skill (self-contained).",
      ...(o.chatId != null ? { chatId: o.chatId } : {}),
      ...(o.parseMode != null ? { parseMode: o.parseMode } : {}),
      ...(o.webhookUrl != null && o.webhookUrl !== ""
        ? { webhookUrl: o.webhookUrl }
        : { webhookUrl: process.env.SOCIAL_WEBHOOK_URL || DEFAULT_WEBHOOK_URL }),
      ...(o.webhookPayload != null ? { webhookPayload: o.webhookPayload } : {}),
      ...(o.platform != null ? { platform: o.platform } : {}),
    };
    const raw = await tools["social-media-tool"].run(toolInput);
    const normalized = normalizeToolResult(raw);
    return {
      success: normalized.success !== false,
      data: normalized,
    };
  },
};
