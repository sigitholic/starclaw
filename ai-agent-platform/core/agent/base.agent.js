"use strict";

const crypto = require("crypto");
const { agentConfig } = require("../../config/agent.config");
const { EVENT_TYPES } = require("../events/event.types");
const { modelManager } = require("../llm/modelManager");
const { agentExecutionStore } = require("../orchestrator/agent.execution.store");

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
    const stepCount = typeof cleanInput.__stepCount === "number" ? cleanInput.__stepCount : 1;
    if (stepCount > maxSteps) {
      const msg = "Execution stopped: too many steps (possible loop)";
      this.logger.warn(msg, { stepCount, maxSteps });
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
      if (eventBus) {
        await eventBus.emit(EVENT_TYPES.AGENT_FINISHED, {
          timestamp: new Date().toISOString(),
          agent: this.name,
          payload: { summary: msg, finalResponse: msg, score: 0, action: "respond", runId },
        });
      }
      return {
        agent: this.name,
        plan: { plannerDecision: "respond", steps: [], summary: msg },
        action: "respond",
        message: msg,
        __runId: runId,
        __modelId: routing.modelId,
        __routingMode: routing.routingMode,
        ...errResult,
      };
    }

    console.log("MODEL:", modelManager.getModel());

    // Gunakan async context builder jika tersedia (mendukung LLM summarizer)
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

    const plan = await this.planner.createPlan({
      ...cleanInput,
      __stepCount: stepCount,
      context: plannerContext,
      __agentName: this.name,
      __eventBus: eventBus,
    });

    if (this.reviewer && plan.plannerDecision === "tool") {
      this.logger.info("Meminta Reviewer Agent untuk mengevaluasi plan", { stepCount: plan.steps ? plan.steps.length : 0 });
      
      if (eventBus) {
        await eventBus.emit(EVENT_TYPES.PLANNER_DECISION, {
          timestamp: new Date().toISOString(),
          agent: this.name + "-reviewer",
          payload: { summary: "Mengevaluasi keamanan instruksi..." }
        });
      }

      const review = await this.reviewer.reviewPlan(plan, cleanInput);
      
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

        this.memory.short.remember({
          agent: this.name,
          userMessage: typeof cleanInput.message === "string" ? cleanInput.message : JSON.stringify(cleanInput),
          agentMessage: vetoExecution.finalResponse,
          input: cleanInput,
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
          message: vetoExecution.finalResponse,
          __runId: runId,
          __modelId: routing.modelId,
          __routingMode: routing.routingMode,
          ...vetoExecution,
        };
      }
      this.logger.info("Reviewer menyetujui plan", { reason: review.reason });
    }

    const execution = await this.executor.execute(plan, {
      ...cleanInput,
      __runId: runId,
      __agentName: this.name,
      __eventBus: eventBus,
      __executionTrace: cleanInput.__executionTrace,
      __completedToolKeys: cleanInput.__completedToolKeys,
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

    if (typeof this.memory.short.addToolResult === "function" && Array.isArray(execution.outputs)) {
      for (const out of execution.outputs) {
        if (out.output !== undefined && out.tool !== "__respond__") {
          this.memory.short.addToolResult({
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

    const goalReached =
      plan.plannerDecision === "respond" ||
      Boolean(execution.finalResponse && String(execution.finalResponse).trim() !== "");

    const envelope = {
      action: "respond",
      message: execution.finalResponse || execution.summary || "",
      runId,
      modelId: routing.modelId,
      routingMode: routing.routingMode,
    };

    agentExecutionStore.setExecutionState(this.name, runId, {
      ...agentExecutionStore.get(this.name, runId).executionState,
      status: "done",
      goalReached,
      terminatedReason: goalReached ? "goal_reached" : "completed",
    });
    const prevSnap = agentExecutionStore.get(this.name, runId);
    const mergedTrace = [
      ...(prevSnap && Array.isArray(prevSnap.trace) ? prevSnap.trace : []),
      ...(execution.trace || []),
    ];
    agentExecutionStore.patch(this.name, runId, {
      trace: mergedTrace,
    });

    this.memory.short.remember({
      agent: this.name,
      userMessage: typeof cleanInput.message === "string" ? cleanInput.message : JSON.stringify(cleanInput),
      agentMessage: envelope.message,
      input: cleanInput,
      execution,
    });

    modelManager.restoreModel(routing.previousModel);

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.AGENT_FINISHED, {
        timestamp: new Date().toISOString(),
        agent: this.name,
        payload: {
          summary: execution.summary,
          finalResponse: envelope.message,
          score: execution.score,
          action: envelope.action,
          runId,
        },
      });
    }

    return {
      agent: this.name,
      plan,
      ...execution,
      action: envelope.action,
      message: envelope.message,
      __runId: runId,
      __modelId: routing.modelId,
      __routingMode: routing.routingMode,
      __executionTrace: execution.trace || [],
      __completedToolKeys: execution.completedToolKeys || [],
    };
  }
}

module.exports = { BaseAgent };
