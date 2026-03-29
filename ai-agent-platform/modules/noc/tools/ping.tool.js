"use strict";

function createPingTool() {
  return {
    name: "noc-ping-tool",
    async run(input = {}) {
      return {
        host: input.host || "127.0.0.1",
        status: "reachable",
      };
    },
  };
}

module.exports = { createPingTool };
