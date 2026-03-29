"use strict";

/**
 * Sample Plugin: Hello World
 *
 * Contoh plugin minimal untuk platform Starclaw AI Agent.
 * Plugin ini menambahkan tool "hello-plugin" yang bisa menyapa user.
 *
 * Cara install:
 *   1. Taruh folder ini di plugins/hello-world/
 *   2. Di agent, gunakan tool plugin-tool action='load' pluginName='hello-world'
 *   3. Atau gunakan plugin-tool action='load-all' untuk load semua plugin
 */
module.exports = {
  name: "hello-world",
  version: "1.0.0",
  description: "Plugin contoh minimal — menambahkan tool 'hello-plugin' untuk menyapa user.",

  tools: [
    {
      name: "hello-plugin",
      description: "Tool dari plugin hello-world. Menyapa user dengan nama.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama orang yang ingin disapa" },
        },
        required: ["name"],
      },
      async run(input) {
        return {
          success: true,
          message: `Halo ${input.name}! 👋 Salam dari plugin hello-world di platform Starclaw AI Agent.`,
        };
      },
    },
  ],

  workflows: [],

  activate(context) {
    console.log("[Plugin:hello-world] Plugin diaktifkan!");
  },

  deactivate() {
    console.log("[Plugin:hello-world] Plugin dinonaktifkan.");
  },
};
