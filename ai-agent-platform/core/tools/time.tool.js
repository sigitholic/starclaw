"use strict";

function createTimeTool() {
  return {
    name: "time-tool",
    description: "Mengambil waktu server saat ini (ISO format). Tidak butuh parameter input.",
    parameters: {
      type: "object",
      properties: {}
    },
    async run() {
      return {
        now: new Date().toISOString(),
      };
    },
  };
}

module.exports = { createTimeTool };
