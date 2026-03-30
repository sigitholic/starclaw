"use strict";

const { normalizePlannerDecision } = require("../utils/validator");
const { EVENT_TYPES } = require("../events/event.types");
const { selectRelevantTools, extractPreviousTools, mergePlannerSchemas } = require("./tool.selector");
const {
  matchIntentToSkill,
  plan,
  coerceForbiddenToolsToSkill,
  extractIP,
  isFollowUpIntent,
} = require("./intent.skill.match");
const { modelManager } = require("../llm/modelManager");
const { detectIntentLLM } = require("../llm/intentEngine");

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

  /**
   * Gabungkan input skill (mis. target ping) dengan memori sesi lastPingTarget.
   */
  _mergeSkillInputFromMemory(skillName, skillInput, shortMemory, userMessage) {
    const mem = shortMemory && typeof shortMemory === "object" ? shortMemory : {};
    const lastPing =
      typeof mem.lastPingTarget === "string" && mem.lastPingTarget.trim()
        ? mem.lastPingTarget.trim()
        : null;
    const base = skillInput && typeof skillInput === "object" ? { ...skillInput } : {};
    const msg = typeof userMessage === "string" ? userMessage : "";
    if (skillName !== "run-system-command" || !lastPing) {
      return base;
    }
    const ipFromMsg = extractIP(msg);
    if (ipFromMsg) {
      base.target = ipFromMsg;
      return base;
    }
    const hasTarget = base.target != null && String(base.target).trim() !== "";
    if (isFollowUpIntent(msg) && !hasTarget) {
      base.target = lastPing;
    }
    return base;
  }

  /** @param {object} input */
  async _ruleBasedPlanner(input) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";

    const allToolSchemas = this.toolsRegistry ? this.toolsRegistry.getToolSchemas() : [];
    const skillSchemas =
      this.skillRegistry && typeof this.skillRegistry.getSkillSchemas === "function"
        ? this.skillRegistry.getSkillSchemas()
        : [];
    const mergedSchemas = mergePlannerSchemas(allToolSchemas, skillSchemas).filter(
      s => s && s.name !== "shell-tool",
    );

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

    const shortMemory =
      input && input.__shortMemory && typeof input.__shortMemory === "object" ? input.__shortMemory : null;

    if (canShortCircuitIntent && this.skillRegistry && !needsStructuredPlannerMessage(message)) {
      const intent = plan(message, shortMemory);
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

      const intentSkill = matchIntentToSkill(message, this.skillRegistry, shortMemory);
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
      input.__shortMemory,
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

  async createPlan(input) {
    const eventBus = input && input.__eventBus ? input.__eventBus : null;
    const agentName = input && input.__agentName ? input.__agentName : "unknown-agent";

    const allToolSchemas = this.toolsRegistry ? this.toolsRegistry.getToolSchemas() : [];
    const skillSchemas =
      this.skillRegistry && typeof this.skillRegistry.getSkillSchemas === "function"
        ? this.skillRegistry.getSkillSchemas()
        : [];
    const mergedSchemas = mergePlannerSchemas(allToolSchemas, skillSchemas).filter(
      s => s && s.name !== "shell-tool",
    );

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

    this.logger.debug("Planner model", { model: modelManager.getModel() });

    const canShortCircuitIntent =
      !input.__isRegenerate && (!input.observations || input.observations.length === 0);

    const shortMemory =
      input && input.__shortMemory && typeof input.__shortMemory === "object" ? input.__shortMemory : null;

    if (canShortCircuitIntent && this.skillRegistry && !needsStructuredPlannerMessage(message)) {
      let llmIntent = null;
      try {
        llmIntent = await detectIntentLLM(message, {
          lastPingTarget: shortMemory && shortMemory.lastPingTarget,
        });
      } catch (_e) {
        llmIntent = null;
      }

      // eslint-disable-next-line no-console
      console.log("LLM INTENT:", llmIntent);

      if (llmIntent && llmIntent.type === "skill" && llmIntent.skill) {
        if (this.skillRegistry.has(llmIntent.skill)) {
          const mergedInput = this._mergeSkillInputFromMemory(
            llmIntent.skill,
            llmIntent.input,
            shortMemory,
            message,
          );
          const raw = {
            action: "skill",
            skill_name: llmIntent.skill,
            input: mergedInput,
            summary: `Intent LLM → skill ${llmIntent.skill}`,
          };
          const normalizedPlan = normalizePlannerDecision(raw);
          normalizedPlan.intentType = "llm-intent-skill";
          // eslint-disable-next-line no-console
          console.log("PLANNER RESULT:", normalizedPlan);
          this.logger.info("Planner decision (LLM intent → skill)", {
            decision: normalizedPlan.plannerDecision,
            skill: llmIntent.skill,
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
                source: "llm-intent-engine",
                intentType: "skill",
              },
            });
          }
          return normalizedPlan;
        }
      }

      if (llmIntent && llmIntent.type === "system") {
        if (llmIntent.skill === "list-plugins" && this.skillRegistry.has("manage-plugin")) {
          const raw = {
            action: "skill",
            skill_name: "manage-plugin",
            input: { mode: "plugin", action: "list" },
            summary: "Daftar plugin (intent system)",
          };
          const normalizedPlan = normalizePlannerDecision(raw);
          normalizedPlan.intentType = "llm-intent-system";
          // eslint-disable-next-line no-console
          console.log("PLANNER RESULT:", normalizedPlan);
          this.logger.info("Planner decision (LLM intent → system / plugins)", {
            decision: normalizedPlan.plannerDecision,
            skill: "manage-plugin",
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
                source: "llm-intent-engine-system",
                intentType: "system",
              },
            });
          }
          return normalizedPlan;
        }

        if (
          llmIntent.skill === "list-skills" ||
          llmIntent.skill === null ||
          llmIntent.skill === undefined
        ) {
          const items =
            typeof this.skillRegistry.getSkillList === "function"
              ? this.skillRegistry.getSkillList()
              : (this.skillRegistry.list() || []).map((name) => ({
                name,
                description: "",
              }));
          const body = items.length
            ? items
              .map((i) => `• ${i.name}${i.description ? `: ${i.description}` : ""}`)
              .join("\n")
            : "(Belum ada skill terdaftar.)";
          const responseText = `Skill yang tersedia:\n${body}`;
          const normalizedPlan = normalizePlannerDecision({
            action: "respond",
            response: responseText,
            summary: "Daftar skill (intent system)",
          });
          normalizedPlan.intentType = "llm-intent-system";
          // eslint-disable-next-line no-console
          console.log("PLANNER RESULT:", normalizedPlan);
          this.logger.info("Planner decision (LLM intent → system / list skills)", {
            decision: normalizedPlan.plannerDecision,
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
                source: "llm-intent-engine-system",
                intentType: "system",
              },
            });
          }
          return normalizedPlan;
        }
      }

      if (llmIntent && llmIntent.type === "chat") {
        const chatFn = this.llmProvider && typeof this.llmProvider.chat === "function"
          ? this.llmProvider.chat.bind(this.llmProvider)
          : null;
        const reply = chatFn ? await chatFn(message) : String(message || "");
        const normalizedPlan = normalizePlannerDecision({
          action: "respond",
          response: reply,
          summary: "Percakapan (intent LLM: chat)",
        });
        normalizedPlan.intentType = "llm-intent-chat";
        // eslint-disable-next-line no-console
        console.log("PLANNER RESULT:", normalizedPlan);
        this.logger.info("Planner decision (LLM intent → chat)", {
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
              source: "llm-intent-engine-chat",
              intentType: "chat",
            },
          });
        }
        return normalizedPlan;
      }
    }

    return this._ruleBasedPlanner(input);
  }
}

module.exports = { Planner };
