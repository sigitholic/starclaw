"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "query-database",
  description: "Query atau operasi database (database-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const action = o.action || "tables";
    const toolInput = {
      action,
      ...(o.sql != null ? { sql: o.sql } : {}),
      ...(o.table != null ? { table: o.table } : {}),
      ...(o.data != null ? { data: o.data } : {}),
      ...(o.where != null ? { where: o.where } : {}),
      ...(o.limit != null ? { limit: o.limit } : {}),
      ...(o.params != null ? { params: o.params } : {}),
    };
    const raw = await tools["database-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
