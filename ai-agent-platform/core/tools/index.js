"use strict";

const { createHttpTool } = require("./http.tool");
const { createTimeTool } = require("./time.tool");
const { createShellTool } = require("./shell.tool");
const { createFsTool } = require("./fs.tool");
const { createWebSearchTool } = require("./web-search.tool");
const { createCodebaseSearchTool } = require("./codebase-search.tool");
const { createBrowserTool } = require("./browser.tool");
const { createDockerTool } = require("./docker.tool");
const { createDoctorTool } = require("./doctor.tool");
const { createPluginTool } = require("./plugin.tool");
const { createSubAgentTool } = require("./sub-agent.tool");
const { createCronTool } = require("./cron.tool");
const { createGenieAcsTool } = require("./genieacs.tool");
const { createSocialMediaTool } = require("./social-media.tool");
const { createNotificationTool } = require("./notification.tool");
const { createDatabaseTool } = require("./database.tool");
const { validateToolContract } = require("../utils/validator");
const { createPluginManager } = require("../plugins/plugin.manager");
const { createSubAgentManager } = require("../agent/sub-agent.manager");
const { createCronManager } = require("../scheduler/cron.manager");

function createToolRegistry(customTools = []) {
  const tools = new Map();

  // Build registry object DULU sebelum dipakai oleh managers
  const registryObj = {
    get(name) { return tools.get(name); },
    list() { return Array.from(tools.keys()); },
    getToolSchemas() {
      return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: t.description || "Tak ada deskripsi",
        parameters: t.parameters || {}
      }));
    },
    register(tool) {
      validateToolContract(tool);
      tools.set(tool.name, tool);
      console.log(`[ToolRegistry] Tool '${tool.name}' didaftarkan secara dinamis`);
    },
    unregister(name) {
      if (tools.has(name)) {
        tools.delete(name);
        console.log(`[ToolRegistry] Tool '${name}' dihapus dari registry`);
      }
    },
    get size() { return tools.size; },
  };

  // Inisialisasi managers SETELAH registry object dibuat
  const pluginManager = createPluginManager({ toolsRegistry: registryObj });
  const subAgentManager = createSubAgentManager();
  const cronManager = createCronManager();

  const builtins = [
    createHttpTool(),
    createTimeTool(),
    createShellTool(),
    createFsTool(),
    createWebSearchTool(),
    createCodebaseSearchTool(),
    createBrowserTool(),
    createDockerTool(),
    createDoctorTool(),
    createPluginTool(pluginManager),
    createSubAgentTool(subAgentManager),
    createCronTool(cronManager),
    // Tools baru
    createGenieAcsTool(),
    createSocialMediaTool(),
    createNotificationTool(),
    createDatabaseTool(),
    ...customTools,
  ];

  builtins.forEach((tool) => {
    validateToolContract(tool);
    tools.set(tool.name, tool);
  });

  return registryObj;
}

module.exports = { createToolRegistry };
