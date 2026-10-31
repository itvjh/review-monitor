const { normalize } = require('../models/businessDirectory');
const int = (v, def, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : def;
exports.parse = (body, defaultLimit = 5, maxLimit = 500) => {
  const input = JSON.parse(body || '{}');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('body must be an object');
  if (input.known !== undefined && !(Array.isArray(input.known) && input.known.length <= 10000 && input.known.every((h) => typeof h === 'string'))) throw new Error('known must be an array of at most 10000 strings');
  let businesses;
  if (input.businesses !== undefined) {
    if (!Array.isArray(input.businesses) || input.businesses.length !== 1) throw new Error('businesses must contain exactly one property');
    businesses = normalize(input.businesses).map((b) => ({ business_identifier: b.business_identifier, business_name: String(b.business_name || b.business_identifier).slice(0, 300), address: String(b.address || '').slice(0, 500) }));
  }
  return { limit: int(input.limit, defaultLimit, 1, maxLimit), stopAfterKnown: int(input.stopAfterKnown, 10, 1, 100), known: input.known || [], businesses };
};
