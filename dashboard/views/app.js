const PRI = { urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
const CAT = { ROOM: 'Phòng', CLEANLINESS: 'Vệ sinh', STAFF: 'Nhân viên', SERVICE: 'Dịch vụ', LOCATION: 'Vị trí', PRICE: 'Giá cả', BREAKFAST: 'Bữa sáng', FOOD: 'Đồ ăn', FACILITIES: 'Tiện nghi', WIFI: 'Wifi', NOISE: 'Tiếng ồn', CHECKIN: 'Nhận phòng', CHECKOUT: 'Trả phòng', BOOKING: 'Đặt phòng', PAYMENT: 'Thanh toán', PARKING: 'Đỗ xe', SECURITY: 'An ninh', AIR_CONDITIONER: 'Điều hòa', BATHROOM: 'Phòng tắm', OTHER: 'Khác' };
const VIEWS = [['alerts', 'Cần xử lý'], ['all', 'Tất cả']];
let data = { reviews: [], runs: {} }, view = 'alerts', platform = '';
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
try { view = localStorage.getItem('view') || view; platform = localStorage.getItem('platform') || ''; $('days').value = localStorage.getItem('days') || '14'; $('reply').value = localStorage.getItem('reply') || ''; } catch (e) {}
if (platform && !PLATFORMS[platform]) platform = '';

const isAlert = (r) => r.rating <= 2 || r.requires_attention || r.priority === 'urgent';
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
    head.append(platformBadge(p), el('span', 'status ' + (run ? run.status : 'none'), run ? run.status : 'Chưa chạy'));
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
  meta.append(el('span', '', `${r.reviewer_name || 'Ẩn danh'} · ${r.review_date_raw || r.review_date || ''}`), withIcon(el('span', 'chip ' + (r.has_owner_reply ? 'ok' : 'warn'), r.has_owner_reply ? 'Đã phản hồi' : 'Chưa phản hồi'), r.has_owner_reply ? 'circle-check' : 'clock'));
  c.append(head, meta, reviewBody(r));
  const ai = el('div', 'ai');
  ai.append(el('div', '', r.summary || ''));
  if (r.suggested_action) ai.append(el('div', 'meta', 'Đề xuất: ' + r.suggested_action));
  const chips = el('div', 'chips');
  chips.append(el('span', 'chip ' + r.priority, 'Ưu tiên: ' + (PRI[r.priority] || r.priority)));
  for (const k of r.category || []) chips.append(el('span', 'chip', CAT[k] || k));
  ai.append(chips); c.append(ai);
  return c;
}

// Charts (Chart.js, self-hosted). Colours come from the CSS tokens so the palette lives in one place.
const charts = {};
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isoDay = (d) => d.toISOString().slice(0, 10);

function drawChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), config);
}

function renderCharts(rows) {
  if (typeof Chart === 'undefined') { $('charts').hidden = true; return; } // library failed to load: the rest of the page still works
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = token('--muted');
  Chart.defaults.animation = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 };
  const plats = Object.keys(PLATFORMS).filter((p) => rows.some((r) => platOf(r) === p));
  const colour = { google: token('--google'), tripadvisor: token('--ta') };
  const legend = { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } };

  const days = Number($('days').value) || 14;
  const labels = Array.from({ length: days }, (_, i) => isoDay(new Date(Date.now() - (days - 1 - i) * 864e5)));
  const perDay = (p) => labels.map((d) => rows.filter((r) => platOf(r) === p && r.review_date === d).length);
  const dated = rows.filter((r) => labels.includes(r.review_date)).length;
  $('trend').setAttribute('aria-label', `Đánh giá theo ngày trong ${days} ngày qua: ${dated} đánh giá có ngày xác định.`);
  drawChart('trend', {
    type: 'bar',
    data: { labels: labels.map((d) => d.slice(8) + '/' + d.slice(5, 7)), datasets: plats.map((p) => ({ label: platformName(p), data: perDay(p), backgroundColor: colour[p], borderRadius: 3, maxBarThickness: 22 })) },
    options: { maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: token('--line') } } }, plugins: { legend } },
  });

  const stars = [5, 4, 3, 2, 1];
  const perStar = (p) => stars.map((n) => rows.filter((r) => platOf(r) === p && r.rating === n).length);
  $('ratings').setAttribute('aria-label', 'Phân bố số sao: ' + stars.map((n) => `${n} sao ${rows.filter((r) => r.rating === n).length}`).join(', ') + '.');
  drawChart('ratings', {
    type: 'bar',
    data: { labels: stars.map((n) => n + ' ★'), datasets: plats.map((p) => ({ label: platformName(p), data: perStar(p), backgroundColor: colour[p], borderRadius: 3, maxBarThickness: 18 })) },
    options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: token('--line') } }, y: { stacked: true, grid: { display: false } } }, plugins: { legend } },
  });
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
  segmented($('views'), VIEWS, view, (v) => { view = v; keep('view', v); render(); });

  const stats = $('stats'); stats.replaceChildren();
  for (const [label, n, tone, ico] of [['Cần xử lý', alerts.length, 'warn', 'bell'], ['Khẩn cấp', rows.filter((r) => r.priority === 'urgent').length, 'danger', 'triangle-alert'], ['Tiêu cực', rows.filter((r) => r.sentiment === 'negative').length, '', 'ban'], ['Chưa phản hồi', rows.filter((r) => !r.has_owner_reply).length, '', 'clock'], ['Tổng đánh giá', rows.length, '', 'message-square']]) {
    const k = el('div', 'kpi ' + (n ? tone : '')); k.append(icon(ico), el('b', '', n), el('span', '', label)); stats.append(k);
  }
  document.title = (alerts.length ? `(${alerts.length}) ` : '') + 'Cảnh báo đánh giá';
  renderCharts(rows);

  const list = $('list'); list.replaceChildren();
  const shown = view === 'alerts' ? alerts : rows;
  if (!shown.length) return list.append(el('div', 'empty-state', view === 'alerts' ? 'Không có đánh giá nào cần xử lý.' : 'Chưa có đánh giá.'));
  if (platform) return shown.forEach((r) => list.append(card(r)));
  for (const p of Object.keys(PLATFORMS)) { // all platforms: one clearly labelled section each
    const part = shown.filter((r) => platOf(r) === p);
    if (!part.length) continue;
    const h = el('div', 'section');
    const t = el('h2'); t.append(platformBadge(p), el('span', 'count', `${part.length} đánh giá`));
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
whoAmI.then((me) => { $('role').textContent = me.role === 'moderator' ? '' : 'Chế độ chỉ xem'; });
$('list').append(el('div', 'skeleton'));
load(); setInterval(load, 60000);
