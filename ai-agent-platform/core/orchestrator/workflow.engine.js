"use strict";

const { agentConfig } = require("../../config/agent.config");

/**
 * Workflow Engine dengan Re-Act Loop + Sliding Window Observations.
 *
 * Perbaikan dari versi sebelumnya:
 *   1. Observation buffer dibatasi (sliding window) — cegah context explosion
 *   2. maxIterations dari config (tidak hardcode)
 *   3. iterationDelay dari config
 *   4. Token usage tracking per loop
 *   5. Exit lebih cepat jika tidak ada progress
 */
function createWorkflowEngine() {
  return {
    async run(agent, payload, maxIterationsOverride) {
      if (!agent || typeof agent.run !== "function") {
        throw new Error("Agent tidak valid untuk workflow engine");
      }

      const maxIterations = maxIterationsOverride || agentConfig.maxExecutionSteps || agentConfig.maxIterations || 5;
      const maxObservations = agentConfig.maxObservations || 6;
      const iterationDelay = agentConfig.iterationDelayMs || 300;

      let iteration = 0;
      let lastResult = null;
      let currentPayload = { ...payload };
      let executionTrace = Array.isArray(payload.__executionTrace) ? [...payload.__executionTrace] : [];
      let completedToolKeys = Array.isArray(payload.__completedToolKeys) ? [...payload.__completedToolKeys] : [];

      // Sliding window observation buffer — cegah context explosion di task panjang
      const observationBuffer = [];
      let totalTokensEstimated = 0;

      while (iteration < maxIterations) {
        iteration++;

        currentPayload.__stepCount = iteration;
        currentPayload.__executionTrace = executionTrace;
        currentPayload.__completedToolKeys = completedToolKeys;

        // Inject observasi sebagai sliding window (hanya N terakhir)
        if (observationBuffer.length > 0) {
          currentPayload.observations = observationBuffer.slice(-maxObservations);
        }

        // === THINK & ACT ===
        const startMs = Date.now();
        lastResult = await agent.run(currentPayload);
        const iterationMs = Date.now() - startMs;

        // Estimasi token yang dipakai di iterasi ini
        if (agentConfig.trackTokenUsage && lastResult && lastResult.tokenUsage) {
          totalTokensEstimated += lastResult.tokenUsage.used || 0;
        }

        // === OBSERVE ===
        if (lastResult && Array.isArray(lastResult.__executionTrace)) {
          executionTrace = lastResult.__executionTrace;
        }
        if (lastResult && Array.isArray(lastResult.__completedToolKeys)) {
          completedToolKeys = lastResult.__completedToolKeys;
        }

        if (lastResult && Array.isArray(lastResult.outputs) && lastResult.outputs.length > 0) {
          for (const out of lastResult.outputs) {
            // Batasi output per observation ke 1500 karakter (lebih hemat dari 2000)
            const outputStr = out.output
              ? JSON.stringify(out.output).slice(0, 1500)
              : out.reason || null;

            observationBuffer.push({
              iteration,
              step: out.step,
              tool: out.tool || "unknown",
              status: out.status,
              output: outputStr,
            });
          }

          // Sliding window: hapus observation lama jika melebihi batas
          if (observationBuffer.length > maxObservations * 2) {
            observationBuffer.splice(0, observationBuffer.length - maxObservations);
          }
        }

        // === EXIT CONDITIONS ===

        // 1. LLM memutuskan respond / veto
        if (!lastResult.plan || lastResult.plan.plannerDecision === "respond" || lastResult.success === false) {
          break;
        }

        // 1b. Sudah ada jawaban final dari eksekutor (hasil tool cukup)
        if (lastResult.finalResponse && String(lastResult.finalResponse).trim() !== "") {
          break;
        }

        // 2. Semua tool gagal — tidak ada progress
        const allOutputsFailed = Array.isArray(lastResult.outputs) &&
          lastResult.outputs.length > 0 &&
          lastResult.outputs.every(o => o.status === "skipped" || o.status === "error");
        if (allOutputsFailed) {
          break;
        }

        // 3. Tidak ada output sama sekali
        if (!lastResult.outputs || lastResult.outputs.length === 0) {
          break;
        }

        // 3b. Semua output sukses dengan success:true — hentikan loop (satu putaran tool cukup)
        const allOkStructured = lastResult.outputs.every(
          o => o.status === "ok" && o.output && o.output.success === true
        );
        if (allOkStructured && lastResult.outputs.length > 0) {
          break;
        }

        // 4. Deteksi loop — tool yang sama gagal 2x berturut-turut
        if (observationBuffer.length >= 2) {
          const lastTwo = observationBuffer.slice(-2);
          if (lastTwo[0].tool === lastTwo[1].tool &&
              lastTwo[0].status === "error" &&
              lastTwo[1].status === "error") {
            break;
          }
        }

        // Delay antar iterasi (beri waktu LLM bernafas)
        if (iterationDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, iterationDelay));
        }

        currentPayload.__isContinuation = true;
        currentPayload.__iterationCount = iteration;
      }

      // Tambahkan metadata iterasi ke hasil akhir
      if (lastResult) {
        lastResult.__iterations = iteration;
        lastResult.__totalTokensEst = totalTokensEstimated;
        lastResult.__executionTrace = executionTrace;
      }

      return lastResult;
    },
  };
}

module.exports = { createWorkflowEngine };
