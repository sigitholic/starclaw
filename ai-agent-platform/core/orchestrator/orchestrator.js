"use strict";

const { createTaskRouter } = require("./task.router");
const { createWorkflowEngine } = require("./workflow.engine");
const { createEventBus } = require("../events/event.bus");
const { createEventStore } = require("../events/event.store");
const { EVENT_TYPES } = require("../events/event.types");
const { createLogger } = require("../utils/logger");
const { runNocMultiAgentWorkflow } = require("../../modules/noc/workflows/noc.multi-agent.workflow");

function buildDefaultOrchestrator(customRoutes = {}) {
  const logger = createLogger("core/orchestrator");
  const eventBus = createEventBus();
  const eventStore = createEventStore();
  const taskRouter = createTaskRouter(customRoutes);
  const workflowEngine = createWorkflowEngine();

  eventBus.on(EVENT_TYPES.TASK_RECEIVED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_RECEIVED, payload }));
  eventBus.on(EVENT_TYPES.TASK_COMPLETED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_COMPLETED, payload }));
  eventBus.on(EVENT_TYPES.TASK_FAILED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_FAILED, payload }));
  eventBus.on(EVENT_TYPES.TASK_CREATED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_CREATED, payload }));
  eventBus.on(EVENT_TYPES.TASK_ANALYZED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_ANALYZED, payload }));
  eventBus.on(EVENT_TYPES.ACTION_EXECUTED, (payload) => eventStore.add({ type: EVENT_TYPES.ACTION_EXECUTED, payload }));
  eventBus.on(EVENT_TYPES.AGENT_STARTED, (payload) => eventStore.add({ type: EVENT_TYPES.AGENT_STARTED, payload }));
  eventBus.on(EVENT_TYPES.PLANNER_DECISION, (payload) =>
    eventStore.add({ type: EVENT_TYPES.PLANNER_DECISION, payload }),
  );
  eventBus.on(EVENT_TYPES.TOOL_CALLED, (payload) => eventStore.add({ type: EVENT_TYPES.TOOL_CALLED, payload }));
  eventBus.on(EVENT_TYPES.TOOL_RESULT, (payload) => eventStore.add({ type: EVENT_TYPES.TOOL_RESULT, payload }));
  eventBus.on(EVENT_TYPES.AGENT_FINISHED, (payload) => eventStore.add({ type: EVENT_TYPES.AGENT_FINISHED, payload }));

  return {
    async run(taskName, payload) {
      await eventBus.emit(EVENT_TYPES.TASK_RECEIVED, { taskName, payload });

      try {
        let result;
        if (taskName === "noc-incident-workflow") {
          result = await runNocMultiAgentWorkflow({ payload: payload || {}, eventBus });
        } else {
          const agent = taskRouter.resolve(taskName);
          result = await workflowEngine.run(agent, {
            ...(payload || {}),
            __eventBus: eventBus,
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
