"use strict";

/**
 * Structured Workflow Engine — mode deterministik untuk instruksi kompleks.
 *
 * Flow:
 *
 *   User Command
 *       │
 *       ▼
 *   [PLANNER] → full plan (array steps) sebelum eksekusi
 *       │
 *       ▼
 *   [LOOP per step]:
 *       ├─ beginStep() [STRICT: tidak bisa skip]
 *       ├─ [EXECUTOR] tool.run(step.input)
 *       ├─ [VALIDATOR] validate(result, attempt)
 *       │       ├─ valid → completeStep, lanjut ke step berikutnya
 *       │       ├─ !valid + shouldRetry (max 2x) → retry
 *       │       └─ !valid + canContinue → warn, tetap lanjut
 *       │       └─ !valid + !canContinue → error, STOP
 *       └─ [STATE] update logs + context
 *       │
 *       ▼
 *   [DONE] atau [ERROR]
 *
 * STRICT MODE:
 *   - Planner wajib dipanggil sebelum eksekusi
 *   - Step tidak bisa di-skip
 *   - Executor tidak bisa dipanggil tanpa plan
 */

const { createExecutionState } = require("./execution.state");
const { createStructuredPlanner } = require("./structured.planner");
const { createStepValidator, MAX_RETRIES } = require("./step.validator");
const { createLogger } = require("../utils/logger");

