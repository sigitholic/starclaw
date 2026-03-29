"use strict";

function createEventStore() {
  const events = [];

  return {
    add(event) {
      events.push({ ...event, at: new Date().toISOString() });
    },
    list() {
      return [...events];
    },
  };
}

module.exports = { createEventStore };
