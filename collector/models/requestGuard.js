// Who may talk to the collector? Only local programs that mean to: n8n and the dashboard. It must never obey a web page.
// A page you visit can send a "simple" cross-site POST (text/plain, no preflight) to 127.0.0.1, and a rebinding DNS name can reach it
// as well. Real clients send neither an Origin header nor a foreign Host, so both are refused, and writes must be declared JSON.
const HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

// -> null when the request is fine, else { code, message }.
exports.check = (req) => {
  if (!HOST.test(req.headers.host || '')) return { code: 403, message: 'Host không hợp lệ.' };
  if (req.headers.origin) return { code: 403, message: 'Yêu cầu từ trang web bị từ chối.' };
  if (req.method === 'POST' && !/^application\/json/i.test(req.headers['content-type'] || '')) return { code: 415, message: 'Cần Content-Type: application/json.' };
  return null;
};

exports.MAX_BODY = 1_000_000; // the biggest legitimate body is the list of known review hashes (about 330 KB)
exports.BODY_MS = 15000;
