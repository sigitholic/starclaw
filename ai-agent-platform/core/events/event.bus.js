"use strict";

function createEventBus() {
  const handlers = new Map();

  return {
    on(eventType, handler) {
      if (!handlers.has(eventType)) {
        handlers.set(eventType, []);
      }
      handlers.get(eventType).push(handler);
    },
    async emit(eventType, payload) {
      const eventHandlers = handlers.get(eventType) || [];
      for (const handler of eventHandlers) {
        await handler(payload);
      }
    },
  };
}

module.exports = { createEventBus };
