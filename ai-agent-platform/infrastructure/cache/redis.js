"use strict";

function createRedisClient() {
  return {
    async get() {
      return null;
    },
    async set() {
      return "OK";
    },
  };
}

module.exports = { createRedisClient };
