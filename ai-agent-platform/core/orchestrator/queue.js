"use strict";

/**
 * Task Queue Sederhana untuk Reliability Worker
 * Memastikan eksekusi agent yang long-running bisa masuk antrean background.
 */
class InMemoryQueue {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.queue = [];
    this.isProcessing = false;
  }

  async enqueue(taskName, payload) {
    const job = { 
      id: Date.now().toString() + Math.floor(Math.random() * 1000), 
      taskName, 
      payload, 
      status: "pending" 
    };
    this.queue.push(job);
    
    // Jangan menghalangi request dengan fire and forget
    setTimeout(() => this.processNext(), 0);
    
    return job.id;
  }

  async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    
    const job = this.queue.shift();
    job.status = "processing";
    
    try {
      console.log(`[Queue Worker] Memproses job ${job.id} untuk task: ${job.taskName}`);
      const result = await this.orchestrator.run(job.taskName, job.payload);
      job.status = "completed";
      job.result = result;
      console.log(`[Queue Worker] Job ${job.id} selesai.`);
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      console.error(`[Queue Worker] Job ${job.id} gagal: ${error.message}`);
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }
}

module.exports = { InMemoryQueue };
