const PRI = { urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
const CAT = { ROOM: 'Phòng', CLEANLINESS: 'Vệ sinh', STAFF: 'Nhân viên', SERVICE: 'Dịch vụ', LOCATION: 'Vị trí', PRICE: 'Giá cả', BREAKFAST: 'Bữa sáng', FOOD: 'Đồ ăn', FACILITIES: 'Tiện nghi', WIFI: 'Wifi', NOISE: 'Tiếng ồn', CHECKIN: 'Nhận phòng', CHECKOUT: 'Trả phòng', BOOKING: 'Đặt phòng', PAYMENT: 'Thanh toán', PARKING: 'Đỗ xe', SECURITY: 'An ninh', AIR_CONDITIONER: 'Điều hòa', BATHROOM: 'Phòng tắm', OTHER: 'Khác' };
const RUN_STATUS = { SUCCESS: 'Thành công', PARTIAL: 'Một phần', FAILED: 'Lỗi' };
let data = { reviews: [], runs: {} }, view = 'alerts', platform = '', page = 1, pageKey = '';
const PAGE_SIZE = 20; // cards drawn at once
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
try { view = localStorage.getItem('view') || view; platform = localStorage.getItem('platform') || ''; $('days').value = localStorage.getItem('days') || '14'; $('reply').value = localStorage.getItem('reply') || ''; } catch (e) {}
if (platform && !PLATFORMS[platform]) platform = '';

const needsAction = (r) => r.rating <= 3 || r.requires_attention || r.priority === 'urgent';
const isAlert = (r) => needsAction(r) && !r.handled_at; // "Đã xử lý" takes a review off the alerts list
let canModerate = false;
const setHandled = async (r, handled) => {
  try {
    const res = await fetch('/api/reviews/handled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, handled }) });
    const j = await res.json(); if (!res.ok) throw new Error(j.error);
    r.handled_at = handled ? new Date().toISOString() : null; render();
  } catch (e) { $('status').textContent = 'Không lưu được: ' + e.message; }
};
const bizName = (r) => (r.businesses && r.businesses.business_name) || '—';
const platOf = (r) => (PLATFORMS[r.platform] ? r.platform : 'google');

// One status card per platform: when it last ran and what it found.
function renderRuns() {
  const box = $('runs'); box.replaceChildren();
  for (const p of Object.keys(PLATFORMS)) {
    if (platform && platform !== p) continue;
    const run = data.runs[p];
    const c = el('div', 'run ' + p);
    const head = el('div', 'run-head');
    head.append(platformBadge(p), el('span', 'status ' + (run ? run.status : 'none'), run ? RUN_STATUS[run.status] || run.status : 'Chưa chạy'));
    c.append(head);
    if (run) {
      const s = run.summary || {};
      c.append(el('div', 'run-line', `${ago(run.completed_at || run.created_at)} · ${s.new_reviews || 0} mới / ${s.reviews_scanned || 0} đã quét · ${s.businesses_checked || 0} cơ sở`));
    } else c.append(el('div', 'run-line', 'Chưa có lượt chạy nào cho nền tảng này.'));
    box.append(c);
  }
}

function renderBanners() {
  const b = $('banner'); b.replaceChildren();
  for (const p of Object.keys(PLATFORMS)) {
    if (platform && platform !== p) continue;
    const errs = (data.runs[p] && data.runs[p].errors) || [];
    if (errs.some((e) => e.error_code === 'AUTH_REQUIRED')) b.append(el('div', 'banner', `${platformName(p)}: cần đăng nhập lại. Chạy "${PLATFORMS[p].login}" trong D:\\automation rồi đăng nhập thủ công.`));
    else if (errs.length) b.append(el('div', 'banner warn', `${platformName(p)}: lượt chạy gần nhất có lỗi\n` + errs.map((e) => `${e.error_code}: ${e.error_message}`).join('\n')));
  }
}

function card(r) {
  const c = el('article', 'card' + (r.priority === 'urgent' ? ' urgent' : r.priority === 'high' || r.rating <= 2 ? ' high' : ''));
  const head = el('div', 'head');
  const main = el('div', 'head-main');
  main.append(platformBadge(platOf(r)), el('span', 'biz', bizName(r)));
  head.append(main, starsEl(r.rating));
  const meta = el('div', 'card-meta');
  meta.append(el('span', '', `${r.reviewer_name || 'Ẩn danh'} · ${r.review_date_raw || r.review_date || ''}`), el('span', 'chip ' + (r.has_owner_reply ? 'ok' : 'warn'), r.has_owner_reply ? 'Đã phản hồi' : 'Chưa phản hồi'));
  c.append(head, meta, reviewBody(r));
  const ai = el('div', 'ai');
  ai.append(el('div', '', r.summary || ''));
  if (r.suggested_action) ai.append(el('div', 'meta', 'Đề xuất: ' + r.suggested_action));
  const chips = el('div', 'chips');
  chips.append(el('span', 'chip ' + r.priority, 'Ưu tiên: ' + (PRI[r.priority] || r.priority)));
  for (const k of r.category || []) chips.append(el('span', 'chip', CAT[k] || k));
  ai.append(chips); c.append(ai);
  if (needsAction(r)) {
    const actions = el('div', 'actions');
    if (r.handled_at) actions.append(el('span', 'chip ok', 'Đã xử lý'));
    if (canModerate) {
      const b = el('button', r.handled_at ? 'btn' : 'btn primary', r.handled_at ? 'Bỏ đánh dấu' : 'Đã xử lý'); b.type = 'button';
      b.addEventListener('click', () => { b.disabled = true; setHandled(r, !r.handled_at); });
      actions.append(b);
    }
    if (actions.children.length) c.append(actions);
  }
  return c;
}

function render() {
  renderRuns(); renderBanners();
  const run = Object.values(data.runs).filter(Boolean).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  $('status').textContent = run ? `Cập nhật lần cuối ${ago(run.completed_at || run.created_at)}. Dữ liệu tự làm mới mỗi phút.` : 'Chưa có lượt chạy nào.';

  const bizSel = $('biz'), cur = bizSel.value;
  const names = [...new Set(data.reviews.filter((r) => !platform || platOf(r) === platform).map(bizName))].sort();
  bizSel.replaceChildren(new Option('Tất cả doanh nghiệp', ''), ...names.map((n) => new Option(n, n)));
  bizSel.value = names.includes(cur) ? cur : '';

  const reply = $('reply').value; // '' | 'yes' | 'no'
  const base = data.reviews.filter((r) => (!bizSel.value || bizName(r) === bizSel.value) && (!reply || r.has_owner_reply === (reply === 'yes')));
  const rows = base.filter((r) => !platform || platOf(r) === platform);
  const alerts = rows.filter(isAlert);

  const countOf = (p) => base.filter((r) => !p || platOf(r) === p).length;
  segmented($('platforms'), [['', 'Tất cả', countOf('')], ...Object.keys(PLATFORMS).map((p) => [p, platformName(p), countOf(p), p])], platform, (v) => { platform = v; keep('platform', v); render(); });
  segmented($('views'), [['alerts', 'Cần xử lý', alerts.length], ['all', 'Tất cả', rows.length]], view, (v) => { view = v; keep('view', v); render(); });

  const stats = $('stats'); stats.replaceChildren();
  for (const [label, n, tone] of [['Cần xử lý', alerts.length, 'warn'], ['Khẩn cấp', rows.filter((r) => r.priority === 'urgent').length, 'danger'], ['Tiêu cực', rows.filter((r) => r.sentiment === 'negative').length, ''], ['Chưa phản hồi', rows.filter((r) => !r.has_owner_reply).length, ''], ['Tổng đánh giá', rows.length, '']]) {
    const k = el('div', 'kpi ' + (n ? tone : '')); k.append(el('b', '', n), el('span', '', label)); stats.append(k);
  }
  document.title = (alerts.length ? `(${alerts.length}) ` : '') + 'Cảnh báo đánh giá';

  const list = $('list'); list.replaceChildren();
  const all = view === 'alerts' ? alerts : rows;
  const key = [view, platform, bizSel.value, reply, $('days').value].join('|');
  if (key !== pageKey) { pageKey = key; page = 1; } // a new filter starts on page 1; the 60 s refresh keeps the page
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  page = Math.min(page, pages);
  pager($('pager'), page, pages, (to) => { page = to; render(); window.scrollTo(0, $('list').offsetTop - 80); });
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (!shown.length) return list.append(el('div', 'empty-state', view === 'alerts' ? 'Không có đánh giá nào cần xử lý.' : 'Chưa có đánh giá.'));
  if (platform) return shown.forEach((r) => list.append(card(r)));
  for (const p of Object.keys(PLATFORMS)) { // all platforms: one clearly labelled section each
    const part = shown.filter((r) => platOf(r) === p);
    if (!part.length) continue;
    const h = el('div', 'section');
    const t = el('h2'); t.append(platformBadge(p), el('span', 'count', `${all.filter((r) => platOf(r) === p).length} đánh giá`));
    h.append(t); list.append(h);
    part.forEach((r) => list.append(card(r)));
  }
}

async function load() {
  try {
    const res = await fetch('/api/data?days=' + $('days').value);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);
    data = j; render();
  } catch (e) { $('status').textContent = 'Không tải được dữ liệu: ' + e.message; }
}
$('days').addEventListener('change', () => { keep('days', $('days').value); load(); });
$('biz').addEventListener('change', render);
$('reply').addEventListener('change', () => { keep('reply', $('reply').value); render(); });
$('refresh').addEventListener('click', load);
whoAmI.then((me) => { canModerate = me.role === 'moderator'; $('role').textContent = canModerate ? '' : 'Chế độ chỉ xem'; if (data.reviews.length) render(); });
$('list').append(el('div', 'skeleton'));
load(); setInterval(load, 60000);
