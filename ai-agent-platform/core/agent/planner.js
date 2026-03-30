"use strict";

const { normalizePlannerDecision } = require("../utils/validator");
const { EVENT_TYPES } = require("../events/event.types");
const { selectRelevantTools, extractPreviousTools, mergePlannerSchemas } = require("./tool.selector");
const {
  matchIntentToSkill,
  plan,
  coerceForbiddenToolsToSkill,
} = require("./intent.skill.match");
const { modelManager } = require("../llm/modelManager");

/**
 * Pesan yang membutuhkan planner LLM (tool/skill multi-langkah), bukan short-circuit chat/skill.
 */
function needsStructuredPlannerMessage(message) {
  const m = String(message || "");
  return /audit|map|analy|gap|openclaw|architecture|arsitektur/i.test(m);
}

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

    // Intent: chat vs skill — tanpa observasi, jangan paksa semua input ke skill
    if (canShortCircuitIntent && this.skillRegistry && !needsStructuredPlannerMessage(message)) {
      const intent = plan(message);
      if (intent.type === "chat") {
        const chatFn = this.llmProvider && typeof this.llmProvider.chat === "function"
          ? this.llmProvider.chat.bind(this.llmProvider)
          : null;
        const reply = chatFn
          ? await chatFn(intent.message || message)
          : String(intent.message || message || "");
        const normalizedPlan = normalizePlannerDecision({
          action: "respond",
          response: reply,
          summary: "Percakapan (bukan perintah skill)",
        });
        normalizedPlan.intentType = "chat";
        // eslint-disable-next-line no-console
        console.log("PLANNER RESULT:", normalizedPlan);
        this.logger.info("Planner decision (chat intent)", {
          decision: normalizedPlan.plannerDecision,
          intentType: "chat",
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
              source: "intent-chat",
              intentType: "chat",
            },
          });
        }
        return normalizedPlan;
      }

      const intentSkill = matchIntentToSkill(message, this.skillRegistry);
      if (intentSkill) {
        const normalizedPlan = normalizePlannerDecision(intentSkill);
        normalizedPlan.intentType = "skill";
        // eslint-disable-next-line no-console
        console.log("PLANNER RESULT:", normalizedPlan);
        this.logger.info("Planner decision (skill intent deterministik)", {
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
              intentType: "skill",
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
