// Error with an HTTP status the view layer can turn into a response (400 bad input, 404, 409 conflict, 503 setup missing...).
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

module.exports = { HttpError };
