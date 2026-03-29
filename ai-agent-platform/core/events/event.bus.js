"use strict";

const { EventEmitter } = require("events");

function createEventBus() {
  const emitter = new EventEmitter();

  return {
    on(eventType, handler) {
      emitter.on(eventType, handler);
    },
    async emit(eventType, payload) {
      const eventHandlers = emitter.listeners(eventType);
      for (const handler of eventHandlers) {
        await handler(payload);
      }
    },
    raw() {
      return emitter;
    },
  };
}

module.exports = { createEventBus };
