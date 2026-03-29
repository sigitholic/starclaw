"use strict";

const { ensureTokenBudget } = require("../memory/token.manager");
const { EVENT_TYPES } = require("../events/event.types");

class Executor {
  constructor({ toolsRegistry, logger }) {
    this.toolsRegistry = toolsRegistry;
    this.logger = logger;
  }

  async runWithTimeout(taskFn, timeoutMs) {
    if (!timeoutMs || timeoutMs <= 0) {
      return taskFn();
    }

    return Promise.race([
      taskFn(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tool timeout setelah ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  }

  async execute(plan, input) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";
    const outputs = [];
    const tokenStats = ensureTokenBudget({
      input,
      planSummary: plan.summary,
      stepCount: Array.isArray(plan.steps) ? plan.steps.length : 0,
    });

    this.logger.info("Token usage sebelum eksekusi", tokenStats);

    for (const step of plan.steps || []) {
      const tool = this.toolsRegistry.get(step.tool);
      if (!tool) {
        outputs.push({ step: step.name, status: "skipped", reason: "tool-not-found" });
        this.logger.warn("Tool tidak ditemukan", { step: step.name, tool: step.tool });
        continue;
      }

      const maxRetries = Number.isInteger(step.maxRetries) && step.maxRetries >= 0 ? step.maxRetries : 0;
      const timeoutMs = Number.isInteger(step.timeoutMs) && step.timeoutMs > 0 ? step.timeoutMs : 0;
      let attempt = 0;
      let done = false;

      while (!done && attempt <= maxRetries) {
        try {
          attempt += 1;
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_CALLED, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: {
                step: step.name,
                tool: step.tool,
                attempt,
                maxRetries,
                timeoutMs,
              },
            });
          }
          this.logger.info("Memanggil tool", {
            step: step.name,
            tool: step.tool,
            attempt,
            maxRetries,
            timeoutMs,
          });
          const output = await this.runWithTimeout(() => tool.run(step.input || input), timeoutMs);
          outputs.push({ step: step.name, status: "ok", output, attempt });
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: {
                step: step.name,
                tool: step.tool,
                status: "ok",
                attempt,
              },
            });
          }
          this.logger.info("Step dieksekusi", { step: step.name, tool: step.tool, attempt });
          done = true;
        } catch (error) {
          const canRetry = attempt <= maxRetries;
          this.logger.warn("Tool gagal", {
            step: step.name,
            tool: step.tool,
            attempt,
            canRetry,
            message: error.message,
          });

          if (!canRetry) {
            outputs.push({
              step: step.name,
              status: "error",
              attempt,
              reason: error.message,
            });
            if (eventBus) {
              await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
                timestamp: new Date().toISOString(),
                agent: agentName,
                payload: {
                  step: step.name,
                  tool: step.tool,
                  status: "error",
                  attempt,
                  reason: error.message,
                },
              });
            }
            done = true;
          }
        }
      }
    }

    return {
      score: typeof plan.baseScore === "number" ? plan.baseScore : 0,
      outputs,
      summary: plan.summary || "Eksekusi selesai",
      gaps: plan.gaps || [],
      recommendations: plan.recommendations || [],
      finalResponse: plan.finalResponse || null,
      tokenUsage: tokenStats,
    };
  }
}

module.exports = { Executor };
