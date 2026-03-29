"use strict";

const { EVENT_TYPES } = require("../../../core/events/event.types");
const { createOpenClawArchitectureMapperAgent } = require("../agents/openclaw-architecture-mapper.agent");

function mergeSnapshot(payloadSnapshot = {}) {
  const modules = Array.isArray(payloadSnapshot.modules) ? payloadSnapshot.modules : [];
  const snapshot = {
    modules: modules.length > 0 ? modules : ["agent-core", "basic-tools", "single-memory"],
    observability: {
      tracing: Boolean(payloadSnapshot.observability && payloadSnapshot.observability.tracing),
      metrics: Boolean(payloadSnapshot.observability && payloadSnapshot.observability.metrics),
    },
    reliability: {
      retries: Boolean(payloadSnapshot.reliability && payloadSnapshot.reliability.retries),
      queue: Boolean(payloadSnapshot.reliability && payloadSnapshot.reliability.queue),
    },
    memory: {
      longTerm: Boolean(payloadSnapshot.memory && payloadSnapshot.memory.longTerm),
    },
  };
  return snapshot;
}

function deriveArchitectureChecklist(auditResult = {}) {
  const gaps = Array.isArray(auditResult.gaps) ? auditResult.gaps : [];
  const areaSet = new Set(gaps.map((item) => item.area));
  const checklist = [];

  if (areaSet.has("orchestrator")) {
    checklist.push("Pastikan task routing antar-agent terdaftar dan terdokumentasi.");
  }
  if (areaSet.has("events")) {
    checklist.push("Pastikan event lifecycle task diterbitkan untuk observability.");
  }
  if (areaSet.has("observability")) {
    checklist.push("Pastikan metrics + tracing aktif di environment dev/staging.");
  }
  if (areaSet.has("reliability")) {
    checklist.push("Pastikan retry strategy dan queue worker terdefinisi.");
  }
  if (areaSet.has("memory")) {
    checklist.push("Pastikan long-term memory plan ada sebelum scale fitur agent.");
  }

  if (checklist.length === 0) {
    checklist.push("Tidak ada gap kritikal; lanjutkan dengan hardening dan regression test.");
  }

  return checklist;
}

async function runArchitectureWorkflowUpdate({ payload = {}, eventBus }) {
  const mapperAgent = createOpenClawArchitectureMapperAgent();
  const taskId = payload.taskId || `architecture-${Date.now()}`;
  const snapshot = mergeSnapshot(payload.openclawSnapshot);

  if (eventBus) {
    await eventBus.emit(EVENT_TYPES.TASK_CREATED, {
      taskId,
      from: "architecture-workflow-update",
      data: "Mulai audit arsitektur untuk update workflow development",
    });
  }

  const auditResult = await mapperAgent.run({
    message: payload.message || "Audit arsitektur platform dan susun update workflow development",
    openclawSnapshot: snapshot,
    __eventBus: eventBus,
  });

  if (eventBus) {
    await eventBus.emit(EVENT_TYPES.TASK_ANALYZED, {
      taskId,
      from: "openclaw-architecture-mapper",
      data: auditResult.summary || "Analisis arsitektur selesai",
    });
  }

  const architectureChecklist = deriveArchitectureChecklist(auditResult);
  const workflowUpdate = {
    branchPolicy: [
      "Sync branch feature dengan main terbaru sebelum mulai implementasi.",
      "Selalu gunakan branch fitur; hindari direct push ke main.",
      "Commit kecil per perubahan logis + wajib sertakan test terkait.",
    ],
    deliveryFlow: [
      "Audit perubahan terhadap komponen core/orchestrator/module terkait.",
      "Implementasi perubahan secara incremental dengan event trace aktif.",
      "Verifikasi lewat unit test dan smoke test endpoint task.",
    ],
    architectureChecklist,
    definitionOfDone: [
      "Task dapat dijalankan via /tasks/run tanpa error.",
      "Event penting (task/agent/tool) muncul di /events.",
      "Dokumentasi workflow dev diperbarui agar tim bisa follow langkah seragam.",
    ],
  };

  if (eventBus) {
    await eventBus.emit(EVENT_TYPES.ACTION_EXECUTED, {
      taskId,
      from: "architecture-workflow-update",
      data: "Workflow development berhasil diperbarui dari hasil audit",
    });
  }

  return {
    workflow: "architecture-workflow-update",
    taskId,
    snapshot,
    architectureAudit: {
      score: typeof auditResult.score === "number" ? auditResult.score : null,
      summary: auditResult.summary || "",
      gaps: Array.isArray(auditResult.gaps) ? auditResult.gaps : [],
      recommendations: Array.isArray(auditResult.recommendations) ? auditResult.recommendations : [],
    },
    workflowUpdate,
    summary: "Update workflow development berbasis audit arsitektur selesai.",
    finalResponse: "Agen arsitektur berhasil dipanggil. Workflow development telah diperbarui sebagai acuan dev berikutnya.",
  };
}

module.exports = { runArchitectureWorkflowUpdate };
