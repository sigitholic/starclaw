"use strict";

const EVENT_TYPES = {
  TASK_RECEIVED: "task.received",
  TASK_COMPLETED: "task.completed",
  TASK_FAILED: "task.failed",
  TASK_CREATED: "task_created",
  TASK_ANALYZED: "task_analyzed",
  ACTION_EXECUTED: "action_executed",
  AGENT_STARTED: "agent_started",
  PLANNER_DECISION: "planner_decision",
  TOOL_CALLED: "tool_called",
  TOOL_RESULT: "tool_result",
  AGENT_FINISHED: "agent_finished",
};

module.exports = { EVENT_TYPES };
