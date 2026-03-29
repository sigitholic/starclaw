"use strict";

function createMikrotikTool() {
  return {
    name: "noc-mikrotik-tool",
    async run(input = {}) {
      return {
        router: input.router || "mikrotik-default",
        action: input.action || "none",
        status: "queued",
      };
    },
  };
}

module.exports = { createMikrotikTool };
