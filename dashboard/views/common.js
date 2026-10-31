// Helpers shared by every dashboard page (loaded before the page's own script).
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// { role: 'moderator' (the owner's machine) | 'viewer' (read-only), posting: 'off' | 'dry-run' | 'live' }. The server enforces it; this only hides buttons.
const whoAmI = fetch('/api/me').then((r) => r.json()).catch(() => ({ role: 'viewer', posting: 'off' }));

// PLATFORMS (name, colour, login command, owner page, autoReply) comes from /platforms.js, i.e. from config/platforms.js.
const platformName = (p) => (PLATFORMS[p] ? PLATFORMS[p].name : p || 'Google');
const platformBadge = (p) => el('span', 'badge ' + (PLATFORMS[p] ? p : 'google'), platformName(p));

// Platform / status switchers share one pattern: buttons with aria-pressed. items = [[value, label, count, dotPlatform?]]
function segmented(container, items, current, onPick) {
  container.replaceChildren();
  for (const [value, label, count, dot] of items) {
    const b = el('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(value === current));
    if (dot) b.append(el('span', 'dot ' + dot));
    b.append(label);
    if (count !== undefined) b.append(el('span', 'count', count));
    b.addEventListener('click', () => onPick(value));
    container.append(b);
  }
}

// Five stars as one labelled element (screen readers get "4 trên 5 sao" instead of glyphs).
function starsEl(n) {
  const s = el('span', 'stars');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', `${n} trên 5 sao`);
  s.append('★'.repeat(n));
  s.append(el('span', 'off', '★'.repeat(5 - n)));
  return s;
}

// "30 giây" or "5 phút": the gap between automatic posts.
const gapText = (s) => (s % 60 ? s + ' giây' : s / 60 + ' phút');
const ago = (iso) => { if (!iso) return '—'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : m < 1440 ? Math.round(m / 60) + ' giờ trước' : Math.round(m / 1440) + ' ngày trước'; };

// The review text as separate rows: the original and Google's automatic translation are never mixed in one block.
// Everything is set with textContent: review text is untrusted.
function reviewBody(r) {
  const box = el('div', 'review-text');
  const row = (label, text) => {
    const d = el('div', 'text');
    if (label) d.append(el('span', 'text-label', label));
    d.append(el('div', 'text-body', text));
    box.append(d);
  };
  if (r.text_parts) {
    if (r.text_parts.original) row('Bản gốc', r.text_parts.original);
    if (r.text_parts.translated) row('Bản dịch tự động của Google', r.text_parts.translated);
  } else if (r.review_text) row('', r.review_text);
  else box.append(el('div', 'text empty', 'Khách chỉ để lại xếp hạng, không có nội dung.'));
  return box;
}


// Native <dialog> instead of window.confirm: styled, focus-trapped by the browser, Escape cancels.
function confirmDialog(message, okLabel) {
  return new Promise((resolve) => {
    const d = el('dialog', 'dialog');
    d.setAttribute('aria-label', 'Xác nhận');
    const ok = el('button', 'btn primary', okLabel || 'Đồng ý');
    const no = el('button', 'btn', 'Hủy');
    ok.type = no.type = 'button';
    const row = el('div', 'actions'); row.append(no, ok);
    d.append(el('p', 'dialog-text', message), row);
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    ok.addEventListener('click', () => done(true));
    no.addEventListener('click', () => done(false));
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    document.body.append(d);
    d.showModal();
    no.focus();
  });
}