function createStructuredWorkflow({ toolsRegistry, llmProvider }) {
  const logger = createLogger("core/structured-workflow");

  const planner = createStructuredPlanner({ llmProvider, toolsRegistry, logger });
  const validator = createStepValidator({ logger });

  /**
   * Eksekusi satu step menggunakan tool registry.
   */
  async function executeStep(step, context) {
    // Special tool: __respond__ tidak perlu tool registry
    if (step.tool === "__respond__") {
      return {
        success: true,
        message: step.input.message || "Selesai",
        type: "response",
      };
    }

    const tool = toolsRegistry.get(step.tool);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${step.tool}' tidak ditemukan di registry. Tool tersedia: ${toolsRegistry.list().join(", ")}`,
      };
    }

    // Inject context ke input (agar step bisa akses hasil step sebelumnya)
    const enrichedInput = {
      ...step.input,
      __context: context,
    };

    try {
      return await tool.run(enrichedInput);
    } catch (err) {
      return { success: false, error: `Tool throw exception: ${err.message}` };
    }
  }

  /**
   * Jalankan satu step dengan retry loop.
   * @returns {{ completed: boolean, result: object, finalValidation: object }}
   */
  async function runStepWithRetry(state, stepIndex) {
    const step = state.plan[stepIndex];
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      attempt++;
      state.beginStep(stepIndex); // STRICT: enforce no-skip

      // Eksekusi
      state.log("info", `Eksekusi: ${step.tool}`, { input: step.input, attempt }, stepIndex);
      const result = await executeStep(step, state.context);

      // Validasi
      const validation = validator.validate(step, result, attempt, state.context);

      if (validation.valid) {
        state.completeStep(stepIndex, result);
        return { completed: true, result, finalValidation: validation };
      }

      if (validation.shouldRetry) {
        state.failStep(stepIndex, validation.reason, true);
        const backoffMs = 500 * attempt;
        state.log("warn", `Retry dalam ${backoffMs}ms (${attempt}/${MAX_RETRIES})`, null, stepIndex);
        await new Promise(r => setTimeout(r, backoffMs));
        // Reset step status untuk retry
        state.plan[stepIndex].status = "pending";
        continue;
      }

      // Tidak valid, tidak retry
      if (validation.canContinue) {
        // Warning tapi tetap lanjut
        state.log("warn", `Step ${stepIndex + 1} warning: ${validation.reason} — dilanjutkan`, null, stepIndex);
        state.completeStep(stepIndex, result);
        return { completed: true, result, finalValidation: validation };
      }

      // Error fatal — hentikan
      state.failStep(stepIndex, validation.reason, false);
      return { completed: false, result, finalValidation: validation };
    }

    // Habis retry
    state.failStep(stepIndex, `Gagal setelah ${MAX_RETRIES} retry`, false);
    return { completed: false, result: null, finalValidation: { reason: `Max retries (${MAX_RETRIES}) tercapai` } };
  }

  /**
   * Jalankan workflow lengkap untuk sebuah command.
   *
   * @param {string} command - Perintah dari user
   * @param {object} options - { eventBus, agentName, onStepComplete }
   * @returns {ExecutionState summary + step report + finalMessage}
   */
  async function run(command, options = {}) {
    const state = createExecutionState(command);
    const eventBus = options.eventBus || null;

    logger.info("Structured Workflow dimulai", { taskId: state.taskId, command: command.slice(0, 80) });

    // ============================================================
    // PHASE 1: PLANNING
    // ============================================================
    state.transitionTo("planning");
    state.log("info", "Memulai fase planning...");

    let plan;
    try {
      plan = await planner.createPlan(command);
    } catch (err) {
      state.error = `Planning gagal: ${err.message}`;
      state.transitionTo("error");
      return buildResult(state, null);
    }

    state.setPlan(plan);

    // ============================================================
    // PHASE 2: EXECUTION (strict step-by-step)
    // ============================================================
    state.transitionTo("running");
    state.log("info", `Eksekusi ${state.totalSteps} step dimulai`);

    let finalMessage = null;

    for (let i = 0; i < state.plan.length; i++) {
      const step = state.plan[i];
      state.log("info", `[${i + 1}/${state.totalSteps}] ${step.task}`, { tool: step.tool }, i);

      // Emit event ke dashboard/Telegram jika ada
      if (eventBus && options.onStepStart) {
        options.onStepStart(i, step, state);
      }

      const { completed, result, finalValidation } = await runStepWithRetry(state, i);

      // Collect response jika ada
      if (result && result.type === "response") {
        finalMessage = result.message;
      } else if (result && result.message) {
        // Akumulasikan informasi ke context
        if (!finalMessage) finalMessage = result.message;
      }

      // Emit step complete
      if (options.onStepComplete) {
        options.onStepComplete(i, step, result, finalValidation, state);
      }

      if (!completed) {
        state.error = `Step ${i + 1} gagal: ${finalValidation.reason}`;
        state.transitionTo("error");

        logger.error("Workflow berhenti karena error", {
          taskId: state.taskId,
          step: i + 1,
          reason: finalValidation.reason,
        });

        return buildResult(state, finalMessage);
      }
    }

    // ============================================================
    // PHASE 3: DONE
    // ============================================================
    state.transitionTo("done");
    state.log("info", "Semua step selesai!");

    logger.info("Structured Workflow selesai", {
      taskId: state.taskId,
      durationMs: state.getSummary().durationMs,
      steps: state.totalSteps,
    });

    return buildResult(state, finalMessage);
  }

  function buildResult(state, finalMessage) {
    const summary = state.getSummary();
    const stepReport = state.getStepReport();

    const successfulTools = state.plan
      .filter(s => s.status === "ok")
      .map(s => s.tool)
      .filter(Boolean);

    const failedSteps = stepReport.filter(s => s.status === "error");

    // Buat finalResponse yang informatif
    let finalResponse;
    if (state.status === "done") {
      finalResponse = finalMessage || buildSuccessMessage(state, stepReport);
    } else {
      finalResponse = buildErrorMessage(state, failedSteps);
    }

    return {
      taskId: state.taskId,
      success: state.status === "done",
      status: state.status,
      summary: `Workflow ${state.status} — ${summary.progress} step selesai`,
      finalResponse,
      stepReport,
      context: state.context,
      logs: state.logs,
      durationMs: summary.durationMs,
      // Kompatibilitas dengan Re-Act result format
      plan: { plannerDecision: state.status === "done" ? "respond" : "error" },
      outputs: stepReport.map(s => ({
        step: s.task,
        tool: s.tool,
        status: s.status === "ok" ? "ok" : "error",
        output: state.context[`step_${s.step}`] || null,
      })),
    };
  }

  function buildSuccessMessage(state, stepReport) {
    const lines = [`✅ Perintah berhasil dieksekusi (${state.totalSteps} step).`];
    const completedSteps = stepReport.filter(s => s.status === "ok");
    if (completedSteps.length > 0) {
      lines.push("Yang sudah dikerjakan:");
      completedSteps.forEach(s => lines.push(`  ${s.step}. ${s.task}`));
    }
    return lines.join("\n");
  }

  function buildErrorMessage(state, failedSteps) {
    const lines = [`❌ Workflow berhenti di step ${state.currentStep + 1}.`];
    if (state.error) lines.push(`Error: ${state.error}`);
    if (failedSteps.length > 0) {
      lines.push("Step yang gagal:");
      failedSteps.forEach(s => lines.push(`  ${s.step}. ${s.task} — ${s.error || "unknown error"}`));
    }
    lines.push("\nGunakan 'cek status platform' untuk diagnostik lebih lanjut.");
    return lines.join("\n");
  }

  return { run };
}

module.exports = { createStructuredWorkflow };
