// Local alert dashboard: http://127.0.0.1:3020. Bootstrap only; see routes.js.
const http = require('http');
const { handle } = require('./routes');
const env = require('../config/env');
const access = require('./models/access');
const queue = require('./models/queue');

const PORT = Number(process.env.PORT || 3020);
// DASHBOARD_HOST=0.0.0.0 in .env shares the page with the local network (read-only for everyone but this machine).
const HOST = env.DASHBOARD_HOST || '127.0.0.1';
http.createServer(handle).listen(PORT, HOST, () => {
  console.log(`dashboard on http://127.0.0.1:${PORT}`);
  if (HOST !== '127.0.0.1') for (const u of access.lanUrls(PORT)) console.log(`share with colleagues (view only): ${u}`);
  queue.start(); // posts approved replies one by one (only when REPLY_POSTING=live)
});
