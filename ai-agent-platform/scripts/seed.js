"use strict";

const { buildDefaultOrchestrator } = require("../core/orchestrator/orchestrator");

async function main() {
  const orchestrator = buildDefaultOrchestrator();

  const assistantResult = await orchestrator.run("platform-assistant", {
    message: "status platform starclaw",
  });
  console.log("\n=== HASIL PLATFORM ASSISTANT (CORE FRAMEWORK) ===");
  console.log("Summary:", assistantResult.summary);
  console.log("Response:", assistantResult.finalResponse);

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

  console.log("\n=== HASIL DEMO MODULE OPENCLAW AUDIT ===");
  console.log("Score:", result.score);
  console.log("Gaps:", result.gaps);
  console.log("Recommendations:", result.recommendations);

  const nocResult = await orchestrator.run("noc-incident-workflow", {
    taskId: "noc-seed-1",
    signal: "high-latency",
    severity: "high",
    action: "reroute-link",
  });

  console.log("\n=== HASIL WORKFLOW NOC MULTI-AGENT ===");
  console.log("Workflow:", nocResult.workflow);
  console.log("Task ID:", nocResult.taskId);
  console.log("Monitor:", nocResult.monitor.finalResponse);
  console.log("Analyzer:", nocResult.analyzer.finalResponse);
  console.log("Executor:", nocResult.executor.finalResponse);
}

main().catch((error) => {
  console.error("Seed gagal:", error.message);
  process.exitCode = 1;
});
