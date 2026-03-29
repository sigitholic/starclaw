"use strict";
const { exec } = require("child_process");

function createShellTool() {
  return {
    name: "shell-tool",
    description: "Menjalankan bash/shell command di environment sistem operasi lokal.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Perintah bash yang ingin dijalankan (contoh: ls -la, mkdir folder)." }
      },
      required: ["command"]
    },
    async run(input) {
      const command = input.command || input.cmd;
      if (!command) return { error: "No command provided. Use 'command' field." };
      
      return new Promise((resolve) => {
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
          resolve({
            stdout: stdout ? stdout.trim() : "",
            stderr: stderr ? stderr.trim() : "",
            error: error ? error.message : null
          });
        });
      });
    },
  };
}

module.exports = { createShellTool };
