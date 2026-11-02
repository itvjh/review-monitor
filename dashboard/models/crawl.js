const { randomUUID } = require('crypto');
const platforms = require('../../config/platforms');
const { HttpError } = require('./httpError');
const runner = require('./crawlRunner');

function createQueue(execute = runner.execute) {
  const jobs = [];
  let draining = false;
  const running = new Map(); // job id -> AbortController of the run in progress
  const stopped = new Set(); // ids of jobs the moderator stopped
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
          const ctl = new AbortController();
          running.set(job.id, ctl);
          const result = await execute(platforms[job.platform].workflow.id, ctl.signal);
          Object.assign(job, result);
          job.status = result.outcome === 'FAILED' || result.outcome === 'AUTH_REQUIRED' ? 'failed' : result.outcome === 'PARTIAL' ? 'partial' : 'completed';
        } catch (e) { job.status = 'failed'; job.error = e.message; }
        running.delete(job.id);
        if (stopped.delete(job.id)) { job.status = 'stopped'; delete job.error; }
        job.finishedAt = new Date().toISOString();
      }
    } finally { draining = false; }
  }
  return {
    snapshot,
    // A waiting job is dropped from the queue; a running one has its n8n process killed (what it already saved stays saved).
    stop(id) {
      const job = jobs.find((j) => j.id === id);
      if (!job) throw new HttpError(404, 'Không tìm thấy lượt chạy.');
      if (!active(job)) throw new HttpError(409, 'Lượt chạy đã kết thúc.');
      if (job.status === 'queued') { job.status = 'stopped'; job.finishedAt = new Date().toISOString(); }
      else { stopped.add(id); running.get(id)?.abort(); }
      return snapshot();
    },
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
