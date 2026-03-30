"use strict";

const { normalizeToolResult, fromNormalizedTool, skillEnvelope } = require("./skill-result.helper");

/**
 * @param {string} output
 * @returns {{ packetLoss: number|null, latencyMs: number|null, isOnline: boolean }}
 */
function parsePingOutput(output) {
  const text = String(output || "");
  const lossMatch = text.match(/(\d+(?:\.\d+)?)%\s*packet\s*loss/i);
  const packetLoss = lossMatch ? parseFloat(lossMatch[1]) : null;

  let latencyMs = null;
  const rttMatch = text.match(/rtt min\/avg\/max\/mdev\s*=\s*[\d.]+\/([\d.]+)\//i);
  if (rttMatch) {
    latencyMs = parseFloat(rttMatch[1]);
  } else {
    const times = [...text.matchAll(/time=([\d.]+)\s*ms/gi)];
    if (times.length) {
      const sum = times.reduce((a, m) => a + parseFloat(m[1]), 0);
      latencyMs = sum / times.length;
    }
  }

  const isOnline = packetLoss !== null && packetLoss < 100;
  return { packetLoss, latencyMs, isOnline };
}

function pingInsight(packetLoss, isOnline) {
  if (!isOnline) return "Host tidak merespon";
  if (packetLoss === 0) return "Koneksi stabil";
  if (packetLoss > 0 && packetLoss < 100) return "Terdapat packet loss, koneksi kurang stabil";
  return "Host tidak merespon";
}

module.exports = {
  name: "run-system-command",
  description: "Menjalankan perintah shell/terminal (shell-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const target = typeof o.target === "string" ? o.target.trim() : "";
    const explicit = o.command || o.cmd;

    if (explicit) {
      const toolInput = {
        command: explicit,
        meta: {
          source: "skill",
          skillName: "run-system-command",
        },
      };
      const raw = await tools["shell-tool"].run(toolInput);
      return fromNormalizedTool(normalizeToolResult(raw));
    }

    if (target) {
      const host = target || "127.0.0.1";
      const toolInput = {
        command: `ping -c 4 ${host}`,
        meta: {
          source: "skill",
          skillName: "run-system-command",
        },
      };
      const raw = await tools["shell-tool"].run(toolInput);
      const stdout = raw && raw.stdout != null ? String(raw.stdout) : "";
      const stderr = raw && raw.stderr != null ? String(raw.stderr) : "";
      const combined = `${stdout}\n${stderr}`;

      if (raw && raw.error && !stdout.trim()) {
        return skillEnvelope(false, `Gagal ping ke ${host}`, {
          target: host,
          status: "offline",
          Alasan: String(raw.error).slice(0, 300),
        });
      }

      const { packetLoss, latencyMs, isOnline } = parsePingOutput(combined);
      const insight = pingInsight(packetLoss, isOnline);

      return skillEnvelope(true, isOnline ? `Host ${host} aktif` : `Host ${host} tidak merespon`, {
        target: host,
        status: isOnline ? "online" : "offline",
        packetLoss: packetLoss !== null ? `${packetLoss}%` : "unknown",
        latency: latencyMs != null ? `${latencyMs.toFixed(1)} ms` : "unknown",
        insight,
      });
    }

    const toolInput = {
      command: "pwd",
      meta: {
        source: "skill",
        skillName: "run-system-command",
      },
    };
    const raw = await tools["shell-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
