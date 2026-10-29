// Shared .env loader (single source of configuration for dashboard, collector tooling and scripts).
const fs = require('fs');
const path = require('path');

module.exports = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
