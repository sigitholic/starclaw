"use strict";

function createLogger(scope = "app") {
  const format = (level, message, payload) => {
    const base = `[${new Date().toISOString()}] [${scope}] [${level}] ${message}`;
    return payload ? `${base} ${JSON.stringify(payload)}` : base;
  };

  return {
    info(message, payload) {
      console.log(format("INFO", message, payload));
    },
    warn(message, payload) {
      console.warn(format("WARN", message, payload));
    },
    error(message, payload) {
      console.error(format("ERROR", message, payload));
    },
  };
}

module.exports = { createLogger };
