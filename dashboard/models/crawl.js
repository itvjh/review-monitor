const { randomUUID } = require('crypto');
const platforms = require('../../config/platforms');
const { HttpError } = require('./httpError');
const runner = require('./crawlRunner');

function createQueue(execute = runner.execute) {
  const jobs = [];
  let draining = false;
  const active = (j) => j.status === 'queued' || j.status === 'running';
  const snapshot = () => ({
    platforms: Object.entries(platforms).map(([id, p]) => ({ id, name: p.name })),
    jobs: jobs.slice().reverse().map((j) => ({ ...j })),
  });
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (let job; (job = jobs.find((j) => j.status === 'queued'));) {
        job.status = 'running'; job.startedAt = new Date().toISOString();
        try {
          const result = await execute(platforms[job.platform].workflow.id);
          Object.assign(job, result);
          job.status = result.outcome === 'FAILED' || result.outcome === 'AUTH_REQUIRED' ? 'failed' : result.outcome === 'PARTIAL' ? 'partial' : 'completed';
        } catch (e) { job.status = 'failed'; job.error = e.message; }
        job.finishedAt = new Date().toISOString();
      }
    } finally { draining = false; }
  }
  return {
    snapshot,
    enqueue(selected) {
      if (!Array.isArray(selected) || selected.length < 1 || selected.length > Object.keys(platforms).length || selected.some((p) => typeof p !== 'string' || !Object.hasOwn(platforms, p)) || new Set(selected).size !== selected.length) {
        throw new HttpError(400, 'Chọn một hoặc nhiều nền tảng hợp lệ, không trùng nhau.');
      }
      const busy = selected.filter((p) => jobs.some((j) => j.platform === p && active(j)));
      if (busy.length) throw new HttpError(409, `${busy.map((p) => platforms[p].name).join(', ')} đang chạy hoặc chờ chạy.`);
      // Bound session history while keeping every unfinished job.
      while (jobs.length + selected.length > 50) {
        const old = jobs.findIndex((j) => !active(j));
        if (old < 0) break;
        jobs.splice(old, 1);
      }
      const batchId = randomUUID();
      for (const platform of selected) jobs.push({ id: randomUUID(), batchId, platform, status: 'queued', submittedAt: new Date().toISOString(), startedAt: null, finishedAt: null });
      // Return immediately: a workflow can take minutes; polling/reloading never starts another run.
      void drain();
      return snapshot();
    },
  };
}
module.exports = { ...createQueue(), createQueue };
