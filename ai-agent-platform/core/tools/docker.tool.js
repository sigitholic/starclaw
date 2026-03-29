"use strict";

const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

function createDockerTool() {
  return {
    name: "docker-tool",
    description: "Alat Sandbox Ekstrim. Menjalankan skrip (Node/Python/Bash) di dalam Docker Container terisolasi. Gunakan ini jika mengevaluasi kode yang tidak terpercaya / beresiko merusak OS Host.",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", description: "'node', 'python', atau 'bash'" },
        code: { type: "string", description: "Source code murni atau command bash yang ingin dieksekusi secara virtual." }
      },
      required: ["language", "code"]
    },
    async run(input) {
      if (!input.language || !input.code) return { error: "language dan code wajib disertakan." };

      let image = "";
      let cmd = "";

      // Escape single quotes (pengamanan bash command injection)
      const safeCode = input.code.replace(/'/g, "'\\''");

      switch (input.language.toLowerCase()) {
        case "node":
        case "javascript":
        case "js":
          image = "node:18-alpine";
          cmd = `docker run --network none --rm ${image} node -e '${safeCode}'`;
          break;
        case "python":
        case "py":
          image = "python:3.9-alpine";
          cmd = `docker run --network none --rm ${image} python -c '${safeCode}'`;
          break;
        case "bash":
        case "shell":
        case "sh":
          image = "alpine:latest";
          cmd = `docker run --network none --rm ${image} sh -c '${safeCode}'`;
          break;
        default:
          return { error: `Bahasa pemrograman '${input.language}' belum divalidasi oleh sandbox Docker.` };
      }

      try {
        // Eksekusi kode dengan timeout 15 detik untuk mencegah infinite loops di dalam container
        const { stdout, stderr } = await execPromise(cmd, { timeout: 15000 });
        return { 
          success: true, 
          stdout: stdout.trim(), 
          stderr: stderr.trim() 
        };
      } catch (err) {
        // Penangkapan error jika docker tidak aktif atau script error sintaksis
        if (err.message.includes("docker: command not found") || err.message.includes("is not recognized")) {
          return { success: false, error: "Docker Engine tidak aktif atau belum terinstall di komputer Host! Tool ini butuh layanan Docker Desktop." };
        }
        return { success: false, error: "Eksekusi Container gagal/Timeout: " + err.message };
      }
    }
  };
}

module.exports = { createDockerTool };
