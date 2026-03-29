"use strict";
const fs = require("fs").promises;
const path = require("path");

function createFsTool() {
  return {
    name: "fs-tool",
    description: "Membaca, menulis, atau melihat daftar file/folder di sistem (File System).",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'read' untuk membaca, 'write' untuk tulis file, 'list' untuk isi direktori." },
        path: { type: "string", description: "Path absolut atau relatif dari file/folder sasaran." },
        content: { type: "string", description: "(Hanya untuk action 'write') Isi teks untuk dimasukkan ke file." }
      },
      required: ["action", "path"]
    },
    async run(input) {
      const action = input.action; // 'read', 'write', 'list'
      const filePath = input.path;
      
      if (!filePath) return { error: "No path provided. Use 'path' field." };
      
      try {
        if (action === "read") {
          const content = await fs.readFile(filePath, "utf-8");
          return { content };
        } else if (action === "write") {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, input.content || "");
          return { success: true, message: `File ${filePath} written successfully.` };
        } else if (action === "list") {
          const files = await fs.readdir(filePath);
          return { files };
        } else {
          return { error: "Unknown action. Supported actions: read, write, list." };
        }
      } catch (err) {
        return { error: err.message };
      }
    },
  };
}

module.exports = { createFsTool };
