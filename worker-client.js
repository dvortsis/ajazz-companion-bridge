/**
 * worker-client.js — Promise wrapper around the image worker thread.
 *
 * `request(job)` resolves with the worker reply. If the worker dies mid-job it is restarted and the promise
 * rejects with `err.workerCrashed = true` so the caller can retry.
 */
'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const log = require('./log');

class WorkerClient {
  constructor(workerPath = path.join(__dirname, 'image-worker.js')) {
    this.workerPath = workerPath;
    this.worker = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  ensure() {
    if (this.worker) return this.worker;
    const worker = new Worker(this.workerPath);
    worker.on('message', (msg) => {
      if (msg && msg.type === 'log') return log.fromWorker(msg.level, msg.msg);
      if (!msg || typeof msg.id !== 'number') return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg);
      else entry.reject(new Error(msg.error || 'image decode failed'));
    });
    const onDeath = (reason) => {
      if (this.worker !== worker) return;
      this.worker = null;
      log.error('[IMAGE] Worker stopped:', reason);
      for (const entry of this.pending.values()) {
        const err = new Error(`image worker stopped: ${reason}`);
        err.workerCrashed = true;
        entry.reject(err);
      }
      this.pending.clear();
    };
    worker.on('error', (e) => onDeath(e && e.message ? e.message : String(e)));
    worker.on('exit', (code) => onDeath(`exit code ${code}`));
    this.worker = worker;
    return worker;
  }

  request(job) {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = this.ensure();
      } catch (e) {
        e.workerCrashed = true;
        return reject(e);
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...job, type: 'bitmap', id });
    });
  }

  async terminate() {
    const w = this.worker;
    this.worker = null;
    if (w) await w.terminate();
  }
}

module.exports = { WorkerClient };
