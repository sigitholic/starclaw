"use strict";

function incidentWorkflow(incident) {
  return {
    incidentId: incident.id || "INC-UNKNOWN",
    steps: ["detect", "analyze", "mitigate", "report"],
  };
}

module.exports = { incidentWorkflow };
