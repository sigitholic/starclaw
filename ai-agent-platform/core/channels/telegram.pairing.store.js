"use strict";

const fs = require("fs");
const path = require("path");

function createTelegramPairingStore({ dataFilePath }) {
  const resolvedPath = dataFilePath || path.join(process.cwd(), "data", "telegram.pairing.json");

  function ensureFile() {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(resolvedPath)) {
      const initial = {
        pairedChatIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(resolvedPath, JSON.stringify(initial, null, 2), "utf8");
    }
  }

  function read() {
    ensureFile();
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.pairedChatIds)) {
      parsed.pairedChatIds = [];
    }
    return parsed;
  }

  function write(payload) {
    const normalized = {
      pairedChatIds: Array.from(new Set((payload.pairedChatIds || []).map((id) => String(id)))),
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(resolvedPath, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }

  return {
    filePath: resolvedPath,
    list() {
      return read().pairedChatIds;
    },
    isPaired(chatId) {
      return this.list().includes(String(chatId));
    },
    pair(chatId) {
      const data = read();
      if (!data.pairedChatIds.includes(String(chatId))) {
        data.pairedChatIds.push(String(chatId));
      }
      return write(data);
    },
    unpair(chatId) {
      const data = read();
      data.pairedChatIds = data.pairedChatIds.filter((id) => id !== String(chatId));
      return write(data);
    },
  };
}

module.exports = { createTelegramPairingStore };
