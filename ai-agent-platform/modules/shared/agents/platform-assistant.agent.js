"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");
const { createTimeTool } = require("../../../core/tools/time.tool");

function createPlatformAssistantProvider() {
  return {
    async plan(_prompt, input = {}) {
      const message = String(input.message || "").trim();
      const lower = message.toLowerCase();

      if (!message) {
        return {
          action: "respond",
          response:
            "Starclaw siap. Kirim pertanyaan, minta status platform, atau ketik waktu untuk demo tool.",
          summary: "Platform assistant menunggu input",
        };
      }

      if (lower.includes("waktu") || lower.includes("time") || lower.includes("jam")) {
        return {
          action: "tool",
          tool_name: "time-tool",
          step_name: "get-current-time",
          input: {},
          response: "Waktu server sudah diambil dari time tool.",
          summary: "Assistant memanggil time tool",
          timeoutMs: 1500,
          maxRetries: 0,
        };
      }

      return {
        action: "respond",
        response:
          `Starclaw Platform menerima pesan: "${message}". ` +
          "Gunakan /noc untuk workflow multi-agent atau /audit untuk module demo OpenClaw gap analysis.",
        summary: "Assistant memberi respon langsung",
      };
    },
  };
}

function createPlatformAssistantAgent() {
  return createBaseAgent({
    name: "platform-assistant-agent",
    customTools: [createTimeTool()],
    llmProvider: createPlatformAssistantProvider(),
  });
}

module.exports = { createPlatformAssistantAgent };
