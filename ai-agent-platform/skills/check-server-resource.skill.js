"use strict";

const { skillEnvelope } = require("./skill-result.helper");

function extractCPU(text) {
  const match = String(text || "").match(/(\d+\.?\d*)\s+id/);
  if (!match) return "unknown";
  const idle = parseFloat(match[1]);
  const used = Math.max(0, Math.min(100, 100 - idle));
  return `${used.toFixed(1)}% used`;
}

function extractMemory(text) {
  const match = String(text || "").match(
    /MiB Mem\s*:\s*(\d+\.?\d*)\s+total,\s*(\d+\.?\d*)\s+free/i,
  );
  if (!match) return "unknown";
  const total = parseFloat(match[1]);
  const free = parseFloat(match[2]);
  const used = total - free;
  return `${used.toFixed(1)} / ${total.toFixed(1)} MB`;
}

function extractLoad(text) {
  const match = String(text || "").match(/load average:\s*([\d.,\s]+)/i);
  if (!match) return "unknown";
  return match[1].trim().split(/\s*,\s*/)[0] || "unknown";
}

module.exports = {
  name: "check-server-resource",
  description: "Memeriksa ringkas CPU, memori, dan load server (top).",
  parameters: { type: "object", properties: {} },
  async run({ tools }) {
    const r = await tools["shell-tool"].run({
      command: "top -b -n 1 | head -n 5",
      meta: {
        source: "skill",
        skillName: "check-server-resource",
      },
    });

    const stdout = r && r.stdout != null ? String(r.stdout) : "";
    if (r && r.error && !stdout.trim()) {
      return skillEnvelope(false, "Tidak dapat membaca resource server", {
        Alasan: String(r.error).slice(0, 300),
      });
    }

    return skillEnvelope(true, "Status resource server", {
      cpu: extractCPU(stdout),
      memory: extractMemory(stdout),
      load: extractLoad(stdout),
    });
  },
};
