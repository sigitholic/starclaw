"use strict";

const { ensureTokenBudget } = require("../memory/token.manager");
const { EVENT_TYPES } = require("../events/event.types");
const { agentConfig } = require("../../config/agent.config");
const { normalizeToolResult, formatFinalAnswer } = require("../llm/modelRouter");
const { modelManager } = require("../llm/modelManager");

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

  /**
   * Kunci deduplikasi: tool + input (JSON) — hindari memanggil ulang tanpa perlu
   */
  toolInvocationKey(toolName, inputObj) {
    try {
      return `${toolName}:${JSON.stringify(inputObj || {})}`;
    } catch (_e) {
      return `${toolName}:<unserializable>`;
    }
  }

  async execute(plan, input) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";
    const outputs = [];
    const trace = Array.isArray(input.__executionTrace) ? [...input.__executionTrace] : [];
    const completedKeys = new Set(
      Array.isArray(input.__completedToolKeys) ? input.__completedToolKeys : []
    );

    const tokenStats = ensureTokenBudget({
      input,
      planSummary: plan.summary,
      stepCount: Array.isArray(plan.steps) ? plan.steps.length : 0,
    });

    this.logger.info("Token usage sebelum eksekusi", tokenStats);

    const startTime = Date.now();

    for (const step of plan.steps || []) {
      console.log("STEP:", step);
      console.log("MODEL:", modelManager.getModel());

      const invocationKey = this.toolInvocationKey(step.tool, step.input || {});

      if (completedKeys.has(invocationKey)) {
        const skipMsg = `Dilewati: tool "${step.tool}" dengan input yang sama sudah dieksekusi sebelumnya.`;
        this.logger.warn("Executor: skip duplicate tool invocation", { tool: step.tool, key: invocationKey });
        outputs.push({
          step: step.name,
          tool: step.tool,
          status: "skipped",
          reason: "DUPLICATE_TOOL",
          output: { success: false, data: null, message: skipMsg },
          attempt: 0,
        });
        trace.push({ step, result: { success: false, data: null, message: skipMsg } });
        continue;
      }

      // ToolGuard: resolve dengan fuzzy match sebelum eksekusi
      const resolved = typeof this.toolsRegistry.resolve === "function"
        ? this.toolsRegistry.resolve(step.tool)
        : { tool: this.toolsRegistry.get(step.tool), resolvedName: step.tool, wasExact: true };

      const tool = resolved.tool;

      if (!tool) {
        this.logger.error("INVALID_TOOL: Tool tidak ditemukan", {
          requested: step.tool,
          step: step.name,
          available: resolved.available || this.toolsRegistry.list(),
          hint: `Periksa nama tool. Tool tersedia: ${(resolved.available || this.toolsRegistry.list()).join(", ")}`,
        });
        const errOut = {
          success: false,
          data: null,
          message: `Tool '${step.tool}' tidak ada di registry`,
        };
        outputs.push({
          step: step.name,
          tool: step.tool,
          status: "skipped",
          reason: "INVALID_TOOL",
          error: errOut.message,
          output: errOut,
        });
        trace.push({ step, result: errOut });
        continue;
      }

      if (!resolved.wasExact && resolved.resolvedName) {
        this.logger.warn("ToolGuard: fuzzy match diterapkan", {
          requested: step.tool,
          resolved: resolved.resolvedName,
        });
        step.tool = resolved.resolvedName;
      }

      const maxRetries = Number.isInteger(step.maxRetries) && step.maxRetries >= 0
        ? step.maxRetries
        : (agentConfig.defaultToolMaxRetries || 0);
      const timeoutMs = Number.isInteger(step.timeoutMs) && step.timeoutMs > 0
        ? step.timeoutMs
        : (agentConfig.defaultToolTimeoutMs || 30000);

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

          const rawOutput = await this.runWithTimeout(
            () => tool.run(step.input || input, input),
            timeoutMs
          );

          const normalized = normalizeToolResult(rawOutput);
          console.log("TOOL RESULT:", normalized);

          const pushSuccess = async () => {
            outputs.push({
              step: step.name,
              tool: step.tool,
              status: "ok",
              output: normalized,
              attempt,
            });
            completedKeys.add(invocationKey);
            trace.push({ step, result: normalized });
            if (eventBus) {
              await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
                timestamp: new Date().toISOString(),
                agent: agentName,
                payload: { step: step.name, tool: step.tool, status: "ok", attempt },
              });
            }
            this.logger.info("Step dieksekusi", { step: step.name, tool: step.tool, attempt });
            done = true;
          };

          if (normalized.success === false) {
            this.logger.warn("Tool mengembalikan success=false", {
              step: step.name,
              tool: step.tool,
              message: normalized.message,
            });
            if (!isLastAttempt) {
              await new Promise(r => setTimeout(r, 500 * attempt));
              continue;
            }
            outputs.push({
              step: step.name,
              tool: step.tool,
              status: "error",
              attempt,
              output: normalized,
              reason: normalized.message || "tool reported failure",
            });
            trace.push({ step, result: normalized });
            if (eventBus) {
              await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
                timestamp: new Date().toISOString(),
                agent: agentName,
                payload: { step: step.name, tool: step.tool, status: "error", attempt, reason: normalized.message },
              });
            }
            done = true;
          } else {
            await pushSuccess();
          }

        } catch (error) {
          this.logger.warn("Tool gagal", {
            step: step.name, tool: step.tool, attempt, remaining: totalAttempts - attempt, message: error.message,
          });

          if (isLastAttempt) {
            const errOut = {
              success: false,
              data: null,
              message: error.message,
            };
            outputs.push({
              step: step.name,
              tool: step.tool,
              status: "error",
              attempt,
              reason: error.message,
              output: errOut,
            });
            trace.push({ step, result: errOut });
            if (eventBus) {
              await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
                timestamp: new Date().toISOString(),
                agent: agentName,
                payload: { step: step.name, tool: step.tool, status: "error", attempt, reason: error.message },
              });
            }
            done = true;
          } else {
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
      }
    }

    const executionTimeMs = Date.now() - startTime;

    const lastOk = [...outputs].reverse().find(o => o.status === "ok" && o.output && o.output.success !== false);
    const lastStructured = lastOk && lastOk.output ? lastOk.output : null;

    let finalResponse = plan.finalResponse || null;
    if ((!finalResponse || String(finalResponse).trim() === "") && lastStructured && lastStructured.success) {
      finalResponse = formatFinalAnswer(lastStructured);
    }

    return {
      score: typeof plan.baseScore === "number" ? plan.baseScore : 0,
      outputs,
      summary: plan.summary || "Eksekusi selesai",
      gaps: plan.gaps || [],
      recommendations: plan.recommendations || [],
      finalResponse,
      tokenUsage: tokenStats,
      executionTimeMs,
      trace,
      completedToolKeys: Array.from(completedKeys),
    };
  }
}

module.exports = { Executor };
