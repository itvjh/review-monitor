// View layer: the only place that writes HTTP responses. Domain failures are HTTP 200 with a status the workflow can branch on.
const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

exports.ok = (res, body) => send(res, 200, { status: 'OK', ...body });
exports.health = (res, busy = 0) => send(res, 200, { status: 'ok', busy });
exports.refuse = (res, code, message) => send(res, code, { status: 'ERROR', error_code: 'UNKNOWN_ERROR', error_message: message });
exports.badRequest = (res, message) => send(res, 400, { status: 'ERROR', error_code: 'UNKNOWN_ERROR', error_message: message });
exports.notFound = (res) => send(res, 404, { status: 'ERROR', error_code: 'UNKNOWN_ERROR', error_message: 'not found' });
exports.fail = (res, e) => send(res, 200, {
  status: e.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'ERROR',
  error_code: e.code,
  error_message: e.message,
  screenshot: e.screenshot || null,
});
