const TABS = [['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['posted', 'Đã đăng'], ['rejected', 'Từ chối'], ['none', 'Chưa có bản nháp']];
const LANG = { vi: 'Tiếng Việt', en: 'Tiếng Anh', ru: 'Tiếng Nga', ko: 'Tiếng Hàn', ja: 'Tiếng Nhật', zh: 'Tiếng Trung', fr: 'Tiếng Pháp', de: 'Tiếng Đức', th: 'Tiếng Thái' };
const OWNER_URL = { google: 'https://business.google.com/reviews', tripadvisor: 'https://www.tripadvisor.com.vn/Owners' };
const AUTO = ['google', 'tripadvisor']; // platforms the posting queue handles (keep in step with publish.AUTO_PLATFORMS)
let status = 'pending', platform = '', busy = false, canModerate = false, posting = 'off', gapMinutes = 5;
const selected = new Set(); // pending replies ticked for bulk approval
const areas = new Map(); // review id -> its textarea (bulk approval sends the text as edited)
let names = new Map(); // review id -> reviewer name, to explain skipped items
let bulkButton = null;
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
try { status = localStorage.getItem('replyTab') || status; platform = localStorage.getItem('replyPlatform') || ''; } catch (e) {}
if (platform && !PLATFORMS[platform]) platform = '';

// All state-changing calls are JSON POSTs (the server rejects anything else).
const post = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
};
const note = (text, bad) => { const m = $('msg'); m.replaceChildren(); if (text) m.append(el('div', bad ? 'banner' : 'banner ok', text)); };
const hhmm = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const platOf = (r) => (PLATFORMS[r.platform] ? r.platform : 'google');

function warningsBox(box, warnings) {
  box.replaceChildren(...warnings.map((w) => el('div', 'warning ' + w.level, (w.level === 'error' ? '⛔ ' : '⚠ ') + w.message)));
}

function updateBulkButton() {
  if (bulkButton) { bulkButton.replaceChildren(icon('check'), `Duyệt hàng loạt (${selected.size})`); bulkButton.disabled = selected.size === 0; }
}

// Where an approved reply stands: platforms in AUTO go through the posting queue, any other is pasted by hand.
function queueLine(r) {
  const box = el('div', 'queue');
  if (!AUTO.includes(platOf(r))) { box.append(el('div', 'meta', `Không tự đăng được lên ${platformName(r.platform)}: sao chép nội dung, dán vào trang quản lý rồi bấm "Đã đăng tay".`)); return box; }
  if (posting === 'live') {
    if (r.stalled) box.append(el('div', 'warning error', `Đã thử ${r.reply_attempts} lần không thành công, hàng đợi tạm bỏ qua bài này. Kiểm tra lỗi rồi bấm "Thử lại".`));
    else box.append(el('div', 'meta', `Hàng đợi #${r.queue_position} · dự kiến đăng khoảng ${hhmm(r.eta)}` + (r.reply_attempts ? ` · đã thử ${r.reply_attempts} lần` : '')));
  } else if (posting === 'dry-run') box.append(el('div', 'meta', 'Chế độ chạy thử: không có gì được đăng thật.'));
  else box.append(el('div', 'meta', 'Đăng tự động đang tắt: hãy đăng tay rồi bấm "Đã đăng tay".'));
  if (r.reply_error) box.append(el('div', 'warning warn', 'Lần đăng gần nhất lỗi: ' + r.reply_error));
  return box;
}

function card(r) {
  const p = platOf(r);
  const c = el('article', 'card');
  c.dataset.id = r.id; // lets run() take the card off screen the moment its action succeeds
  const head = el('div', 'head');
  const main = el('div', 'head-main');
  if (status === 'pending' && canModerate) {
    const box = el('input'); box.type = 'checkbox'; box.checked = selected.has(r.id); box.setAttribute('aria-label', 'Chọn để duyệt hàng loạt: ' + (r.reviewer_name || 'Ẩn danh'));
    box.addEventListener('change', () => { box.checked ? selected.add(r.id) : selected.delete(r.id); updateBulkButton(); });
    main.append(box);
  }
  main.append(platformBadge(p), el('span', 'biz', (r.businesses && r.businesses.business_name) || '—'));
  head.append(main, starsEl(r.rating));
  const lang = r.review_text ? (LANG[r.language] || r.language || 'Không rõ') : 'Không có nội dung';
  const meta = el('div', 'card-meta');
  meta.append(el('span', '', `${r.reviewer_name || 'Ẩn danh'} · ${r.review_date_raw || r.review_date || ''}`), el('span', 'chip', 'Ngôn ngữ khách: ' + lang));
  c.append(head, meta, reviewBody(r));

  if (status === 'none') {
    if (!canModerate) return c;
    const b = withIcon(el('button', 'btn primary', 'Tạo bản nháp bằng AI'), 'sparkles');
    b.type = 'button';
    b.addEventListener('click', () => run(() => post('/api/replies/generate', { id: r.id }), b));
    const actions = el('div', 'actions'); actions.append(b); c.append(actions);
    return c;
  }

  const editable = status === 'pending' && canModerate;
  const area = el('textarea', 'reply');
  area.value = r.reply_final || r.reply_draft || '';
  area.readOnly = !editable;
  area.rows = Math.min(14, Math.max(4, Math.ceil(area.value.length / 90) + 1));
  area.setAttribute('aria-label', 'Nội dung trả lời cho ' + (r.reviewer_name || 'khách'));
  areas.set(r.id, area);
  const warn = el('div', 'warnings');
  warningsBox(warn, r.warnings || []);
  c.append(el('div', 'label', editable ? 'Nội dung trả lời (có thể chỉnh sửa)' : 'Nội dung trả lời'), area, warn);
  if (status === 'approved') c.append(queueLine(r));

  let timer;
  if (editable) {
    area.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { try { warningsBox(warn, (await post('/api/replies/lint', { text: area.value })).warnings); } catch (e) {} }, 400);
    });
  }

  if (!canModerate) return c; // viewers read only: no buttons
  const actions = el('div', 'actions');
  const btn = (label, cls, fn, ico) => { const b = el('button', 'btn ' + cls, label); if (ico) withIcon(b, ico); b.type = 'button'; b.addEventListener('click', () => fn(b)); actions.append(b); };
  const act = (action) => (b) => run(() => post('/api/replies/action', { id: r.id, action, text: area.value }), b, action !== 'retry');

  if (status === 'pending') {
    btn('Duyệt', 'primary', act('approve'), 'check');
    btn('Tạo lại bằng AI', '', (b) => run(() => post('/api/replies/generate', { id: r.id }), b), 'sparkles');
    btn('Từ chối', 'danger', act('reject'), 'x');
  } else if (status === 'approved') {
    const manual = !AUTO.includes(p);
    btn('Sao chép nội dung', manual ? 'primary' : '', async (b) => { await navigator.clipboard.writeText(area.value); b.replaceChildren(icon('check'), 'Đã sao chép'); }, 'copy');
    const a = withIcon(el('a', 'btn', 'Mở trang quản lý ' + platformName(p)), 'external-link');
    a.href = OWNER_URL[p]; a.target = '_blank'; a.rel = 'noopener';
    actions.append(a);
    if (posting === 'dry-run' && !manual) btn('Chạy thử đăng', 'primary', (b) => run(() => post('/api/replies/post', { id: r.id }), b), 'send');
    if (r.stalled || r.reply_error) btn('Thử lại', 'primary', act('retry'), 'rotate-ccw');
    btn('Đã đăng tay', '', act('posted'), 'circle-check');
    btn('Trả về chờ duyệt', '', act('reopen'), 'rotate-ccw');
  } else if (status === 'rejected') {
    btn('Đưa lại chờ duyệt', '', act('reopen'), 'rotate-ccw');
  }
  c.append(actions);
  return c;
}

