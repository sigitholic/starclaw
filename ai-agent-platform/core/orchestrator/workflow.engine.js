"use strict";

/**
 * Workflow Engine dengan Re-Act Loop Sejati.
 *
 * Alur per-iterasi:
 *   1. Think: Planner LLM menerima task + observasi sebelumnya → hasilkan action
 *   2. Act:   Executor menjalankan tool yang dipilih Planner
 *   3. Observe: Hasil tool dikumpulkan ke observationBuffer
 *   4. Loop:  Buffer dikirim ke LLM sebagai konteks di iterasi berikutnya
 *
 * Ini menggantikan loop lama yang buta (tidak ada feedback tool ke LLM).
 */
function createWorkflowEngine() {
  return {
    async run(agent, payload, maxIterations = 10) {
      if (!agent || typeof agent.run !== "function") {
        throw new Error("Agent tidak valid untuk workflow engine");
      }

      let iteration = 0;
      let lastResult = null;
      let currentPayload = { ...payload };

      // Buffer observasi lintas-iterasi: dikumpulkan dan dikirim ke LLM setiap siklus
      const observationBuffer = [];

      while (iteration < maxIterations) {
        iteration++;

        // Inject semua observasi sebelumnya agar LLM "tahu" apa yang sudah terjadi
        if (observationBuffer.length > 0) {
          currentPayload.observations = observationBuffer.slice(); // snapshot immutable
        }

        // === THINK & ACT ===
        lastResult = await agent.run(currentPayload);

        // === OBSERVE ===
        // Kumpulkan hasil tool dari eksekusi ini ke buffer observasi
        if (lastResult && Array.isArray(lastResult.outputs) && lastResult.outputs.length > 0) {
          for (const out of lastResult.outputs) {
            observationBuffer.push({
              iteration,
              step: out.step,
              tool: out.tool || "unknown",
              status: out.status,
              // Batasi output ke 2000 karakter agar tidak overflow context LLM
              output: out.output
                ? JSON.stringify(out.output).slice(0, 2000)
                : out.reason || null,
            });
          }
        }

        // Jika plan LLM adalah merespon langsung (ngobrol) atau diveto, akhiri loop.
        if (!lastResult.plan || lastResult.plan.plannerDecision === "respond" || lastResult.success === false) {
          break;
        }

        // Exit condition: jika semua tool outputs di iterasi ini skipped/error,
        // berarti tidak ada progress → hentikan loop untuk mencegah infinite cycle
        const allOutputsFailed = Array.isArray(lastResult.outputs) &&
          lastResult.outputs.length > 0 &&
          lastResult.outputs.every(o => o.status === "skipped" || o.status === "error");
        if (allOutputsFailed) {
          break;
        }

        // Exit juga jika tidak ada outputs sama sekali (plan tidak menghasilkan steps)
        if (!lastResult.outputs || lastResult.outputs.length === 0) {
          break;
        }

        // Beri jeda kecil antar iterasi
        await new Promise(resolve => setTimeout(resolve, 500));

        // Tandai ini adalah iterasi lanjutan (bukan request baru)
        currentPayload.__isContinuation = true;
        currentPayload.__iterationCount = iteration;
      }

      return lastResult;
    },
  };
}

module.exports = { createWorkflowEngine };
