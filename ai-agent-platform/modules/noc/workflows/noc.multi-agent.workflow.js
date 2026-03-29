"use strict";

const { EVENT_TYPES } = require("../../../core/events/event.types");
const { createMonitorAgent } = require("../agents/monitor.agent");
const { createAnalyzerAgent } = require("../agents/analyzer.agent");
const { createExecutorAgent } = require("../agents/executor.agent");

async function runNocMultiAgentWorkflow({ payload = {}, eventBus }) {
  const monitorAgent = createMonitorAgent();
  const analyzerAgent = createAnalyzerAgent();
  const executorAgent = createExecutorAgent();

  const taskId = payload.taskId || `noc-${Date.now()}`;
  const monitorInput = {
    taskId,
    signal: payload.signal || "incident-detected",
    message: payload.message || "monitor incoming task",
    __eventBus: eventBus,
  };

  const monitorResult = await monitorAgent.run(monitorInput);
  await eventBus.emit(EVENT_TYPES.TASK_CREATED, {
    taskId,
    from: "monitor",
    data: monitorResult.finalResponse || monitorResult.summary,
  });

  const analyzerInput = {
    taskId,
    severity: payload.severity || "medium",
    diagnosis: payload.diagnosis || "network-latency-anomaly",
    message: "analyze monitor findings",
    previous: monitorResult.finalResponse,
    __eventBus: eventBus,
  };
  const analyzerResult = await analyzerAgent.run(analyzerInput);
  await eventBus.emit(EVENT_TYPES.TASK_ANALYZED, {
    taskId,
    from: "analyzer",
    data: analyzerResult.finalResponse || analyzerResult.summary,
  });

  const executorInput = {
    taskId,
    action: payload.action || "restart-service",
    result: payload.result || "action-queued",
    message: "execute remediation action",
    previous: analyzerResult.finalResponse,
    __eventBus: eventBus,
  };
  const executorResult = await executorAgent.run(executorInput);
  await eventBus.emit(EVENT_TYPES.ACTION_EXECUTED, {
    taskId,
    from: "executor",
    data: executorResult.finalResponse || executorResult.summary,
  });

  return {
    workflow: "monitor-analyzer-executor",
    taskId,
    monitor: monitorResult,
    analyzer: analyzerResult,
    executor: executorResult,
  };
}

module.exports = { runNocMultiAgentWorkflow };
