"use strict";

/**
 * Entry point memori agent — re-export dari short.memory (+ API stabil untuk impor `memory.js`).
 */
const { createShortMemory, createMemory } = require("./short.memory");

module.exports = { createShortMemory, createMemory };
