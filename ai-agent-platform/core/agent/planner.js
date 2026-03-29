"use strict";

const { normalizePlannerDecision } = require("../utils/validator");

class Planner {
  constructor({ llmProvider, promptBuilder, logger }) {
    this.llmProvider = llmProvider;
    this.promptBuilder = promptBuilder;
    this.logger = logger;
  }

  async createPlan(input) {
    const prompt = this.promptBuilder.buildPlanningPrompt(input);
    const rawDecision = await this.llmProvider.plan(prompt, input);
    const normalizedPlan = normalizePlannerDecision(rawDecision);

    this.logger.info("Planner decision", {
      decision: normalizedPlan.plannerDecision,
      stepCount: normalizedPlan.steps.length,
    });

    return normalizedPlan;
  }
}

module.exports = { Planner };
