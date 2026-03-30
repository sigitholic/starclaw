"use strict";

const { ensureTokenBudget } = require("../memory/token.manager");
const { EVENT_TYPES } = require("../events/event.types");
const { agentConfig } = require("../../config/agent.config");
const { normalizeToolResult, normalizeSkillResult, formatFinalAnswer } = require("../llm/modelRouter");
const { modelManager } = require("../llm/modelManager");

class Executor {
  constructor({ toolsRegistry, skillRegistry, logger }) {
    this.toolsRegistry = toolsRegistry;
    this.skillRegistry = skillRegistry || null;
    this.logger = logger;
  }

  /**
   * Object tools untuk skill.run({ tools, input }) — referensi ke instance tool di registry.
   */
  getToolsHandle() {
    const tools = {};
    if (!this.toolsRegistry || typeof this.toolsRegistry.list !== "function") return tools;
    for (const name of this.toolsRegistry.list()) {
      const t = this.toolsRegistry.get(name);
      if (t) tools[name] = t;
    }
    return tools;
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

  /**
   * Step pseudo-tool untuk jawaban akhir dari planner (type=plan / respond step).
   */
  isRespondStep(step) {
    return step && (step.tool === "__respond__" || step.tool === "__respond");
  }

  pushDashboardTrace(trace, { stepIndex, tool, input: toolInput, output, plannerStep }) {
    const entry = {
      step: stepIndex,
      tool,
      input: toolInput != null ? toolInput : {},
      output: output != null ? output : null,
      timestamp: new Date().toISOString(),
    };
    if (plannerStep) entry.plannerStep = plannerStep;
    trace.push(entry);
  }

  /**
   * Eksekusi satu tool sesuai kontrak planner (strict).
   * Retry maksimal sesuai agentConfig.defaultToolMaxRetries (default 2).
   */
  /**
   * Eksekusi satu skill — membungkus tools tanpa mengubah kontrak tool.
   */
  async executeSkill(plan, input = {}) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";

    const skillName = plan && plan.tool;
    if (!skillName || typeof skillName !== "string" || skillName.trim() === "") {
      return {
        success: false,
        message: "Invalid plan: missing skill name",
      };
    }

    const skill = this.skillRegistry && typeof this.skillRegistry.get === "function"
      ? this.skillRegistry.get(skillName)
      : null;

    if (!skill) {
      this.logger.error("INVALID_SKILL: Skill tidak ditemukan", {
        requested: skillName,
        available: this.skillRegistry ? this.skillRegistry.list() : [],
      });
      return {
        success: false,
        message: "Skill not found",
      };
    }

    const maxRetries = Number.isInteger(plan.maxRetries) && plan.maxRetries >= 0
      ? plan.maxRetries
      : (agentConfig.defaultToolMaxRetries ?? 2);
    const timeoutMs = Number.isInteger(plan.timeoutMs) && plan.timeoutMs > 0
      ? plan.timeoutMs
      : (agentConfig.defaultToolTimeoutMs || 30000);

    const totalAttempts = 1 + maxRetries;
    let attempt = 0;
    let lastError = null;
    const tools = this.getToolsHandle();

    while (attempt < totalAttempts) {
      attempt++;
      try {
        if (eventBus) {
          await eventBus.emit(EVENT_TYPES.TOOL_CALLED, {
            timestamp: new Date().toISOString(),
            agent: agentName,
            payload: { tool: skillName, kind: "skill", attempt, maxRetries, timeoutMs },
          });
        }

        this.logger.debug("Memanggil skill", { skill: skillName, attempt, maxRetries });

        const rawOutput = await this.runWithTimeout(
          () => skill.run({ tools, input: plan.input || {} }),
          timeoutMs
        );

        const normalized = normalizeSkillResult(rawOutput);
        this.logger.debug("Skill result", { skill: skillName, success: normalized.success });

        if (normalized.success === false) {
          lastError = normalized.message || "skill reported failure";
          this.logger.warn("Skill mengembalikan success=false", {
            skill: skillName,
            message: lastError,
            attempt,
          });
          if (attempt < totalAttempts) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: { tool: skillName, kind: "skill", status: "error", attempt, reason: lastError },
            });
          }
          return normalized;
        }

