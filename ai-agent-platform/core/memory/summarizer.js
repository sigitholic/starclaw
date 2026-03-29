"use strict";

function summarizeGaps(gaps) {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return "Tidak ada gap kritis terdeteksi.";
  }

  return gaps
    .map((gap, index) => `${index + 1}. ${gap.area}: ${gap.issue}`)
    .join("\n");
}

function summarizeInteractions(previousSummary, interactions = []) {
  const compactEntries = interactions
    .map((interaction) => {
      const userText = interaction.userMessage || "-";
      const agentText = interaction.agentMessage || "-";
      return `U:${userText} | A:${agentText}`;
    })
    .slice(-6);

  const merged = [previousSummary, ...compactEntries]
    .filter(Boolean)
    .join(" || ");

  if (!merged) {
    return "";
  }

  // Batasi panjang summary supaya tidak membesar tanpa kontrol.
  return merged.length > 1200 ? merged.slice(merged.length - 1200) : merged;
}

module.exports = { summarizeGaps, summarizeInteractions };
