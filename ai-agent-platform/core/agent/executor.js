"use strict";

class Executor {
  constructor({ toolsRegistry, logger }) {
    this.toolsRegistry = toolsRegistry;
    this.logger = logger;
  }

  async execute(plan, input) {
    const outputs = [];

    for (const step of plan.steps || []) {
      const tool = this.toolsRegistry.get(step.tool);
      if (!tool) {
        outputs.push({ step: step.name, status: "skipped", reason: "tool-not-found" });
        continue;
      }

      const output = await tool.run(step.input || input);
      outputs.push({ step: step.name, status: "ok", output });
      this.logger.info("Step dieksekusi", { step: step.name, tool: step.tool });
    }

    return {
      score: typeof plan.baseScore === "number" ? plan.baseScore : 0,
      outputs,
      summary: plan.summary || "Eksekusi selesai",
      gaps: plan.gaps || [],
      recommendations: plan.recommendations || [],
    };
  }
}

module.exports = { Executor };
