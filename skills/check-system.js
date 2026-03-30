"use strict";

/**
 * Skill layer — contoh: diagnosis sistem via doctor-tool (multi-step logic di atas tool).
 */
module.exports = {
  name: "check-system",
  description: "Memeriksa kesehatan sistem (doctor-tool diagnose).",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", description: "Area diagnosis: all, core, tools (opsional)" },
    },
  },
  async run({ tools }) {
    const result = await tools["doctor-tool"].run({
      action: "diagnose",
    });

    return {
      success: true,
      summary: result.verdict,
      data: result,
    };
  },
};
