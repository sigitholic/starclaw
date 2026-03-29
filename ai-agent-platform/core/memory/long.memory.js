"use strict";

function createLongMemoryStore() {
  const store = new Map();

  return {
    put(key, value) {
      store.set(key, { value, at: new Date().toISOString() });
    },
    get(key) {
      return store.get(key) || null;
    },
    all() {
      return Array.from(store.entries()).map(([key, payload]) => ({ key, ...payload }));
    },
  };
}

module.exports = { createLongMemoryStore };
