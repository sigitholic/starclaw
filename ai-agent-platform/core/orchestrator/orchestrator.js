"use strict";

const { createTaskRouter } = require("./task.router");
const { createWorkflowEngine } = require("./workflow.engine");
const { createEventBus } = require("../events/event.bus");
const { createEventStore } = require("../events/event.store");
const { EVENT_TYPES } = require("../events/event.types");
const { createLogger } = require("../utils/logger");

function buildDefaultOrchestrator(customRoutes = {}) {
  const logger = createLogger("core/orchestrator");
  const eventBus = createEventBus();
  const eventStore = createEventStore();
  const taskRouter = createTaskRouter(customRoutes);
  const workflowEngine = createWorkflowEngine();

  eventBus.on(EVENT_TYPES.TASK_RECEIVED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_RECEIVED, payload }));
  eventBus.on(EVENT_TYPES.TASK_COMPLETED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_COMPLETED, payload }));
  eventBus.on(EVENT_TYPES.TASK_FAILED, (payload) => eventStore.add({ type: EVENT_TYPES.TASK_FAILED, payload }));

  return {
    async run(taskName, payload) {
      await eventBus.emit(EVENT_TYPES.TASK_RECEIVED, { taskName, payload });

      try {
        const agent = taskRouter.resolve(taskName);
        const result = await workflowEngine.run(agent, payload);
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
  };
}

module.exports = { buildDefaultOrchestrator };
