// Reads ../.env and registers the Supabase and Gemini API keys as n8n header-auth credentials. Prints no secrets.
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('../config/env');
const { execSync } = require('child_process');

for (const k of ['SUPABASE_KEY', 'GEMINI_API_KEY']) if (!env[k]) { console.error(`Missing ${k} in .env`); process.exit(1); }

const file = path.join(os.tmpdir(), `n8n-cred-${process.pid}.json`);
fs.writeFileSync(file, JSON.stringify([
  { id: 'supabaseKey', name: 'Supabase API Key', type: 'httpHeaderAuth', data: { name: 'apikey', value: env.SUPABASE_KEY } },
  { id: 'geminiKey', name: 'Gemini API Key', type: 'httpHeaderAuth', data: { name: 'x-goog-api-key', value: env.GEMINI_API_KEY } },
]));
try { execSync(`n8n import:credentials --input="${file}"`, { stdio: 'pipe' }); } finally { fs.unlinkSync(file); }
console.log('n8n credentials imported: Supabase API Key, Gemini API Key');
