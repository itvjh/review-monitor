// Persist source property IDs between runs. A refresh is explicit; routine crawls never enumerate owners twice.
const fs = require('fs');
const path = require('path');
const { CodedError } = require('./errors');
const FILE = path.join(__dirname, '../business-ids.json');
const compareIds = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
function normalize(items) {
  if (!Array.isArray(items) || !items.length) throw new CodedError('BUSINESS_NOT_FOUND', 'Không có ID cơ sở. Hãy đồng bộ lại danh sách cơ sở.');
  const unique = new Map();
  for (const b of items) {
    const id = String(b.business_identifier || '');
    if (!/^\d{6,}$/.test(id)) throw new CodedError('BUSINESS_NOT_FOUND', 'ID cơ sở không hợp lệ.');
    unique.set(id, { ...b, business_identifier: id });
  }
  return [...unique.values()].sort((a, b) => compareIds(a.business_identifier, b.business_identifier));
}
function createDirectory(file = FILE) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  return {
    snapshot: () => read(),
    async get(platform, discover, refresh = false) {
      const hit = read()[platform];
      if (!refresh && hit?.businesses?.length) return normalize(hit.businesses);
      const businesses = normalize(await discover());
      const state = read(); state[platform] = { updated_at: new Date().toISOString(), businesses };
      fs.writeFileSync(file + '.tmp', JSON.stringify(state)); fs.renameSync(file + '.tmp', file);
      return businesses;
    },
  };
}
module.exports = { ...createDirectory(), createDirectory, normalize, compareIds };
