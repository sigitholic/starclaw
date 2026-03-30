"use strict";

const crypto = require("crypto");
const { agentConfig } = require("../../config/agent.config");
const { applyPlannerSuccessRespondPolicy } = require("../utils/validator");
const { EVENT_TYPES } = require("../events/event.types");
const { modelManager } = require("../llm/modelManager");
const { agentExecutionStore } = require("../orchestrator/agent.execution.store");
const { createExecutionState, appendTrace } = require("./stateManager");
const { formatResponse } = require("./formatter");
const { wrapMemoryForExecution } = require("../memory/memory");
const { getSessionSnapshot, patchSession, memory } = require("../memory/shortMemory");

class BaseAgent {
  constructor({ name, planner, reviewer, executor, memory, logger }) {
    this.name = name;
    this.planner = planner;
    this.reviewer = reviewer;
    this.executor = executor;
    this.memory = memory;
    this.logger = logger;
  }

  async run(input = {}) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const cleanInput = input && typeof input === "object" ? { ...input } : {};
    if (cleanInput.__eventBus) {
      delete cleanInput.__eventBus;
    }

    const runId =
      typeof cleanInput.__runId === "string" && cleanInput.__runId
        ? cleanInput.__runId
        : `run-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const sessionId =
      (typeof cleanInput.__sessionId === "string" && cleanInput.__sessionId.trim()
        ? cleanInput.__sessionId.trim()
        : null) ||
      (typeof cleanInput.__channelSessionId === "string" && cleanInput.__channelSessionId.trim()
        ? cleanInput.__channelSessionId.trim()
        : null) ||
      this.name;

    const routing = modelManager.applyModelRouting(cleanInput);
    const storeEntry = agentExecutionStore.getOrCreate(this.name, runId);
    agentExecutionStore.setExecutionState(this.name, runId, {
      ...storeEntry.executionState,
      status: "running",
      currentStep: typeof cleanInput.__stepCount === "number" ? cleanInput.__stepCount : 1,
      maxSteps: agentConfig.maxExecutionSteps || 5,
      goalReached: false,
      terminatedReason: null,
      modelId: routing.modelId,
      routingMode: routing.routingMode,
    });
    if (!cleanInput.__isContinuation) {
      agentExecutionStore.patch(this.name, runId, { trace: [], stepHistory: [] });
    }

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.AGENT_STARTED, {
        timestamp: new Date().toISOString(),
        agent: this.name,
        payload: { input: cleanInput },
      });
    }

    this.logger.info("Agent menerima input", { agent: this.name });

    const maxSteps = agentConfig.maxExecutionSteps || 5;
    const initialStepCount = typeof cleanInput.__stepCount === "number" ? cleanInput.__stepCount : 1;
    if (initialStepCount > maxSteps) {
      return await this._terminateMaxStepsEarly({
        cleanInput,
        runId,
        routing,
        eventBus,
        msg: "Execution stopped: too many steps (possible loop)",
      });
    }

    this.logger.debug("Model aktif", { model: modelManager.getModel() });

    const memoryApi = wrapMemoryForExecution(this.memory);
    const execState = createExecutionState({ maxSteps });
    if (cleanInput.__executionState && Array.isArray(cleanInput.__executionState.history)) {
      execState.history = [...cleanInput.__executionState.history];
    }

    let loopInput = {
      ...cleanInput,
      __sessionId: sessionId,
    };
    let lastExecution = null;
    let lastPlan = null;

    while (!execState.isCompleted && execState.stepCount < execState.maxSteps) {
      const plannerContext = typeof this.memory.short.buildPlannerContextAsync === "function"
        ? await this.memory.short.buildPlannerContextAsync({
            maxTokens: agentConfig.defaultTokenBudget,
            keepRecent: agentConfig.plannerRecentWindow,
          })
        : this.memory.short.buildPlannerContext({
            maxTokens: agentConfig.defaultTokenBudget,
            keepRecent: agentConfig.plannerRecentWindow,
          });

      if (plannerContext.didSummarize) {
        this.logger.info("Summarization terjadi karena context limit", {
          agent: this.name,
          tokenUsage: plannerContext.tokenUsage,
          fullHistoryUsage: plannerContext.fullHistoryUsage,
          method: agentConfig.useLLMSummarizer ? "llm" : "rule-based",
        });
      }

      let plan = await this.planner.createPlan({
        ...loopInput,
        __stepCount: execState.stepCount + 1,
        context: plannerContext,
        __agentName: this.name,
        __eventBus: eventBus,
        __shortMemory: getSessionSnapshot(sessionId),
        __sessionMemory: memory,
      });

      plan = applyPlannerSuccessRespondPolicy(plan, loopInput.__lastToolResult);

      if (this.reviewer && (plan.plannerDecision === "tool" || plan.plannerDecision === "skill")) {
        this.logger.info("Meminta Reviewer Agent untuk mengevaluasi plan", {
          stepCount: plan.steps ? plan.steps.length : 0,
        });

        if (eventBus) {
          await eventBus.emit(EVENT_TYPES.PLANNER_DECISION, {
            timestamp: new Date().toISOString(),
            agent: `${this.name}-reviewer`,
            payload: { summary: "Mengevaluasi keamanan instruksi..." },
          });
        }

        const review = await this.reviewer.reviewPlan(plan, loopInput);

        if (!review.approved) {
          this.logger.warn("Agent Veto: Rencana ditolak oleh Reviewer", { reason: review.reason });
          const vetoExecution = {
            success: false,
            summary: "Instruksi diveto oleh Reviewer Agent: " + review.reason,
            finalResponse: "Sistem Keamanan Starclaw (Reviewer) mencegah saya melakukan tindakan ini. Alasan: " + review.reason,
            score: 0,
            gaps: Array.isArray(plan.gaps) ? plan.gaps : [],
            recommendations: Array.isArray(plan.recommendations) ? plan.recommendations : [],
          };

          const userMessage = formatResponse({
            success: false,
            message: vetoExecution.finalResponse,
          });

          this.memory.short.remember({
            agent: this.name,
            userMessage: typeof loopInput.message === "string" ? loopInput.message : JSON.stringify(loopInput),
            agentMessage: userMessage,
            input: loopInput,
            execution: vetoExecution,
          });

          agentExecutionStore.setExecutionState(this.name, runId, {
            ...agentExecutionStore.get(this.name, runId).executionState,
            status: "done",
            goalReached: false,
            terminatedReason: "reviewer_veto",
          });
          modelManager.restoreModel(routing.previousModel);
          if (eventBus) {
            await eventBus.emit(EVENT_TYPES.AGENT_FINISHED, {
              timestamp: new Date().toISOString(),
              agent: this.name,
              payload: { ...vetoExecution, action: "respond", runId },
            });
          }

          return {
            agent: this.name,
            plan,
            action: "respond",
            message: userMessage,
            __runId: runId,
            __modelId: routing.modelId,
            __routingMode: routing.routingMode,
            ...vetoExecution,
            finalResponse: userMessage,
          };
        }
        this.logger.info("Reviewer menyetujui plan", { reason: review.reason });
      }

      if (plan.plannerDecision === "respond") {
        execState.isCompleted = true;
        const rawMsg = plan.finalResponse != null ? String(plan.finalResponse) : "";
        const lastTool =
          execState.lastToolName ||
          (execState.history && execState.history.length
            ? execState.history[execState.history.length - 1].tool
            : undefined);
        const userMessage = formatResponse(rawMsg || execState.lastResult, lastTool);
        lastPlan = plan;
        lastExecution = {
          score: typeof plan.baseScore === "number" ? plan.baseScore : 0,
          outputs: [],
          summary: plan.summary || "Respons langsung",
          gaps: plan.gaps || [],
          recommendations: plan.recommendations || [],
          finalResponse: userMessage,
          tokenUsage: { used: 0, budget: agentConfig.defaultTokenBudget || 4000, withinBudget: true },
          executionTimeMs: 0,
          trace: loopInput.__executionTrace || [],
          completedToolKeys: loopInput.__completedToolKeys || [],
        };
        break;
      }

      if (!plan.steps || plan.steps.length === 0) {
        execState.isCompleted = true;
        const userMessage = formatResponse({
          success: false,
          message: "Plan tool tidak memiliki langkah yang valid",
        });
        lastPlan = plan;
        lastExecution = {
          score: 0,
          outputs: [],
          summary: plan.summary || "Plan tidak valid",
          gaps: plan.gaps || [],
          recommendations: plan.recommendations || [],
          finalResponse: userMessage,
          tokenUsage: { used: 0, budget: agentConfig.defaultTokenBudget || 4000, withinBudget: true },
          executionTimeMs: 0,
          trace: loopInput.__executionTrace || [],
          completedToolKeys: loopInput.__completedToolKeys || [],
        };
        break;
      }

      const execution = await this.executor.execute(plan, {
        ...loopInput,
        __runId: runId,
        __agentName: this.name,
        __eventBus: eventBus,
        __executionTrace: loopInput.__executionTrace,
        __completedToolKeys: loopInput.__completedToolKeys,
        __stopAfterFirstSuccess: true,
        __agentExecution: {
          runId,
          onToolComplete: ({ stepOrdinal, tool, normalized }) => {
            agentExecutionStore.appendStepHistory(this.name, runId, {
              step: stepOrdinal,
              tool,
              result: normalized,
            });
            agentExecutionStore.setLastToolResult(this.name, runId, normalized);
            agentExecutionStore.setExecutionState(this.name, runId, {
              ...agentExecutionStore.get(this.name, runId).executionState,
              currentStep: stepOrdinal,
            });
          },
        },
      });

      lastExecution = execution;
      lastPlan = plan;

      for (const out of execution.outputs || []) {
        if (out.status !== "ok" || !out.output || out.output.success === false) continue;
        if (out.tool !== "run-system-command") continue;
        const detail = out.output.detail && typeof out.output.detail === "object" ? out.output.detail : {};
        const target = detail.target;
        if (typeof target === "string" && target.trim()) {
          patchSession(sessionId, { lastPingTarget: target.trim() });
        }
      }

      if (typeof memoryApi.add === "function" && Array.isArray(execution.outputs)) {
        for (const out of execution.outputs) {
          if (out.output !== undefined && out.tool !== "__respond__") {
            memoryApi.add({
              role: "tool",
              name: out.tool || "tool",
              content: JSON.stringify({
                status: out.status,
                output: out.output,
                reason: out.reason,
              }),
            });
          }
        }
      }

      const lastOk = [...(execution.outputs || [])].reverse().find(
        (o) => o.status === "ok" && o.output && o.output.success !== false
      );
      const toolResult = lastOk && lastOk.output ? lastOk.output : null;

      if (toolResult) {
        execState.lastResult = toolResult;
        execState.lastToolName = lastOk.tool;
        appendTrace(execState, {
          tool: lastOk.tool,
          input: (plan.steps && plan.steps[0] && plan.steps[0].input) || {},
          output: toolResult,
        });
      }

      const prevSnap = agentExecutionStore.get(this.name, runId);
      const mergedTrace = [
        ...(prevSnap && Array.isArray(prevSnap.trace) ? prevSnap.trace : []),
        ...(execution.trace || []),
      ];
      agentExecutionStore.patch(this.name, runId, { trace: mergedTrace });

      execState.stepCount++;

      if (toolResult && toolResult.success === true) {
        execState.isCompleted = true;
        const userMessage = formatResponse(toolResult, lastOk.tool);
        lastExecution = {
          ...execution,
          finalResponse: userMessage,
        };
        break;
      }

      const failedOutputs = (execution.outputs || []).filter(
        (o) => o.status === "error" || (o.output && o.output.success === false)
      );
      if (failedOutputs.length > 0) {
        execState.isCompleted = true;
        const err = failedOutputs[failedOutputs.length - 1];
        const errPayload = err.output || { success: false, message: err.reason || "Tool error" };
        const userMessage = formatResponse(errPayload, err.tool);
        lastExecution = {
          ...execution,
          finalResponse: userMessage,
        };
        break;
      }

      loopInput = {
        ...cleanInput,
        __isContinuation: true,
        __stepCount: execState.stepCount + 1,
        __lastToolResult: toolResult,
        __executionTrace: execution.trace || [],
        __completedToolKeys: execution.completedToolKeys || [],
      };
    }

    if (!execState.isCompleted && execState.stepCount >= execState.maxSteps) {
      const maxMsg = "❌ Execution stopped (loop detected)";
      lastExecution = lastExecution || {
        score: 0,
        outputs: [],
        summary: maxMsg,
        gaps: [],
        recommendations: [],
        finalResponse: maxMsg,
        tokenUsage: { used: 0, budget: agentConfig.defaultTokenBudget || 4000, withinBudget: true },
        executionTimeMs: 0,
        trace: loopInput.__executionTrace || [],
        completedToolKeys: loopInput.__completedToolKeys || [],
      };
      lastExecution.finalResponse = maxMsg;
      execState.isCompleted = true;
    }

    const execution = lastExecution;
    const plan = lastPlan;

    if (!execution) {
      const fallback = formatResponse({ success: false, message: "Tidak ada hasil eksekusi" });
      modelManager.restoreModel(routing.previousModel);
      return {
        agent: this.name,
        plan: plan || { plannerDecision: "respond", steps: [] },
        action: "respond",
        message: fallback,
        __runId: runId,
        __modelId: routing.modelId,
        __routingMode: routing.routingMode,
        finalResponse: fallback,
        summary: "Error",
        score: 0,
        outputs: [],
        gaps: [],
        recommendations: [],
        __executionTrace: [],
        __completedToolKeys: [],
      };
    }

    const userFacingMessage = formatResponse(
      execution.finalResponse != null && String(execution.finalResponse).trim() !== ""
        ? execution.finalResponse
        : execState.lastResult,
      execState.lastToolName ||
        (execState.history && execState.history.length
          ? execState.history[execState.history.length - 1].tool
          : undefined)
    );

    const goalReached =
      (plan && plan.plannerDecision === "respond") ||
      Boolean(userFacingMessage && String(userFacingMessage).trim() !== "");

    agentExecutionStore.setExecutionState(this.name, runId, {
      ...agentExecutionStore.get(this.name, runId).executionState,
      status: "done",
      goalReached,
      terminatedReason: goalReached ? "goal_reached" : "completed",
    });

    this.memory.short.remember({
      agent: this.name,
      userMessage: typeof cleanInput.message === "string" ? cleanInput.message : JSON.stringify(cleanInput),
      agentMessage: userFacingMessage,
      input: cleanInput,
      execution: { ...execution, finalResponse: userFacingMessage },
    });

    modelManager.restoreModel(routing.previousModel);

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.AGENT_FINISHED, {
        timestamp: new Date().toISOString(),
        agent: this.name,
        payload: {
          summary: execution.summary,
          finalResponse: userFacingMessage,
          score: execution.score,
          action: "respond",
          runId,
        },
      });
    }

    return {
      agent: this.name,
      plan: plan || { plannerDecision: "respond", steps: [] },
      ...execution,
      finalResponse: userFacingMessage,
      action: "respond",
      message: userFacingMessage,
      __runId: runId,
      __modelId: routing.modelId,
      __routingMode: routing.routingMode,
      __executionTrace: execution.trace || [],
      __completedToolKeys: execution.completedToolKeys || [],
      __executionState: execState,
    };
  }

  async _terminateMaxStepsEarly({ cleanInput, runId, routing, eventBus, msg }) {
    this.logger.warn(msg, { agent: this.name });
    const errResult = {
      score: 0,
      outputs: [],
      summary: msg,
      gaps: [],
      recommendations: [],
      finalResponse: msg,
      tokenUsage: { used: 0, budget: agentConfig.defaultTokenBudget || 4000, withinBudget: true },
      executionTimeMs: 0,
      trace: Array.isArray(cleanInput.__executionTrace) ? cleanInput.__executionTrace : [],
    };
    agentExecutionStore.setExecutionState(this.name, runId, {
      ...agentExecutionStore.get(this.name, runId).executionState,
      status: "terminated",
      goalReached: false,
      terminatedReason: "max_steps",
    });
    agentExecutionStore.patch(this.name, runId, { trace: errResult.trace });
    this.memory.short.remember({
      agent: this.name,
      userMessage: typeof cleanInput.message === "string" ? cleanInput.message : JSON.stringify(cleanInput),
      agentMessage: msg,
      input: cleanInput,
      execution: errResult,
    });
    modelManager.restoreModel(routing.previousModel);
    const userMsg = formatResponse(msg);
    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.AGENT_FINISHED, {
        timestamp: new Date().toISOString(),
        agent: this.name,
        payload: { summary: userMsg, finalResponse: userMsg, score: 0, action: "respond", runId },
      });
    }
    return {
      agent: this.name,
      plan: { plannerDecision: "respond", steps: [], summary: userMsg },
      action: "respond",
      message: userMsg,
      __runId: runId,
      __modelId: routing.modelId,
      __routingMode: routing.routingMode,
      ...errResult,
      finalResponse: userMsg,
      summary: userMsg,
    };
  }
}

module.exports = { BaseAgent };
