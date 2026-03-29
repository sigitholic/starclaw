"use strict";

const { agentConfig } = require("../../config/agent.config");

class BaseAgent {
  constructor({ name, planner, executor, memory, logger }) {
    this.name = name;
    this.planner = planner;
    this.executor = executor;
    this.memory = memory;
    this.logger = logger;
  }

  async run(input = {}) {
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
      ...input,
      context: plannerContext,
    });
    const execution = await this.executor.execute(plan, input);

    this.memory.short.remember({
      agent: this.name,
      userMessage: typeof input.message === "string" ? input.message : JSON.stringify(input),
      agentMessage: execution.finalResponse || execution.summary,
      input,
      execution,
    });

    return {
      agent: this.name,
      plan,
      ...execution,
    };
  }
}

module.exports = { BaseAgent };
