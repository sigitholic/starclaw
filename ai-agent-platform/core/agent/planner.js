"use strict";

class Planner {
  constructor({ llmProvider, promptBuilder }) {
    this.llmProvider = llmProvider;
    this.promptBuilder = promptBuilder;
  }

  async createPlan(input) {
    const prompt = this.promptBuilder.buildPlanningPrompt(input);
    const plan = await this.llmProvider.plan(prompt, input);
    return plan;
  }
}

module.exports = { Planner };
