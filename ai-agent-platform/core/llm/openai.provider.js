"use strict";

function createOpenAIProvider() {
  return {
    async plan() {
      throw new Error("OpenAI provider belum dihubungkan. Gunakan mock provider sementara.");
    },
  };
}

module.exports = { createOpenAIProvider };
