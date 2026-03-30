"use strict";

const { normalizeToolResult, mergeToolLines } = require("./skill-result.helper");

module.exports = {
  name: "search-web-info",
  description: "Mencari informasi web: pencarian cepat lalu opsional browser (web-search-tool + browser-tool).",
  parameters: { type: "object", properties: {} },
  async run({ tools, input }) {
    const o = input && typeof input === "object" ? input : {};
    const searchInput = {
      query: o.query || "Starclaw AI agent",
    };
    const searchOut = normalizeToolResult(await tools["web-search-tool"].run(searchInput));
    let browserOut = null;
    const wantBrowser =
      o.useBrowser === true || o.openInBrowser === true || o.followUp === "browser";
    const url = o.url || (Array.isArray(searchOut.results) && searchOut.results.length ? "https://duckduckgo.com" : null);
    if (wantBrowser && url) {
      browserOut = normalizeToolResult(
        await tools["browser-tool"].run({ action: "goto", url })
      );
    }
    const pairs = [{ key: "Pencarian web", normalized: searchOut }];
    if (browserOut) {
      pairs.push({ key: "Browser", normalized: browserOut });
    }
    return mergeToolLines(pairs);
  },
};
