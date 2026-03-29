"use strict";

function createShortMemory() {
  const state = [];

  return {
    remember(item) {
      state.push({ ...item, at: new Date().toISOString() });
      if (state.length > 30) {
        state.shift();
      }
    },
    recall(limit = 10) {
      return state.slice(-limit);
    },
  };
}

function createMemory() {
  return {
    short: createShortMemory(),
  };
}

module.exports = { createShortMemory, createMemory };
