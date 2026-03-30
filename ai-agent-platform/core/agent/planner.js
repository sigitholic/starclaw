"use strict";

const { normalizePlannerDecision } = require("../utils/validator");
const { EVENT_TYPES } = require("../events/event.types");
const { selectRelevantTools, extractPreviousTools, mergePlannerSchemas } = require("./tool.selector");
const {
  matchIntentToSkill,
  fallbackToSkill,
  coerceForbiddenToolsToSkill,
} = require("./intent.skill.match");
const { modelManager } = require("../llm/modelManager");

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

    // Ambil semua tool schemas dari registry
    const allToolSchemas = this.toolsRegistry ? this.toolsRegistry.getToolSchemas() : [];
    const skillSchemas =
      this.skillRegistry && typeof this.skillRegistry.getSkillSchemas === "function"
        ? this.skillRegistry.getSkillSchemas()
        : [];
    const mergedSchemas = mergePlannerSchemas(allToolSchemas, skillSchemas).filter(
      s => s && s.name !== "shell-tool",
    );

    // Smart Tool Selection — kirim hanya tool/skill relevan ke LLM
    // Hemat ~2000-3000 token per call untuk task yang tidak butuh semua tool
    const message = typeof input.message === "string" ? input.message : "";
    const previousTools = extractPreviousTools(input.observations || []);
    const requiredTools = input.__requiredTools || [];

    const selectedSchemas = selectRelevantTools(mergedSchemas, message, {
      requiredTools,
      previousTools,
    });

    if (selectedSchemas.length < mergedSchemas.length) {
      this.logger.info("Smart tool selection aktif", {
        total: mergedSchemas.length,
        selected: selectedSchemas.length,
        savedTokensEst: Math.round((mergedSchemas.length - selectedSchemas.length) * 150),
      });
    }

    const prompt = this.promptBuilder.buildPlanningPrompt(input, selectedSchemas);

    this.logger.debug("Planner model", { model: modelManager.getModel() });

    const canShortCircuitIntent =
      !input.__isRegenerate && (!input.observations || input.observations.length === 0);

    // Skill-first deterministik: tanpa observasi, selalu skill (bukan tool langsung)
    if (canShortCircuitIntent && this.skillRegistry) {
      const intentSkill =
        matchIntentToSkill(message, this.skillRegistry) ||
        (typeof this.skillRegistry.has === "function" && this.skillRegistry.has("check-system-health")
          ? fallbackToSkill()
          : null);
      if (intentSkill) {
        const normalizedPlan = normalizePlannerDecision(intentSkill);
        // eslint-disable-next-line no-console
        console.log("PLANNER RESULT:", normalizedPlan);
        this.logger.info("Planner decision (skill-first deterministik)", {
          decision: normalizedPlan.plannerDecision,
          skill: normalizedPlan.steps[0]?.tool,
        });
        if (eventBus) {
          await eventBus.emit(EVENT_TYPES.PLANNER_DECISION, {
            timestamp: new Date().toISOString(),
            agent: agentName,
            payload: {
              decision: normalizedPlan.plannerDecision,
              stepCount: normalizedPlan.steps.length,
              summary: normalizedPlan.summary,
              toolsInPrompt: selectedSchemas.length,
              source: "intent-skill-match",
            },
          });
        }
        return normalizedPlan;
      }
    }

    const rawDecision = await this.llmProvider.plan(prompt, input);
    const coerced = coerceForbiddenToolsToSkill(
      rawDecision,
      message,
      this.skillRegistry,
    );
    const normalizedPlan = normalizePlannerDecision(coerced);

    this.logger.info("Planner decision", {
      decision: normalizedPlan.plannerDecision,
      stepCount: normalizedPlan.steps.length,
    });
    // eslint-disable-next-line no-console
    console.log("PLANNER RESULT:", normalizedPlan);

    if (eventBus) {
      await eventBus.emit(EVENT_TYPES.PLANNER_DECISION, {
        timestamp: new Date().toISOString(),
        agent: agentName,
        payload: {
          decision: normalizedPlan.plannerDecision,
          stepCount: normalizedPlan.steps.length,
          summary: normalizedPlan.summary,
          toolsInPrompt: selectedSchemas.length,
        },
      });
    }

    return normalizedPlan;
  }
}

module.exports = { Planner };
