"use strict";

const { normalizeToolResult } = require("../ai-agent-platform/core/llm/modelRouter");

module.exports = {
  name: "search-web-info",
  description: "Mencari informasi web: pencarian cepat lalu opsional browser (web-search-tool + browser-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input = {} }) {
    const searchOut = normalizeToolResult(await tools["web-search-tool"].run(input));
    let browserOut = null;
    const wantBrowser =
      input && (input.useBrowser === true || input.openInBrowser === true || input.followUp === "browser");
    if (wantBrowser && input.url) {
      browserOut = normalizeToolResult(
        await tools["browser-tool"].run({ action: "goto", url: input.url })
      );
    }
    const combined = {
      success: searchOut.success !== false && (!browserOut || browserOut.success !== false),
      data: { webSearch: searchOut, browser: browserOut },
      message: "search-web-info",
    };
    return {
      success: combined.success,
      data: combined,
    };
  },
};
