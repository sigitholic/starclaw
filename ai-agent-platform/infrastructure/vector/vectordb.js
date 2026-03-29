"use strict";

function createVectorDbClient() {
  return {
    async upsert() {
      return { ok: true };
    },
    async search() {
      return [];
    },
  };
}

module.exports = { createVectorDbClient };
