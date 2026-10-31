const Directory = require('../models/businessDirectory');
const { serial, run } = require('../models/browser');
const view = require('../views/json');
const DISCOVER = {
  google: require('../models/businessModel').list,
  tripadvisor: require('../models/tripadvisorModel').listBusinesses,
  agoda: require('../models/agodaModel').listBusinesses,
  traveloka: require('../models/travelokaModel').listBusinesses,
};
exports.index = (req, res) => view.ok(res, { sources: Directory.snapshot() });
exports.refresh = async (req, res, body) => {
  let input;
  try { input = JSON.parse(body); } catch { return view.badRequest(res, 'invalid JSON'); }
  if (!input || !Object.hasOwn(DISCOVER, input.platform)) return view.badRequest(res, 'invalid platform');
  view.ok(res, { businesses: await Directory.get(input.platform, () => serial(() => run(DISCOVER[input.platform])), true) });
};
