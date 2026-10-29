const view = require('../views/render');

// Static view files; the file name is hard-wired per route.
exports.file = (name) => (req, res) => view.file(res, name, req);
exports.vendor = (rel, type) => (req, res) => view.vendor(res, rel, type, req);
