"use strict";

class BaseAgent {
  constructor({ name, planner, executor, memory, logger }) {
    this.name = name;
    this.planner = planner;
    this.executor = executor;
    this.memory = memory;
    this.logger = logger;
  }

  async run(input = {}) {
    this.logger.info("Agent menerima input", { agent: this.name });
    const plan = await this.planner.createPlan(input);
    const execution = await this.executor.execute(plan, input);

    this.memory.short.remember({ agent: this.name, input, execution });

    return {
      agent: this.name,
      plan,
      ...execution,
    };
  }
}

module.exports = { BaseAgent };
