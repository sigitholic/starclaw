"use strict";

const EVENT_TYPES = {
  TASK_RECEIVED: "task.received",
  TASK_COMPLETED: "task.completed",
  TASK_FAILED: "task.failed",
  TASK_CREATED: "task_created",
  TASK_ANALYZED: "task_analyzed",
  ACTION_EXECUTED: "action_executed",
};

module.exports = { EVENT_TYPES };
