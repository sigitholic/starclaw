"use strict";

const fs = require("fs").promises;
const path = require("path");

function slugifyToolName(input) {
  if (!input || typeof input !== "string") return "";
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Tolak pola berbahaya untuk plugin kustom (http, parsing, logika saja).
 */
function validateSafeCode(code) {
  if (!code || typeof code !== "string") {
    return { ok: false, reason: "Parameter 'code' kosong atau bukan string" };
  }
  const lower = code.toLowerCase();
  const blocked = [
    { re: /\b(?:child_process|exec|execSync|spawn|spawnSync|fork)\b/, msg: "child_process / exec tidak diizinkan" },
    { re: /\brequire\s*\(\s*["']child_process["']\s*\)/, msg: "require('child_process') tidak diizinkan" },
    { re: /\bfs\.rm(?:Sync)?\b/, msg: "fs.rm tidak diizinkan" },
    { re: /\bfs\.unlink(?:Sync)?\b/, msg: "fs.unlink tidak diizinkan" },
    { re: /\bfs\.rmdir(?:Sync)?\b/, msg: "fs.rmdir tidak diizinkan" },
    { re: /\brm\s+-rf\b/, msg: "perintah rm -rf tidak diizinkan" },
    { re: /\b(?:eval|Function)\s*\(/, msg: "eval / Function constructor tidak diizinkan" },
    { re: /\bvm\.(?:runIn|Script)\b/, msg: "vm tidak diizinkan" },
    { re: /\bprocess\.(?:kill|exit)\b/, msg: "process.kill / process.exit tidak diizinkan" },
  ];
  for (const { re, msg } of blocked) {
    if (re.test(code) || re.test(lower)) {
      return { ok: false, reason: msg };
    }
  }
  return { ok: true };
}

function buildDefaultToolCode(toolName, description) {
  const safeDesc = (description || "Generated tool").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"use strict";

/**
 * Tool dibuat otomatis oleh tool-builder.
 * Sesuaikan logika atau kirim ulang tool-builder dengan parameter code lengkap.
 */
module.exports = {
  name: "${toolName}",
  description: "${safeDesc}",

  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL HTTPS untuk cek uptime (opsional)" },
    },
  },

  async run(input) {
    try {
      const url = input && input.url;
      if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
        const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(15000)
          : undefined;
        const res = await fetch(url, { method: "GET", ...(signal ? { signal } : {}) });
        return {
          success: true,
          data: {
            status: res.status,
            ok: res.ok,
            url,
          },
        };
      }
      return {
        success: true,
        data: {
          message: "Berikan input.url (https://...) untuk cek HTTP, atau edit kode plugin ini.",
          toolName: "${toolName}",
        },
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }
};
`;
}

/**
 * Tool Builder — buat plugin baru di plugins/<nama>/, register ke registry, lalu load.
 */
function createToolBuilderTool(pluginManager) {
  return {
    name: "tool-builder",
    description:
      "Buat tool JavaScript baru secara dinamis: tulis plugins/<nama>/index.js + plugin.json, muat plugin, dan daftar ke ToolRegistry. " +
      "Gunakan untuk permintaan seperti \"buat tool untuk X\". Sandi parameter `code` dengan aman (tanpa exec/child_process).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'create' —buat plugin + register + load",
        },
        toolName: {
          type: "string",
          description: "Slug nama tool (huruf kecil, pisah dengan -), contoh: ping-tool atau uptime-check",
        },
        description: {
          type: "string",
          description: "Deskripsi singkat tool untuk manusia dan LLM",
        },
        code: {
          type: "string",
          description:
            "Opsional. Isi penuh file index.js (module.exports = { name, description, async run(input) }). Jika kosong, dipakai template default (HTTP + placeholder).",
        },
        userIntent: {
          type: "string",
          description: "Opsional. Ringkasan permintaan user (untuk metadata / debugging).",
        },
      },
      required: ["action", "toolName"],
    },

    async run(input) {
      if (input.action !== "create") {
        return { success: false, error: "action yang didukung hanya: create" };
      }

      const pluginFolderName = slugifyToolName(input.toolName);
      if (!pluginFolderName || pluginFolderName.length < 2) {
        return { success: false, error: "toolName tidak valid (gunakan huruf/angka dan tanda hubung)" };
      }

      const toolName = pluginFolderName.endsWith("-tool") ? pluginFolderName : `${pluginFolderName}-tool`;
      const desc = (input.description && String(input.description).trim()) ||
        (input.userIntent && String(input.userIntent).trim()) ||
        "Generated tool";

      const pluginsDir = path.resolve(process.cwd(), "plugins");
      const pluginDir = path.join(pluginsDir, pluginFolderName);
      const indexPath = path.join(pluginDir, "index.js");

      try {
        await fs.access(indexPath);
        return {
          success: false,
          error: `Plugin '${pluginFolderName}' sudah ada (${indexPath}). Hapus folder atau gunakan nama lain.`,
        };
      } catch {
        /* file belum ada — lanjut */
      }

      let source = typeof input.code === "string" && input.code.trim().length > 0
        ? input.code.trim()
        : buildDefaultToolCode(toolName, desc);

      if (!source.includes(`module.exports`) && !source.includes("exports.")) {
        return { success: false, error: "Kode harus meng-export module.exports dengan { name, run } atau { name, tools }" };
      }

      const safeCheck = validateSafeCode(source);
      if (!safeCheck.ok) {
        return { success: false, error: `Kode ditolak (keamanan): ${safeCheck.reason}` };
      }

      try {
        await fs.mkdir(pluginDir, { recursive: true });
      } catch (err) {
        return { success: false, error: `Gagal membuat folder: ${err.message}` };
      }

      try {
        await fs.writeFile(indexPath, source, "utf-8");
      } catch (err) {
        return { success: false, error: `Gagal menulis index.js: ${err.message}` };
      }

      const manifest = {
        name: pluginFolderName,
        version: "1.0.0",
        description: desc,
        type: "tool",
        autoStart: false,
        configSchema: [],
        tools: [toolName],
        generatedBy: "tool-builder",
        requires: { env: [] },
      };

      try {
        await fs.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf-8");
      } catch (err) {
        return { success: false, error: `Gagal menulis plugin.json: ${err.message}` };
      }

      const loadResult = pluginManager.loadPlugin(indexPath, pluginFolderName);
      if (!loadResult.success) {
        return {
          success: false,
          error: loadResult.error || "Gagal load plugin",
          validationErrors: loadResult.validationErrors,
          hint: loadResult.hint,
        };
      }

      const message = `✅ Tool berhasil dibuat: ${toolName}`;

      return {
        success: true,
        message,
        pluginName: pluginFolderName,
        toolName,
        path: pluginDir,
        registered: true,
        loadResult,
      };
    },
  };
}

module.exports = { createToolBuilderTool, validateSafeCode, slugifyToolName };
