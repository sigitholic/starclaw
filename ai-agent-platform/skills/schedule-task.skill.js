"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "schedule-task",
  description: "Menjadwalkan tugas atau pengingat (cron-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const action = o.action || "list";
    const toolInput = {
      action,
      ...(o.name != null ? { name: o.name } : {}),
      ...(o.task != null ? { task: o.task } : {}),
      ...(o.interval != null ? { interval: o.interval } : {}),
      ...(o.datetime != null ? { datetime: o.datetime } : {}),
      ...(o.jobId != null ? { jobId: o.jobId } : {}),
      ...(o.__chatId != null ? { __chatId: o.__chatId } : {}),
    };
    const raw = await tools["cron-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
