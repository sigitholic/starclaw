"use strict";

function createQueueClient() {
  return {
    async enqueue(message) {
      return { queued: true, message };
    },
  };
}

module.exports = { createQueueClient };