// Bulk approval: the whole page's ticked replies, each with the text as currently edited.
function bulkBar(items) {
  const bar = el('div', 'bulkbar');
  const all = el('input'); all.type = 'checkbox'; all.id = 'all';
  const label = el('label', '', 'Chọn tất cả'); label.prepend(all);
  all.addEventListener('change', () => {
    items.forEach((r) => (all.checked ? selected.add(r.id) : selected.delete(r.id)));
    document.querySelectorAll('.card .head input[type=checkbox]').forEach((b) => { b.checked = all.checked; });
    updateBulkButton();
  });
  bulkButton = el('button', 'btn primary');
  bulkButton.type = 'button';
  bulkButton.addEventListener('click', async () => {
    const ids = [...selected].filter((id) => areas.has(id));
    if (!ids.length) return;
    const where = posting === 'live' ? ` Các bài sẽ xếp hàng và tự đăng lần lượt (mỗi bài cách nhau ${gapMinutes} phút).` : '';
    if (!(await confirmDialog(`Duyệt ${ids.length} bài đã chọn?${where} Bài có cảnh báo sẽ bị bỏ qua để bạn xem lại.`, 'Duyệt'))) return;
    run(() => post('/api/replies/bulk', { action: 'approve', items: ids.map((id) => ({ id, text: areas.get(id).value })) }), bulkButton, true);
  });
  bar.append(label, bulkButton);
  updateBulkButton();
  return bar;
}

