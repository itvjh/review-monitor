// Error codes shared with the n8n workflow: AUTH_REQUIRED, SELECTOR_CHANGED, BROWSER_TIMEOUT, NETWORK_ERROR, UNKNOWN_ERROR.
class CodedError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// Playwright messages carry terminal colour codes and a multi-line "Call log": keep the first line, plain text.
const ESC = String.fromCharCode(27);
const clean = (m) => String(m || '').split(ESC + '[').map((x, i) => (i ? x.replace(/^[0-9;]*m/, '') : x)).join('').split('\nCall log')[0].trim();

function classify(e) {
  if (e instanceof CodedError) return e;
  if (e.name === 'TimeoutError') return new CodedError('BROWSER_TIMEOUT', clean(e.message));
  if (/net::|ERR_/.test(e.message)) return new CodedError('NETWORK_ERROR', e.message);
  return new CodedError('UNKNOWN_ERROR', clean(e.message));
}

module.exports = { CodedError, classify, clean };
