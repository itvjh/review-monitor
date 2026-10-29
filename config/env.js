// Shared .env loader (single source of configuration for dashboard, collector tooling and scripts).
// Node's own parser handles quotes and comments; a variable already set in the system wins over the file.
const path = require('path');

const file = path.join(__dirname, '..', '.env');
try { process.loadEnvFile(file); } catch (e) {
  if (e.code === 'ENOENT') throw new Error(`Thiếu file ${file}. Sao chép .env.example thành .env rồi điền khóa.`);
  throw e;
}

module.exports = process.env;
