"use strict";

const { agentConfig } = require("../../config/agent.config");
const { EVENT_TYPES } = require("../events/event.types");

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

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.AGENT_STARTED, {
        timestamp: new Date().toISOString(),
        agent: this.name,
        payload: { input: cleanInput },
      });
    }

    this.logger.info("Agent menerima input", { agent: this.name });
    const plannerContext = this.memory.short.buildPlannerContext({
      maxTokens: agentConfig.defaultTokenBudget,
      keepRecent: agentConfig.plannerRecentWindow,
    });

    if (plannerContext.didSummarize) {
      this.logger.info("Summarization terjadi karena context limit", {
        agent: this.name,
        tokenUsage: plannerContext.tokenUsage,
        fullHistoryUsage: plannerContext.fullHistoryUsage,
      });
    }

    const plan = await this.planner.createPlan({
      ...cleanInput,
      context: plannerContext,
      __agentName: this.name,
      __eventBus: eventBus,
    });

    if (this.reviewer && plan.plannerDecision === "tool") {
      this.logger.info("Meminta Reviewer Agent untuk mengevaluasi plan", { stepCount: plan.steps?.length });
      
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
          score: 0
        };

        this.memory.short.remember({
          agent: this.name,
          userMessage: typeof cleanInput.message === "string" ? cleanInput.message : JSON.stringify(cleanInput),
          agentMessage: vetoExecution.finalResponse,
          input: cleanInput,
          execution: vetoExecution,
        });

        if (eventBus) {
          await eventBus.emit(EVENT_TYPES.AGENT_FINISHED, {
            timestamp: new Date().toISOString(),
            agent: this.name,
            payload: vetoExecution,
          });
        }

        return { agent: this.name, plan, ...vetoExecution };
      }
      this.logger.info("Reviewer menyetujui plan", { reason: review.reason });
    }

    const execution = await this.executor.execute(plan, {
      ...cleanInput,
      __agentName: this.name,
      __eventBus: eventBus,
    });

    this.memory.short.remember({
      agent: this.name,
      userMessage: typeof cleanInput.message === "string" ? cleanInput.message : JSON.stringify(cleanInput),
      agentMessage: execution.finalResponse || execution.summary,
      input: cleanInput,
      execution,
    });

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.AGENT_FINISHED, {
        timestamp: new Date().toISOString(),
        agent: this.name,
        payload: {
          summary: execution.summary,
          finalResponse: execution.finalResponse,
          score: execution.score,
        },
      });
    }

    return {
      agent: this.name,
      plan,
      ...execution,
    };
  }
}

module.exports = { BaseAgent };
