"use strict";

// LAZY REQUIRE: agent.factory di-load saat spawn() dipanggil, bukan saat module init.
// Ini mencegah circular dependency: tools/index → sub-agent.manager → agent.factory → tools/index

/**
 * Sub-Agent Manager — spawning & lifecycle control untuk child agents.
 *
 * Parent agent bisa:
 *   - Spawn child agent dengan tools & tugas spesifik
 *   - Monitor status child agent
 *   - Ambil hasil dari child agent
 *   - Terminate child agent
 *
 * Use case:
 *   - Delegasi pencarian web ke child sementara parent processing data
 *   - Spawn specialist agent untuk audit keamanan
 *   - Chain of agents: agent A → spawn agent B → spawn agent C
 */
function createSubAgentManager() {
  const children = new Map();  // id → { agent, status, result, createdAt }
  let nextId = 1;

  return {
    /**
     * Spawn child agent baru.
     * @param {object} config
     * @param {string} config.name - Nama child agent
     * @param {string} config.task - Tugas/pesan yang diberikan ke child
     * @param {Array} config.customTools - Tools khusus untuk child (opsional)
     * @param {object} config.eventBus - Event bus parent (opsional)
     */
    async spawn({ name, task, customTools = [], eventBus = null }) {
      const id = `child-${nextId++}-${name}`;

      // Lazy require untuk menghindari circular dependency
      const { createBaseAgent } = require("./agent.factory");

      const childAgent = createBaseAgent({
        name: `sub:${name}`,
        customTools,
      });

      const childEntry = {
        id,
        name,
        agent: childAgent,
        task,
        status: "running",
        result: null,
        error: null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
      };

      children.set(id, childEntry);
      console.log(`[SubAgentManager] Child '${id}' dibuat untuk tugas: "${task.slice(0, 80)}..."`);

      // Jalankan child secara async (non-blocking)
      const runPromise = childAgent.run({
        message: task,
        __agentName: `sub:${name}`,
        __eventBus: eventBus,
      });

      runPromise
        .then((result) => {
          childEntry.status = "completed";
          childEntry.result = {
            summary: result.summary || "",
            finalResponse: result.finalResponse || "",
            score: result.score,
            outputs: (result.outputs || []).slice(0, 5), // Batasi 5 outputs
          };
          childEntry.finishedAt = new Date().toISOString();
          console.log(`[SubAgentManager] Child '${id}' selesai`);
        })
        .catch((err) => {
          childEntry.status = "failed";
          childEntry.error = err.message;
          childEntry.finishedAt = new Date().toISOString();
          console.error(`[SubAgentManager] Child '${id}' gagal: ${err.message}`);
        });

      return {
        success: true,
        id,
        name,
        message: `Sub-agent '${name}' berhasil di-spawn (ID: ${id}). Gunakan action 'status' untuk cek progress.`,
      };
    },

    /**
     * Cek status child agent.
     */
    getStatus(id) {
      const child = children.get(id);
      if (!child) return null;
      return {
        id: child.id,
        name: child.name,
        status: child.status,
        task: child.task.slice(0, 100),
        createdAt: child.createdAt,
        finishedAt: child.finishedAt,
      };
    },

    /**
     * Ambil hasil child agent (hanya jika completed).
     */
    getResult(id) {
      const child = children.get(id);
      if (!child) return null;
      return {
        id: child.id,
        status: child.status,
        result: child.result,
        error: child.error,
      };
    },

    /**
     * Daftar semua child agents.
     */
    listActive() {
      return Array.from(children.values()).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        task: c.task.slice(0, 80),
        createdAt: c.createdAt,
      }));
    },

    /**
     * Terminate child agent (set status cancelled).
     */
    terminate(id) {
      const child = children.get(id);
      if (!child) return { success: false, error: `Child '${id}' tidak ditemukan` };
      if (child.status === "completed" || child.status === "failed") {
        return { success: false, error: `Child '${id}' sudah selesai (status: ${child.status})` };
      }
      child.status = "cancelled";
      child.finishedAt = new Date().toISOString();
      return { success: true, message: `Child '${id}' dibatalkan` };
    },

    /**
     * Bersihkan entries child yang sudah selesai (free memory).
     */
    cleanup() {
      const removed = [];
      for (const [id, child] of children) {
        if (child.status === "completed" || child.status === "failed" || child.status === "cancelled") {
          children.delete(id);
          removed.push(id);
        }
      }
      return { removed, remaining: children.size };
    },

    get totalSpawned() { return nextId - 1; },
    get activeCount() {
      return Array.from(children.values()).filter(c => c.status === "running").length;
    },
  };
}

module.exports = { createSubAgentManager };
