"use strict";

const { normalizePlannerDecision } = require("../utils/validator");
const { EVENT_TYPES } = require("../events/event.types");
const { newPlanner } = require("./intent.skill.match");
const { memory } = require("../memory/shortMemory");

/**
 * Planner hanya memakai rule-based (newPlanner) — tanpa LLM routing / plan().
 */
class Planner {
  constructor({ llmProvider, promptBuilder, toolsRegistry, skillRegistry, logger }) {
    this.llmProvider = llmProvider;
    this.promptBuilder = promptBuilder;
    this.toolsRegistry = toolsRegistry;
    this.skillRegistry = skillRegistry || null;
    this.logger = logger;
  }

  async createPlan(input) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";

    const message = typeof input.message === "string" ? input.message : "";
    const sessionId =
      (input && typeof input.__sessionId === "string" && input.__sessionId.trim()
        ? input.__sessionId.trim()
        : null) ||
      (input && typeof input.__channelSessionId === "string" && input.__channelSessionId.trim()
        ? input.__channelSessionId.trim()
        : "default");

    const sessionMemory =
      input && input.__sessionMemory && typeof input.__sessionMemory.get === "function"
        ? input.__sessionMemory
        : memory;

    const rule = newPlanner(message, sessionMemory, sessionId, {
      openclawSnapshot: input && input.openclawSnapshot,
    });
    const normalizedPlan = normalizePlannerDecision(rule.raw);

    // eslint-disable-next-line no-console
    console.log("PLAN:", normalizedPlan);
    // eslint-disable-next-line no-console
    console.log("MEMORY:", memory.store);

    this.logger.info("Planner decision (rule-based)", {
      decision: normalizedPlan.plannerDecision,
      stepCount: normalizedPlan.steps.length,
      intentType: rule.intent && rule.intent.type,
    });

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.PLANNER_DECISION, {
        timestamp: new Date().toISOString(),
        agent: agentName,
        payload: {
          decision: normalizedPlan.plannerDecision,
          stepCount: normalizedPlan.steps.length,
          summary: normalizedPlan.summary,
          source: "rule-based-planner",
          intentType: rule.intent && rule.intent.type,
        },
      });
    }

    return normalizedPlan;
  }
}

module.exports = { Planner };
