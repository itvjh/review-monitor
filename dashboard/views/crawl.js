const selected = new Set();
let crawlState = { platforms: [], jobs: [] }, moderator = false, submitting = false, loading = false;
const labels = { queued: 'Chờ chạy', running: 'Đang chạy', completed: 'Hoàn tất', partial: 'Hoàn tất một phần', failed: 'Lỗi' };
const isActive = (j) => j.status === 'running' || j.status === 'queued';
const busyPlatform = (p) => crawlState.jobs.some((j) => j.platform === p && isActive(j));
const available = () => crawlState.platforms.filter((p) => !busyPlatform(p.id));
const timeText = (s) => s ? new Date(s).toLocaleString('vi-VN') : '—';
function notice(text, type = '') {
  $('notice').replaceChildren();
  if (text) $('notice').append(el('div', 'banner ' + type, text));
}
function render() {
  for (const p of [...selected]) if (busyPlatform(p)) selected.delete(p);
  $('crawl-platforms').replaceChildren();
  for (const p of crawlState.platforms) {
    const job = crawlState.jobs.find((j) => j.platform === p.id && isActive(j));
    const card = el('div', 'crawl-pick');
    const head = el('div', 'run-head'); head.append(platformBadge(p.id));
    const choice = el('input'); choice.type = 'checkbox'; choice.checked = selected.has(p.id);
    choice.disabled = !moderator || submitting || Boolean(job); choice.setAttribute('aria-label', 'Chọn ' + p.name);
    choice.addEventListener('change', () => { choice.checked ? selected.add(p.id) : selected.delete(p.id); render(); });
    head.append(choice);
    const button = el('button', 'btn', job ? labels[job.status] : 'Crawl ngay');
    button.type = 'button'; button.disabled = !moderator || submitting || Boolean(job);
    button.addEventListener('click', () => start([p.id]));
    card.append(head, el('p', 'run-line', job ? 'Đã có trong hàng đợi.' : 'Chạy workflow lấy đánh giá mới.'), button);
    $('crawl-platforms').append(card);
  }
  const choices = available();
  $('selection-count').textContent = selected.size + ' nền tảng đã chọn';
  $('run-selected').disabled = !moderator || submitting || !selected.size;
  $('run-all').disabled = !moderator || submitting || !choices.length;
  $('select-all').disabled = !moderator || submitting || !choices.length;
  $('select-all').checked = Boolean(choices.length) && selected.size === choices.length;
  $('select-all').indeterminate = selected.size > 0 && selected.size < choices.length;
  $('crawl-jobs').replaceChildren();
  if (!crawlState.jobs.length) $('crawl-jobs').append(el('div', 'card meta', 'Chưa có lượt chạy thủ công. Chọn nền tảng ở phía trên để bắt đầu.'));
  for (const job of crawlState.jobs) {
    const card = el('article', 'card');
    const head = el('div', 'head'); head.append(platformBadge(job.platform), el('span', 'crawl-status ' + job.status, labels[job.status] || job.status));
    card.append(head, el('div', 'card-meta', 'Yêu cầu: ' + timeText(job.submittedAt) + (job.startedAt ? ' · Bắt đầu: ' + timeText(job.startedAt) : '') + (job.finishedAt ? ' · Kết thúc: ' + timeText(job.finishedAt) : '')));
    if (job.status === 'queued') {
      const ahead = crawlState.jobs.filter((j) => isActive(j)).reverse().findIndex((j) => j.id === job.id);
      card.append(el('p', 'run-line', 'Chờ ' + ahead + ' lượt phía trước.'));
    }
    if (job.status === 'running') card.append(el('p', 'run-line', 'n8n đang xử lý. Quá trình có thể mất vài phút.'));
    if (job.summary) card.append(el('p', 'run-line', `${job.summary.businesses_checked ?? '—'} cơ sở · ${job.summary.reviews_scanned ?? '—'} đánh giá đã quét · ${job.summary.new_reviews ?? '—'} đánh giá mới · ${job.summary.errors ?? 0} lỗi`));
    if (job.error) card.append(el('p', 'crawl-error', job.error));
    if (job.errorCodes?.length) card.append(el('p', 'crawl-error', job.errorCodes.join(' · ') + '. Xem chi tiết trên trang Cảnh báo.'));
    if (job.status === 'completed' && !job.summary) card.append(el('p', 'meta', 'Workflow đã kết thúc. Xem kết quả dữ liệu trên trang Cảnh báo.'));
    $('crawl-jobs').append(card);
  }
}
async function load() {
  if (loading || submitting) return;
  loading = true;
  try {
    const response = await fetch('/api/crawl', { cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    crawlState = data; render();
  } catch (e) { notice(e.message || 'Không tải được trạng thái.'); }
  finally { loading = false; }
}
async function start(ids) {
  if (submitting || !ids.length) return;
  submitting = true; render(); notice('');
  try {
    const response = await fetch('/api/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platforms: ids }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    crawlState = data; ids.forEach((id) => selected.delete(id));
    notice('Đã xếp ' + ids.length + ' nền tảng vào hàng đợi.', 'ok');
  } catch (e) { notice(e.message || 'Không gửi được yêu cầu. Làm mới để kiểm tra trước khi thử lại.'); }
  finally { submitting = false; render(); }
}
$('select-all').addEventListener('change', (e) => { selected.clear(); if (e.target.checked) available().forEach((p) => selected.add(p.id)); render(); });
$('run-selected').addEventListener('click', () => start([...selected]));
$('run-all').addEventListener('click', () => start(available().map((p) => p.id)));
$('refresh').addEventListener('click', load);
whoAmI.then((me) => { moderator = me.role === 'moderator'; $('role').textContent = moderator ? 'Quản trị' : 'Chỉ xem'; if (!moderator) notice('Chỉ máy quản trị mới có thể chạy crawl.', 'warn'); load(); });
setInterval(load, 3000);