        if (eventBus) {
          await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
            timestamp: new Date().toISOString(),
            agent: agentName,
            payload: { tool: skillName, kind: "skill", status: "ok", attempt },
          });
        }
        return normalized;
      } catch (err) {
        lastError = err.message;
        this.logger.warn("Skill gagal", {
          skill: skillName,
          attempt,
          remaining: totalAttempts - attempt,
          message: err.message,
        });

        if (attempt >= totalAttempts) {
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: { tool: skillName, kind: "skill", status: "error", attempt, reason: err.message },
            });
          }
          return {
            success: false,
            message: err.message,
          };
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    return {
      success: false,
      message: lastError || "Skill execution failed",
    };
  }

  async executeTool(plan, input = {}) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";

    const toolName = plan && plan.tool;
    if (!toolName || typeof toolName !== "string" || toolName.trim() === "") {
      return {
        success: false,
        message: "Invalid plan: missing tool name",
      };
    }

    const resolved = typeof this.toolsRegistry.resolve === "function"
      ? this.toolsRegistry.resolve(toolName)
      : { tool: this.toolsRegistry.get(toolName), resolvedName: toolName, wasExact: true };

    const tool = resolved.tool;
    const effectiveName = resolved.resolvedName || toolName;

    if (!tool) {
      this.logger.error("INVALID_TOOL: Tool tidak ditemukan", {
        requested: toolName,
        available: resolved.available || this.toolsRegistry.list(),
      });
      return {
        success: false,
        message: "Tool not found",
      };
    }

    if (!resolved.wasExact && resolved.resolvedName) {
      this.logger.warn("ToolGuard: fuzzy match diterapkan", {
        requested: toolName,
        resolved: resolved.resolvedName,
      });
    }

    const maxRetries = Number.isInteger(plan.maxRetries) && plan.maxRetries >= 0
      ? plan.maxRetries
      : (agentConfig.defaultToolMaxRetries ?? 2);
    const timeoutMs = Number.isInteger(plan.timeoutMs) && plan.timeoutMs > 0
      ? plan.timeoutMs
      : (agentConfig.defaultToolTimeoutMs || 30000);

    const totalAttempts = 1 + maxRetries;
    let attempt = 0;
    let lastError = null;

    while (attempt < totalAttempts) {
      attempt++;

      try {
        if (eventBus) {
          await eventBus.emit(EVENT_TYPES.TOOL_CALLED, {
            timestamp: new Date().toISOString(),
            agent: agentName,
            payload: { tool: effectiveName, attempt, maxRetries, timeoutMs },
          });
        }

        this.logger.debug("Memanggil tool", { tool: effectiveName, attempt, maxRetries });

        const rawOutput = await this.runWithTimeout(
          () => tool.run(plan.input || {}, input),
          timeoutMs
        );

        const normalized = normalizeToolResult(rawOutput);
        this.logger.debug("Tool result", { tool: effectiveName, success: normalized.success });

        if (normalized.success === false) {
          lastError = normalized.message || "tool reported failure";
          this.logger.warn("Tool mengembalikan success=false", {
            tool: effectiveName,
            message: lastError,
            attempt,
          });
          if (attempt < totalAttempts) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: { tool: effectiveName, status: "error", attempt, reason: lastError },
            });
          }
          return normalized;
        }

        if (eventBus) {
          await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
            timestamp: new Date().toISOString(),
            agent: agentName,
            payload: { tool: effectiveName, status: "ok", attempt },
          });
        }
        return normalized;
      } catch (err) {
        lastError = err.message;
        this.logger.warn("Tool gagal", {
          tool: effectiveName,
          attempt,
          remaining: totalAttempts - attempt,
          message: err.message,
        });

        if (attempt >= totalAttempts) {
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.TOOL_RESULT, {
              timestamp: new Date().toISOString(),
              agent: agentName,
              payload: { tool: effectiveName, status: "error", attempt, reason: err.message },
            });
          }
          return {
            success: false,
            message: err.message,
          };
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    return {
      success: false,
      message: lastError || "Tool execution failed",
    };
  }

  async execute(plan, input) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";
    const execCtx = input && input.__agentExecution ? input.__agentExecution : null;
    const stopAfterFirstSuccess = Boolean(input && input.__stopAfterFirstSuccess);
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

    this.logger.debug("Token usage sebelum eksekusi", tokenStats);

    const startTime = Date.now();

    if (plan && plan.plannerDecision === "respond") {
      const msg = plan.finalResponse != null ? String(plan.finalResponse) : "";
      const executionTimeMs = Date.now() - startTime;
      return {
        score: typeof plan.baseScore === "number" ? plan.baseScore : 0,
        outputs: [],
        summary: plan.summary || "Respons langsung",
        gaps: plan.gaps || [],
        recommendations: plan.recommendations || [],
        finalResponse: msg,
        tokenUsage: tokenStats,
        executionTimeMs,
        trace,
        completedToolKeys: Array.from(completedKeys),
      };
    }

    let stepOrdinal = 0;
    for (const step of plan.steps || []) {
      stepOrdinal++;
      this.logger.debug("Plan step", { step: stepOrdinal, tool: step.tool });

      if (this.isRespondStep(step)) {
        const msg = String(
          (step.input && step.input.message != null && step.input.message !== "")
            ? step.input.message
            : (plan.finalResponse || "")
        );
        const normalized = normalizeToolResult({
          success: true,
          data: { message: msg },
          message: "respond",
        });
        outputs.push({
          step: step.name,
          tool: "__respond__",
          status: "ok",
          output: normalized,
          attempt: 1,
        });
        this.pushDashboardTrace(trace, {
          stepIndex: stepOrdinal,
          tool: "__respond__",
          input: step.input || {},
          output: normalized,
          plannerStep: step,
        });
        if (execCtx && typeof execCtx.onToolComplete === "function") {
          execCtx.onToolComplete({ stepOrdinal, tool: "__respond__", normalized });
        }
        completedKeys.add(this.toolInvocationKey("__respond__", step.input || {}));
        continue;
      }

      const invocationKey = this.toolInvocationKey(step.tool, step.input || {});

      if (completedKeys.has(invocationKey)) {
        const skipMsg = `Dilewati: tool "${step.tool}" dengan input yang sama sudah dieksekusi sebelumnya.`;
        this.logger.warn("Executor: skip duplicate tool invocation", { tool: step.tool, key: invocationKey });
        const skipOut = { success: false, data: null, message: skipMsg };
        outputs.push({
          step: step.name,
          tool: step.tool,
          status: "skipped",
          reason: "DUPLICATE_TOOL",
          output: skipOut,
          attempt: 0,
        });
        this.pushDashboardTrace(trace, {
          stepIndex: stepOrdinal,
          tool: step.tool,
          input: step.input || {},
          output: skipOut,
          plannerStep: step,
        });
        continue;
      }

      const planStep = {
        tool: step.tool,
        input: step.input || {},
        timeoutMs: step.timeoutMs,
        maxRetries: step.maxRetries,
        isSkill: Boolean(step.isSkill),
      };

      const normalized = step.isSkill
        ? await this.executeSkill(planStep, {
          ...input,
          __eventBus: eventBus,
          __agentName: agentName,
        })
        : await this.executeTool(planStep, {
          ...input,
          __eventBus: eventBus,
          __agentName: agentName,
        });

      if (normalized.success === false) {
        outputs.push({
          step: step.name,
          tool: step.tool,
          status: "error",
          output: normalized,
          reason: normalized.message || "tool reported failure",
        });
        this.pushDashboardTrace(trace, {
          stepIndex: stepOrdinal,
          tool: step.tool,
          input: step.input || {},
          output: normalized,
          plannerStep: step,
        });
        if (execCtx && typeof execCtx.onToolComplete === "function") {
          execCtx.onToolComplete({ stepOrdinal, tool: step.tool, normalized });
        }
        continue;
      }

      outputs.push({
        step: step.name,
        tool: step.tool,
        status: "ok",
        output: normalized,
        attempt: 1,
      });
      completedKeys.add(invocationKey);
      this.pushDashboardTrace(trace, {
        stepIndex: stepOrdinal,
        tool: step.tool,
        input: step.input || {},
        output: normalized,
        plannerStep: step,
      });
      if (execCtx && typeof execCtx.onToolComplete === "function") {
        execCtx.onToolComplete({ stepOrdinal, tool: step.tool, normalized });
      }
      this.logger.info("Step dieksekusi", { step: step.name, tool: step.tool });

      if (stopAfterFirstSuccess && normalized.success === true) {
        break;
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
