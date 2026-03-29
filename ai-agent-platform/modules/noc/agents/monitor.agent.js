"use strict";

const { createBaseAgent } = require("../../../core/agent/agent.factory");

function createMonitorAgent() {
  return createBaseAgent({ name: "noc-monitor-agent" });
}

module.exports = { createMonitorAgent };
