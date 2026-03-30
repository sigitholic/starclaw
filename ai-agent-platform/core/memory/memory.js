"use strict";

/**
 * Entry point memori agent — re-export dari short.memory (+ API stabil untuk impor `memory.js`).
 */
const { createShortMemory, createMemory } = require("./short.memory");

/**
 * Adapter memori untuk pipeline eksekusi (role-based add).
 */
function wrapMemoryForExecution(memory) {
  const short = memory && memory.short ? memory.short : memory;
  return {
    add(entry) {
      if (!short) return;
      const role = entry && entry.role;
      if (role === "tool") {
        const name = entry.name != null ? String(entry.name) : "tool";
        const content = typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content);
        if (typeof short.addToolResult === "function") {
          short.addToolResult({ name, content });
        }
        return;
      }
      if (typeof short.remember === "function") {
        short.remember(entry);
      }
    },
    short,
  };
}

module.exports = { createShortMemory, createMemory, wrapMemoryForExecution };
