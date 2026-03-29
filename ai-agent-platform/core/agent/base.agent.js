"use strict";

const { agentConfig } = require("../../config/agent.config");
const { EVENT_TYPES } = require("../events/event.types");

class BaseAgent {
  constructor({ name, planner, executor, memory, logger }) {
    this.name = name;
    this.planner = planner;
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
