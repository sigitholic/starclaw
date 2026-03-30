"use strict";

const { createTaskRouter } = require("./task.router");
const { createWorkflowEngine } = require("./workflow.engine");
const { createEventBus } = require("../events/event.bus");
const { createEventStore } = require("../events/event.store");
const { EVENT_TYPES } = require("../events/event.types");
const { createLogger } = require("../utils/logger");
const { runNocMultiAgentWorkflow } = require("../../modules/noc/workflows/noc.multi-agent.workflow");
const { createStructuredWorkflow } = require("./structured.workflow");
const { createDefaultLlmProvider } = require("../llm/llm.provider");
const { createToolRegistry } = require("../tools");

/**
 * Fix BUG-09: Workflow Registry yang dinamis.
 * Workflow NOC tidak lagi hardcoded di dalam run().
 * Tambahkan workflow baru via: orchestrator.registerWorkflow("nama", handlerFn)
 * tanpa harus memodifikasi file ini.
 */
function buildDefaultOrchestrator(customRoutes = {}) {
  const logger = createLogger("core/orchestrator");
  const eventBus = createEventBus();
  const eventStore = createEventStore();
  const taskRouter = createTaskRouter(customRoutes);
  const workflowEngine = createWorkflowEngine();

  // Structured Workflow — mode deterministik untuk instruksi kompleks
  const sharedToolsRegistry = createToolRegistry();
  const structuredWorkflow = createStructuredWorkflow({
    toolsRegistry: sharedToolsRegistry,
    llmProvider: createDefaultLlmProvider(),
  });

  // Registry untuk custom workflow handlers (non-agent workflows)
  const workflowRegistry = new Map();

  // Daftarkan workflow NOC secara dinamis — tidak hardcoded lagi di run()
  workflowRegistry.set("noc-incident-workflow", async ({ payload, eventBus: bus }) =>
    runNocMultiAgentWorkflow({ payload: payload || {}, eventBus: bus })
  );

  // Daftarkan Structured Workflow untuk instruksi kompleks deterministik
  // Trigger via task name "structured" atau ketika payload.__structured=true
  workflowRegistry.set("structured", async ({ payload }) => {
    const command = payload.message || payload.command || "";
    return structuredWorkflow.run(command, {
      eventBus,
      onStepStart: (i, step, state) => {
        logger.info(`Structured step ${i + 1}/${state.totalSteps}: ${step.task}`);
      },
      onStepComplete: (i, step, result, validation) => {
        logger.info(`Structured step ${i + 1} selesai`, { valid: validation.valid, tool: step.tool });
      },
    });
  });

  // Helper: persist event ke store
  const persistEvent = (type) => (payload) => eventStore.add({ type, payload });

  eventBus.on(EVENT_TYPES.TASK_RECEIVED, persistEvent(EVENT_TYPES.TASK_RECEIVED));
  eventBus.on(EVENT_TYPES.TASK_COMPLETED, persistEvent(EVENT_TYPES.TASK_COMPLETED));
  eventBus.on(EVENT_TYPES.TASK_FAILED, persistEvent(EVENT_TYPES.TASK_FAILED));
  eventBus.on(EVENT_TYPES.TASK_CREATED, persistEvent(EVENT_TYPES.TASK_CREATED));
  eventBus.on(EVENT_TYPES.TASK_ANALYZED, persistEvent(EVENT_TYPES.TASK_ANALYZED));
  eventBus.on(EVENT_TYPES.ACTION_EXECUTED, persistEvent(EVENT_TYPES.ACTION_EXECUTED));
  eventBus.on(EVENT_TYPES.AGENT_STARTED, persistEvent(EVENT_TYPES.AGENT_STARTED));
  eventBus.on(EVENT_TYPES.PLANNER_DECISION, persistEvent(EVENT_TYPES.PLANNER_DECISION));
  eventBus.on(EVENT_TYPES.TOOL_CALLED, persistEvent(EVENT_TYPES.TOOL_CALLED));
  eventBus.on(EVENT_TYPES.TOOL_RESULT, persistEvent(EVENT_TYPES.TOOL_RESULT));
  eventBus.on(EVENT_TYPES.AGENT_FINISHED, persistEvent(EVENT_TYPES.AGENT_FINISHED));

  return {
    /**
     * Daftarkan workflow handler baru secara dinamis.
     * @param {string} name - Nama task/workflow
     * @param {Function} handler - async fn({ payload, eventBus }) => result
     */
    registerWorkflow(name, handler) {
      workflowRegistry.set(name, handler);
      logger.info("Workflow handler didaftarkan", { name });
    },

    async run(taskName, payload) {
      await eventBus.emit(EVENT_TYPES.TASK_RECEIVED, { taskName, payload });

      try {
        let result;
        const customWorkflowHandler = workflowRegistry.get(taskName);

        // Auto-route ke structured workflow jika diminta eksplisit
        const forceStructured = payload && payload.__structured === true;

        if (forceStructured) {
          result = await structuredWorkflow.run(
            payload.message || payload.command || taskName,
            { eventBus }
          );
        } else if (customWorkflowHandler) {
          result = await customWorkflowHandler({
            payload: payload || {},
            eventBus: (payload && payload.__eventBus) ? payload.__eventBus : eventBus,
          });
        } else {
          // Fallback: resolve agent dari task router dan jalankan via workflow engine
          const agent = taskRouter.resolve(taskName);
          result = await workflowEngine.run(agent, {
            ...(payload || {}),
            __eventBus: (payload && payload.__eventBus) ? payload.__eventBus : eventBus,
          });
        }

        await eventBus.emit(EVENT_TYPES.TASK_COMPLETED, { taskName, result });
        return result;
      } catch (error) {
        await eventBus.emit(EVENT_TYPES.TASK_FAILED, { taskName, message: error.message });
        logger.error("Task gagal", { taskName, message: error.message });
        throw error;
      }
    },

    getEvents() {
      return eventStore.list();
    },

    subscribe(eventType, handler) {
      eventBus.on(eventType, handler);
    },
  };
}

module.exports = { buildDefaultOrchestrator };
