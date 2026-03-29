"use strict";

function summarizeGaps(gaps) {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return "Tidak ada gap kritis terdeteksi.";
  }

  return gaps
    .map((gap, index) => `${index + 1}. ${gap.area}: ${gap.issue}`)
    .join("\n");
}

module.exports = { summarizeGaps };
