"use strict";

/**
 * Execution State Manager — state management deterministik per task.
 *
 * Setiap task memiliki state yang terlacak dengan jelas:
 *
 *   {
 *     taskId:      string      — ID unik task
 *     command:     string      — Perintah awal user
 *     status:      "pending" | "planning" | "running" | "done" | "error"
 *     currentStep: number      — Step yang sedang dieksekusi (0-based)
 *     plan:        Step[]      — Daftar step dari Planner
 *     logs:        LogEntry[]  — Semua log selama eksekusi
 *     context:     object      — Data yang diakumulasi antar step
 *     startedAt:   string      — Timestamp mulai
 *     finishedAt:  string|null — Timestamp selesai
 *     error:       string|null — Error terakhir jika status=error
 *   }
 *
 * STRICT MODE:
 *   - Executor tidak bisa eksekusi tanpa plan (status harus sudah "running")
 *   - Step tidak bisa di-skip (currentStep harus increment +1)
 *   - Context diakumulasikan — step berikutnya bisa baca hasil step sebelumnya
 */

let taskCounter = 0;

function createExecutionState(command) {
  const taskId = `task-${Date.now()}-${++taskCounter}`;

  const state = {
    taskId,
    command: String(command || ""),
    status: "pending",      // pending → planning → running → done/error
    currentStep: 0,
    plan: [],               // Array of { stepNumber, task, tool, input, description }
    logs: [],               // Array of { time, level, step, message, data }
    context: {},            // Akumulasi hasil tiap step
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    retries: {},            // { stepIndex: attemptCount }
    totalSteps: 0,
  };

  // ============================================================
  // Logger terintegrasi
  // ============================================================
  function log(level, message, data = null, stepOverride = null) {
    const entry = {
      time: new Date().toISOString(),
      level,                                    // "info" | "warn" | "error" | "debug"
      step: stepOverride !== null ? stepOverride : state.currentStep,
      message,
      data: data !== null ? data : undefined,
    };
    state.logs.push(entry);
    const prefix = `[${taskId}][step:${entry.step}][${level.toUpperCase()}]`;
    if (level === "error") console.error(prefix, message, data || "");
    else if (level === "warn") console.warn(prefix, message, data || "");
    else console.log(prefix, message, data ? JSON.stringify(data) : "");
  }

  // ============================================================
  // State transitions (strict — tidak bisa mundur)
  // ============================================================
  function transitionTo(newStatus) {
    const allowed = {
      pending:  ["planning"],
      planning: ["running", "error"],
      running:  ["done", "error"],
      done:     [],
      error:    [],
    };
    if (!allowed[state.status].includes(newStatus)) {
      throw new Error(`[StrictMode] Transisi status tidak valid: ${state.status} → ${newStatus}`);
    }
    state.status = newStatus;
    if (newStatus === "done" || newStatus === "error") {
      state.finishedAt = new Date().toISOString();
    }
    log("info", `Status berubah: ${newStatus}`);
  }

  // ============================================================
  // Plan management
  // ============================================================
  function setPlan(steps) {
    if (state.status !== "planning") {
      throw new Error("[StrictMode] setPlan() hanya boleh dipanggil saat status=planning");
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error("[StrictMode] Plan tidak boleh kosong");
    }
    state.plan = steps.map((s, i) => ({
      stepNumber: i + 1,
      task: s.task || s.description || `Step ${i + 1}`,
      tool: s.tool || null,
      input: s.input || {},
      description: s.description || s.task || "",
      status: "pending",    // pending → running → ok | error | skipped
    }));
    state.totalSteps = state.plan.length;
    log("info", `Plan ditetapkan: ${state.totalSteps} step`, {
      steps: state.plan.map(s => `${s.stepNumber}. ${s.task}`),
    });
  }

  // ============================================================
  // Step execution tracking (STRICT — tidak bisa skip)
  // ============================================================
  function beginStep(stepIndex) {
    if (state.status !== "running") {
      throw new Error("[StrictMode] beginStep() hanya boleh saat status=running");
    }
    if (stepIndex !== state.currentStep) {
      throw new Error(
        `[StrictMode] Skip step terdeteksi! Expected step=${state.currentStep}, got step=${stepIndex}`
      );
    }
    if (!state.plan[stepIndex]) {
      throw new Error(`[StrictMode] Step index ${stepIndex} tidak ada dalam plan`);
    }
    state.plan[stepIndex].status = "running";
    log("info", `Mulai step ${stepIndex + 1}: ${state.plan[stepIndex].task}`, null, stepIndex);
  }

  function completeStep(stepIndex, result) {
    if (!state.plan[stepIndex]) return;
    state.plan[stepIndex].status = "ok";
    state.plan[stepIndex].result = result;
    // Akumulasikan ke context
    state.context[`step_${stepIndex + 1}`] = result;
    state.currentStep = stepIndex + 1;
    log("info", `Step ${stepIndex + 1} selesai`, { result: JSON.stringify(result).slice(0, 200) }, stepIndex);
  }

  function failStep(stepIndex, error, willRetry = false) {
    if (!state.plan[stepIndex]) return;
    state.plan[stepIndex].status = willRetry ? "retrying" : "error";
    state.plan[stepIndex].error = String(error);

    if (!state.retries[stepIndex]) state.retries[stepIndex] = 0;
    state.retries[stepIndex]++;

    log("error", `Step ${stepIndex + 1} gagal (attempt ${state.retries[stepIndex]})`, {
      error: String(error),
      willRetry,
    }, stepIndex);
  }

  // ============================================================
  // Getters untuk laporan
  // ============================================================
  function getSummary() {
    const duration = state.finishedAt
      ? new Date(state.finishedAt) - new Date(state.startedAt)
      : Date.now() - new Date(state.startedAt);

    return {
      taskId: state.taskId,
      command: state.command,
      status: state.status,
      progress: `${Math.min(state.currentStep, state.totalSteps)}/${state.totalSteps}`,
      durationMs: duration,
      stepsCompleted: state.plan.filter(s => s.status === "ok").length,
      stepsFailed: state.plan.filter(s => s.status === "error").length,
      error: state.error,
      lastLog: state.logs[state.logs.length - 1]?.message || null,
    };
  }

  function getStepReport() {
    return state.plan.map(s => ({
      step: s.stepNumber,
      task: s.task,
      status: s.status,
      tool: s.tool,
      retries: state.retries[s.stepNumber - 1] || 0,
      error: s.error || null,
    }));
  }

  return {
    // Raw state (read-only dari luar)
    get taskId() { return state.taskId; },
    get command() { return state.command; },
    get status() { return state.status; },
    get currentStep() { return state.currentStep; },
    get plan() { return state.plan; },
    get logs() { return state.logs; },
    get context() { return state.context; },
    get totalSteps() { return state.totalSteps; },
    get error() { return state.error; },
    set error(v) { state.error = v; },

    // Methods
    transitionTo,
    setPlan,
    beginStep,
    completeStep,
    failStep,
    log,
    getSummary,
    getStepReport,
  };
}

module.exports = { createExecutionState };
