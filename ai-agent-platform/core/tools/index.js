"use strict";

const { createHttpTool } = require("./http.tool");
const { createTimeTool } = require("./time.tool");

function createToolRegistry(customTools = []) {
  const tools = new Map();

  const builtins = [createHttpTool(), createTimeTool(), ...customTools];
  builtins.forEach((tool) => tools.set(tool.name, tool));

  return {
    get(name) {
      return tools.get(name);
    },
    list() {
      return Array.from(tools.keys());
    },
  };
}

module.exports = { createToolRegistry };
