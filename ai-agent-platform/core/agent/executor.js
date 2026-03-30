"use strict";

const { ensureTokenBudget } = require("../memory/token.manager");
const { EVENT_TYPES } = require("../events/event.types");
const { agentConfig } = require("../../config/agent.config");

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

    const startTime = Date.now();

    for (const step of plan.steps || []) {
      const tool = this.toolsRegistry.get(step.tool);
      if (!tool) {
        outputs.push({
          step: step.name,
          tool: step.tool,         // Optimasi 3: sertakan tool name
          status: "skipped",
          reason: "tool-not-found",
        });
        this.logger.warn("Tool tidak ditemukan", { step: step.name, tool: step.tool });
        continue;
      }

      const maxRetries = Number.isInteger(step.maxRetries) && step.maxRetries >= 0
        ? step.maxRetries
        : (agentConfig.defaultToolMaxRetries || 0);
      const timeoutMs = Number.isInteger(step.timeoutMs) && step.timeoutMs > 0
        ? step.timeoutMs
        : (agentConfig.defaultToolTimeoutMs || 30000);

      // Fix bug retry: totalAttempts = 1 eksekusi awal + maxRetries percobaan ulang
      const totalAttempts = 1 + maxRetries;
      let attempt = 0;
      let done = false;

      while (!done && attempt < totalAttempts) {
        attempt++;
        const isLastAttempt = attempt >= totalAttempts;

        try {
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_CALLED, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: { step: step.name, tool: step.tool, attempt, maxRetries, timeoutMs },
            });
          }
          this.logger.info("Memanggil tool", { step: step.name, tool: step.tool, attempt, maxRetries });

          const output = await this.runWithTimeout(
            () => tool.run(step.input || input, input),
            timeoutMs
          );

          outputs.push({
            step: step.name,
            tool: step.tool,
            status: "ok",
            output,
            attempt,
          });

          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: { step: step.name, tool: step.tool, status: "ok", attempt },
            });
          }
          this.logger.info("Step dieksekusi", { step: step.name, tool: step.tool, attempt });
          done = true;

        } catch (error) {
          this.logger.warn("Tool gagal", {
            step: step.name, tool: step.tool, attempt, remaining: totalAttempts - attempt, message: error.message,
          });

          if (isLastAttempt) {
            outputs.push({
              step: step.name,
              tool: step.tool,
              status: "error",
              attempt,
              reason: error.message,
            });
            if (eventBus) {
              await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
                timestamp: new Date().toISOString(),
                agent: agentName,
                payload: { step: step.name, tool: step.tool, status: "error", attempt, reason: error.message },
              });
            }
            done = true;
          } else {
            // Exponential backoff sebelum retry: 500ms, 1000ms, 2000ms...
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
      }
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      score: typeof plan.baseScore === "number" ? plan.baseScore : 0,
      outputs,
      summary: plan.summary || "Eksekusi selesai",
      gaps: plan.gaps || [],
      recommendations: plan.recommendations || [],
      finalResponse: plan.finalResponse || null,
      tokenUsage: tokenStats,
      executionTimeMs,      // Metrik performa baru
    };
  }
}

module.exports = { Executor };
