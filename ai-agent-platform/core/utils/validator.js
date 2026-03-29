"use strict";

function requireFields(input, fields) {
  const missing = fields.filter((field) => !(field in (input || {})));
  if (missing.length > 0) {
    throw new Error(`Field wajib belum ada: ${missing.join(", ")}`);
  }
}

module.exports = { requireFields };
