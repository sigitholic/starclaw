"use strict";

const { normalizePlannerDecision } = require("../utils/validator");
const { EVENT_TYPES } = require("../events/event.types");

class Planner {
  constructor({ llmProvider, promptBuilder, logger }) {
    this.llmProvider = llmProvider;
    this.promptBuilder = promptBuilder;
    this.logger = logger;
  }

  async createPlan(input) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";
    const prompt = this.promptBuilder.buildPlanningPrompt(input);
    const rawDecision = await this.llmProvider.plan(prompt, input);
    const normalizedPlan = normalizePlannerDecision(rawDecision);

    this.logger.info("Planner decision", {
      decision: normalizedPlan.plannerDecision,
      stepCount: normalizedPlan.steps.length,
    });

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.PLANNER_DECISION, {
        timestamp: new Date().toISOString(),
        agent: agentName,
        payload: {
          decision: normalizedPlan.plannerDecision,
          stepCount: normalizedPlan.steps.length,
          summary: normalizedPlan.summary,
        },
      });
    }

    return normalizedPlan;
  }
}

module.exports = { Planner };
