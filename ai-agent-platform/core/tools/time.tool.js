"use strict";

function createTimeTool() {
  return {
    name: "time-tool",
    async run() {
      return {
        now: new Date().toISOString(),
      };
    },
  };
}

module.exports = { createTimeTool };