// Tells the moderator what an approval, a bulk approval or a dry run did.
function report(j) {
  if (!j) return note('');
  if (j.approved) {
    const skipped = (j.skipped || []).map((s) => `${names.get(s.id) || s.id}: ${s.reason}`);
    selected.clear();
    const head = `Đã duyệt ${j.approved.length} bài${j.queued ? `. Đang xếp hàng đăng (mỗi bài cách nhau ${gapMinutes} phút)` : ''}.`;
    return note(head + (skipped.length ? ` Bỏ qua ${skipped.length} bài cần xem lại: ${skipped.join(' | ')}` : ''), skipped.length > 0 && !j.approved.length);
  }
  if (j.queued) return note(`Đã duyệt và xếp vào hàng đợi đăng (mỗi bài cách nhau ${gapMinutes} phút). Xem ở tab "Đã duyệt".`);
  if (j.result === 'dry-run') return note('Chạy thử: đã điền nội dung vào ô trả lời nhưng KHÔNG bấm Đăng/Gửi.' + (j.screenshot ? ' Ảnh: ' + j.screenshot : ''));
  note('');
}

// leaves = the action moves the review out of the current tab: its card disappears at once instead of after a full reload
// (a reload is two more round trips to the database), and the lists and counts refresh in the background.
async function run(fn, button, leaves) {
  if (busy) return;
  busy = true; if (button) button.disabled = true;
  try {
    const j = await fn();
    report(j);
    if (leaves && j) for (const id of j.approved || (j.item ? [j.item.id] : [])) document.querySelectorAll('.card').forEach((c) => { if (c.dataset.id === id) c.remove(); });
  } catch (e) { note(e.message, true); }
  busy = false;
  load();
}

async function load() {
  try {
    const me = await whoAmI;
    canModerate = me.role === 'moderator';
    posting = me.posting;
    gapMinutes = me.gapMinutes || gapMinutes;
    const m = $('mode'); m.replaceChildren();
    if (canModerate && posting === 'dry-run') m.append(el('div', 'banner warn', 'Chế độ CHẠY THỬ: không có gì được đăng thật.'));
    $('role').textContent = canModerate ? '' : 'Chế độ chỉ xem';
    const res = await fetch('/api/replies?status=' + status + (platform ? '&platform=' + platform : ''));
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);

    const count = (p) => (j.platforms[p || 'all'] || {})[status] || 0;
    segmented($('platforms'), [['', 'Tất cả', count('')], ...Object.keys(PLATFORMS).map((p) => [p, platformName(p), count(p), p])], platform, (v) => { platform = v; selected.clear(); keep('replyPlatform', v); note(''); load(); });
    segmented($('tabs'), TABS.map(([key, label]) => [key, label, j.counts[key]]), status, (v) => { status = v; selected.clear(); keep('replyTab', v); note(''); load(); });
    document.title = (j.counts.pending ? `(${j.counts.pending}) ` : '') + 'Trả lời đánh giá';

    const list = $('list'); list.replaceChildren();
    areas.clear(); bulkButton = null;
    names = new Map(j.items.map((r) => [r.id, r.reviewer_name]));
    for (const id of [...selected]) if (!names.has(id)) selected.delete(id);
    if (!j.items.length) return list.append(el('div', 'empty-state', 'Không có mục nào.'));
    if (status === 'pending' && canModerate) list.append(bulkBar(j.items));
    if (platform) return j.items.forEach((r) => list.append(card(r)));
    for (const p of Object.keys(PLATFORMS)) { // all platforms: one clearly labelled section each
      const part = j.items.filter((r) => platOf(r) === p);
      if (!part.length) continue;
      const h = el('div', 'section');
      const t = el('h2'); t.append(platformBadge(p), el('span', 'count', `${part.length} bài`));
      h.append(t); list.append(h);
      part.forEach((r) => list.append(card(r)));
    }
  } catch (e) { note('Không tải được dữ liệu: ' + e.message, true); }
}

$('list').append(el('div', 'skeleton'));
load();
setInterval(() => { if (!busy && !document.activeElement.matches('textarea')) load(); }, 60000);
