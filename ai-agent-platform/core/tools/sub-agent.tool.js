"use strict";

/**
 * Sub-Agent Tool — LLM-facing tool untuk spawn & manage child agents.
 *
 * @param {object} subAgentManager - Instance dari createSubAgentManager()
 */
function createSubAgentTool(subAgentManager) {
  return {
    name: "sub-agent-tool",
    description: "Spawn dan kelola sub-agent untuk mendelegasikan tugas. Setiap sub-agent adalah agent mandiri yang berjalan secara paralel.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'spawn' (buat sub-agent baru), 'status' (cek status), 'results' (ambil hasil), 'list' (daftar semua), 'terminate' (hentikan), 'cleanup' (bersihkan selesai)"
        },
        name: {
          type: "string",
          description: "(untuk 'spawn') Nama sub-agent, misal: 'web-researcher', 'code-auditor', 'security-checker'"
        },
        task: {
          type: "string",
          description: "(untuk 'spawn') Perintah tugas untuk sub-agent, misal: 'Cari informasi tentang X dan buat ringkasan'"
        },
        childId: {
          type: "string",
          description: "(untuk 'status', 'results', 'terminate') ID child agent yang dikembalikan saat spawn"
        }
      },
      required: ["action"]
    },

    async run(input) {
      switch (input.action) {
        case "spawn": {
          if (!input.name) return { error: "Parameter 'name' wajib untuk spawn" };
          if (!input.task) return { error: "Parameter 'task' wajib untuk spawn (berikan instruksi tugas)" };

          const result = await subAgentManager.spawn({
            name: input.name,
            task: input.task,
          });
          return result;
        }

        case "status": {
          if (!input.childId) return { error: "Parameter 'childId' wajib" };
          const status = subAgentManager.getStatus(input.childId);
          if (!status) return { error: `Sub-agent '${input.childId}' tidak ditemukan` };
          return { success: true, ...status };
        }

        case "results": {
          if (!input.childId) return { error: "Parameter 'childId' wajib" };
          const result = subAgentManager.getResult(input.childId);
          if (!result) return { error: `Sub-agent '${input.childId}' tidak ditemukan` };
          if (result.status === "running") {
            return { success: true, message: "Sub-agent masih berjalan. Cek lagi nanti.", status: "running" };
          }
          return { success: true, ...result };
        }

        case "list": {
          const children = subAgentManager.listActive();
          return {
            success: true,
            children,
            total: children.length,
            active: subAgentManager.activeCount,
            message: children.length === 0 ? "Tidak ada sub-agent aktif" : `${children.length} sub-agent terdaftar`,
          };
        }

        case "terminate": {
          if (!input.childId) return { error: "Parameter 'childId' wajib" };
          return subAgentManager.terminate(input.childId);
        }

        case "cleanup": {
          const result = subAgentManager.cleanup();
          return { success: true, ...result, message: `${result.removed.length} child dibersihkan, ${result.remaining} masih aktif` };
        }

        default:
          return { error: `Action '${input.action}' tidak dikenal. Pilih: spawn, status, results, list, terminate, cleanup` };
      }
    },
  };
}

module.exports = { createSubAgentTool };
