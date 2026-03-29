"use strict";

function createHttpTool() {
  return {
    name: "http-tool",
    async run(input = {}) {
      return {
        ok: true,
        method: input.method || "GET",
        url: input.url || "https://example.invalid",
        note: "Implementasi HTTP real bisa ditambahkan di fase berikutnya.",
      };
    },
  };
}

module.exports = { createHttpTool };
