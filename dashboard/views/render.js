// View layer: everything that writes to the HTTP response. Controllers never touch res.writeHead directly.
const fs = require('fs');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// JSON over 1 KB is gzipped when the browser accepts it (the review list is 60+ KB; LAN and Wi-Fi viewers feel that).
exports.json = (res, code, body) => {
  const text = JSON.stringify(body);
  const gz = text.length > 1024 && Boolean(res.req) && String(res.req.headers['accept-encoding'] || '').includes('gzip');
  res.writeHead(code, gz ? { 'content-type': 'application/json', 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : { 'content-type': 'application/json' });
  res.end(gz ? require('zlib').gzipSync(text) : text);
};

// Static files. Each file is read once and kept in memory (plus a gzip copy), refreshed when its mtime changes; browsers revalidate with
// the ETag (304 = no body). The path is hard-wired per route, never taken from the request.
const zlib = require('zlib');
const cached = new Map();
const load = (abs) => {
  const m = fs.statSync(abs).mtimeMs;
  let c = cached.get(abs);
  if (!c || c.mtime !== m) {
    const body = fs.readFileSync(abs);
    c = { mtime: m, body, gzip: zlib.gzipSync(body, { level: 9 }), etag: '"' + body.length.toString(16) + '-' + Math.round(m).toString(16) + '"' };
    cached.set(abs, c);
  }
  return c;
};

const serve = (req, res, abs, type, cacheControl) => {
  const c = load(abs);
  const headers = { 'content-type': type, etag: c.etag, 'cache-control': cacheControl, vary: 'Accept-Encoding' };
  if (req && req.headers['if-none-match'] === c.etag) { res.writeHead(304, headers); return res.end(); }
  const gz = req && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, gz ? { ...headers, 'content-encoding': 'gzip' } : headers);
  res.end(gz ? c.gzip : c.body);
};

// A file that lives in views/. Always revalidated, so an edited page shows up at once.
exports.file = (res, name, req) => serve(req, res, path.join(__dirname, name), TYPES[path.extname(name)], 'no-cache');

// Third-party browser assets from node_modules (self-hosted: works offline and for LAN viewers). Cached for a day.
exports.vendor = (res, rel, type, req) => serve(req, res, path.join(__dirname, '..', '..', 'node_modules', rel), type, 'public, max-age=86400');

// Errors carrying an HTTP status (HttpError) keep it; anything else is an upstream failure (502).
exports.error = (res, e) => exports.json(res, e.status || 502, { error: e.message });
exports.notFound = (res) => exports.json(res, 404, { error: 'not found' });
