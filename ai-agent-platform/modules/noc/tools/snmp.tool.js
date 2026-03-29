"use strict";

function createSnmpTool() {
  return {
    name: "noc-snmp-tool",
    async run(input = {}) {
      return {
        device: input.device || "unknown-device",
        status: "simulated",
      };
    },
  };
}

module.exports = { createSnmpTool };
