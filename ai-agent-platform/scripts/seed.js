"use strict";

const { buildDefaultOrchestrator } = require("../core/orchestrator/orchestrator");

async function main() {
  const orchestrator = buildDefaultOrchestrator();

  const result = await orchestrator.run("openclaw-audit", {
    openclawSnapshot: {
      modules: ["agent-core", "basic-tools", "single-memory"],
      observability: {
        tracing: false,
        metrics: false,
      },
      reliability: {
        retries: false,
        queue: false,
      },
      memory: {
        longTerm: false,
      },
    },
  });

  console.log("\n=== HASIL AUDIT OPENCLAW ===");
  console.log("Score:", result.score);
  console.log("Gaps:", result.gaps);
  console.log("Recommendations:", result.recommendations);
}

main().catch((error) => {
  console.error("Seed gagal:", error.message);
  process.exitCode = 1;
});
