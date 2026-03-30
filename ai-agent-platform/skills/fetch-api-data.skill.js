"use strict";

const { normalizeToolResult, fromNormalizedTool } = require("./skill-result.helper");

module.exports = {
  name: "fetch-api-data",
  description: "Memanggil HTTP/API (http-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const toolInput = {
      method: o.method || "GET",
      url: o.url || "https://example.invalid",
    };
    const raw = await tools["http-tool"].run(toolInput);
    return fromNormalizedTool(normalizeToolResult(raw));
  },
};
