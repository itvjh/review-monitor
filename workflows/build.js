// Generates an n8n workflow from readable sources (one per platform; same nodes, different collector routes and schedule):
//   prompts/*.txt  AI prompt        code/*.js  Code-node bodies (unit-tested in tests/)
// Usage: node workflows/build.js [outFile] [google|tripadvisor]     then: n8n import:workflow --input=<outFile>
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const read = (dir, file) => fs.readFileSync(path.join(__dirname, dir, file), 'utf8').trim();
const codeFile = (name, mode) => ({ jsCode: read('code', `${name}.js`), ...(mode ? { mode } : {}) });
const REGISTRY = require('../config/platforms');
const PLATFORMS = Object.fromEntries(Object.entries(REGISTRY).map(([id, p]) => [id, p.workflow]));
const PLATFORM = process.argv[3] || 'google';
const P = PLATFORMS[PLATFORM];
if (!P) throw new Error('unknown platform ' + PLATFORM);
const OUT = process.argv[2] || path.join(__dirname, P.file);

// ---------- helpers ----------
const CFG = "$('Config').first().json";
const RL = "$('Review Loop').item.json";
const SB = { httpHeaderAuth: { id: 'supabaseKey', name: 'Supabase API Key' } };
const GEM = { httpHeaderAuth: { id: 'geminiKey', name: 'Gemini API Key' } };
const headerAuth = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' };
const prefer = (v) => ({ sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: v }] } });
const sbUrl = (p) => `={{ ${CFG}.supabaseUrl }}/rest/v1/${p}`;
const cont = { onError: 'continueRegularOutput' };
const retry = { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, ...cont };
const set = (name, value, type = 'string') => ({ id: name, name, value, type });
const ifBool = (expr) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: 'c1', leftValue: `={{ ${expr} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and',
  },
  options: {},
});

const nodes = [];
const node = (name, type, typeVersion, parameters, extra = {}) => {
  nodes.push({ id: name.toLowerCase().replace(/\W+/g, '-'), name, type: `n8n-nodes-base.${type}`, typeVersion, position: [0, 0], parameters, ...extra });
};

// ---------- 1. triggers + config ----------
node('Schedule Daily', 'scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: P.cron }] } }); // once a day (workflow timezone below); Google 09:00, Tripadvisor 09:30 so the two never fight over the browser profile
node('Manual Run', 'manualTrigger', 1, {});
node('Config', 'set', 3.4, {
  assignments: {
    assignments: [
      set('collectorUrl', 'http://127.0.0.1:3010'),
      set('supabaseUrl', env.SUPABASE_URL),
      set('platform', PLATFORM),
      set('reviewsPerRun', P.perRun, 'number'), // ${P.perRunNote}
      set('stopAfterKnown', 10, 'number'),
      set('geminiModel', 'gemini-3.5-flash-lite'),
      set('aiDelaySeconds', 5, 'number'), // free tier allows 15 requests/min
      set('systemPrompt', `${read('prompts', 'review-analysis.txt')}

REPLY RULES (for reply_draft)
${fs.readFileSync(path.join(__dirname, '..', 'config', 'prompts', 'reply-rules.txt'), 'utf8').trim()}`),
      set('startedAt', '={{ $now.toISO() }}'),
    ],
  },
  options: {},
});

// ---------- 2. collect (collector service + businesses table) ----------
node('Browser: Get Businesses', 'httpRequest', 4.2, { url: `={{ $json.collectorUrl }}${P.businesses}`, options: { timeout: 300000 } }, retry);
node('Auth Check', 'if', 2.2, ifBool("$json.status === 'OK' && Array.isArray($json.businesses) && $json.businesses.length > 0"));
node('Auth Summary', 'code', 2, codeFile('auth-summary'));
node('Split Businesses', 'code', 2, codeFile('prepare-businesses'));
node('Business Loop', 'splitInBatches', 3, { batchSize: 1, options: {} });
node('Business Ready?', 'if', 2.2, ifBool("Boolean($json.id) && $('Business Loop').item.json.business_limit > 0"));
node('Known Review IDs', 'code', 2, codeFile('known-review-ids'));
node('Known Ready?', 'if', 2.2, ifBool('!$json.error'));
node('Business Result', 'code', 2, codeFile('business-result'));
node('Upsert Business', 'httpRequest', 4.2, {
  method: 'POST',
  url: sbUrl('businesses?on_conflict=platform,external_business_id'),
  ...headerAuth,
  ...prefer('resolution=merge-duplicates,return=representation'),
  sendBody: true,
  specifyBody: 'json',
  jsonBody: `={{ { platform: ${CFG}.platform, external_business_id: $json.business_identifier, business_name: $json.business_name, address: $json.address || null, profile_url: $json.business_profile_url || null, active: true, updated_at: $now.toISO() } }}`,
  options: {},
}, { credentials: SB, ...retry });
node('Get Known Hashes', 'httpRequest', 4.2, {
  url: sbUrl(`reviews?select=review_hash&platform=eq.${PLATFORM}&business_id=eq.{{ $json.id }}&order=collected_at.desc&limit=10000`),
  ...headerAuth,
  options: {},
}, { credentials: SB, alwaysOutputData: true, ...retry });
node('Browser: Read Reviews', 'httpRequest', 4.2, {
  method: 'POST',
  url: `={{ ${CFG}.collectorUrl }}${P.reviews}`,
  sendBody: true,
  specifyBody: 'json',
  jsonBody: `={{ { businesses: [$('Business Loop').item.json], limit: $('Business Loop').item.json.business_limit, stopAfterKnown: ${CFG}.stopAfterKnown, known: $json.known } }}`,
  options: { timeout: 900000 },
}, retry);
node('Flatten Reviews', 'code', 2, codeFile('flatten-reviews'), { alwaysOutputData: true });

// ---------- 3. per-review loop: dedupe -> AI -> validate -> save ----------
node('Review Loop', 'splitInBatches', 3, { batchSize: 1, options: {} });
node('Check Existing', 'httpRequest', 4.2, {
  url: `={{ ${CFG}.supabaseUrl }}/rest/v1/reviews?select=id&limit=1&review_hash=eq.{{ $json.review_hash }}`,
  ...headerAuth,
  options: {},
}, { credentials: SB, alwaysOutputData: true, ...retry });
node('Is New?', 'if', 2.2, ifBool(`!$json.id && !$json.error && !${RL}._sentinel`));
node('AI Pace', 'wait', 1.1, { amount: `={{ ${CFG}.aiDelaySeconds }}`, unit: 'seconds' });
node('AI Analysis', 'httpRequest', 4.2, {
  method: 'POST',
  url: `=https://generativelanguage.googleapis.com/v1beta/models/{{ ${CFG}.geminiModel }}:generateContent`,
  ...headerAuth,
  sendBody: true,
  specifyBody: 'json',
  jsonBody: `={{ { systemInstruction: { parts: [{ text: ${CFG}.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: 'Business:\\n' + ${RL}.business_name + '\\n\\nRating:\\n' + ${RL}.rating + '/5\\n\\nReviewer:\\n' + ${RL}.reviewer_name + '\\n\\nReview:\\n' + (${RL}.review_text || '(no text)') + '\\n\\nExisting owner response:\\n' + (${RL}.owner_reply || '(none)') + '\\n\\nReturn according to the required JSON schema.' }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } } }}`,
  options: { timeout: 60000 },
}, { credentials: GEM, ...retry });
node('Validate AI', 'code', 2, codeFile('validate-ai', 'runOnceForEachItem'));
node('AI OK?', 'if', 2.2, ifBool('$json.ai_ok === true'));
node('Save Review', 'httpRequest', 4.2, {
  method: 'POST',
  url: sbUrl('reviews?on_conflict=review_hash'),
  ...headerAuth,
  ...prefer('resolution=ignore-duplicates,return=representation'),
  sendBody: true,
  specifyBody: 'json',
  jsonBody: "={{ { platform: $json.platform, business_id: $json.business_id, review_hash: $json.review_hash, external_review_id: $json.review_id || null, reviewer_name: $json.reviewer_name, rating: $json.rating, review_text: $json.review_text || '', review_date: $json.review_date || null, review_date_raw: $json.review_date_text || null, owner_reply: $json.owner_reply || null, has_owner_reply: !!$json.has_owner_reply, sentiment: $json.sentiment, sentiment_score: $json.sentiment_score, category: $json.category, priority: $json.priority, requires_attention: $json.requires_attention, summary: $json.summary, suggested_action: $json.suggested_action, language: $json.language, ai_confidence: $json.ai_confidence, reply_draft: $json.reply_draft || null, reply_status: ($json.reply_draft && !$json.has_owner_reply) ? 'pending' : null, raw_data: { source_locator: $json.source_locator || null, reply_allowed: $json.reply_allowed === undefined ? null : $json.reply_allowed, key_points: $json.key_points, source_score: $json.raw_score === undefined ? null : $json.raw_score }, collected_at: $json.collected_at, analyzed_at: $json.analyzed_at } }}",
  options: {},
}, { credentials: SB, alwaysOutputData: true, ...retry });

// ---------- 4. report ----------
node('Run Summary', 'code', 2, codeFile('run-summary'));
node('Save Run', 'httpRequest', 4.2, {
  method: 'POST',
  url: sbUrl('automation_runs'),
  ...headerAuth,
  ...prefer('return=minimal'),
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ { status: $json.status, summary: $json.summary, errors: $json.errors, started_at: $json.summary.started_at, completed_at: $json.summary.completed_at } }}',
  options: {},
}, { credentials: SB, ...retry });

// ---------- wiring: [from, to, outputIndex] ----------
const links = [
  ['Schedule Daily', 'Config'], ['Manual Run', 'Config'],
  ['Config', 'Browser: Get Businesses'],
  ['Browser: Get Businesses', 'Auth Check'],
  ['Auth Check', 'Split Businesses', 0], ['Auth Check', 'Auth Summary', 1],
  ['Auth Summary', 'Save Run'],
  ['Split Businesses', 'Business Loop'],
  ['Business Loop', 'Flatten Reviews', 0], ['Business Loop', 'Upsert Business', 1],
  ['Upsert Business', 'Business Ready?'],
  ['Business Ready?', 'Get Known Hashes', 0], ['Business Ready?', 'Business Result', 1],
  ['Get Known Hashes', 'Known Review IDs'], ['Known Review IDs', 'Known Ready?'],
  ['Known Ready?', 'Browser: Read Reviews', 0], ['Known Ready?', 'Business Result', 1],
  ['Browser: Read Reviews', 'Business Result'],
  ['Business Result', 'Business Loop'],
  ['Flatten Reviews', 'Review Loop'],
  ['Review Loop', 'Run Summary', 0], ['Review Loop', 'Check Existing', 1],
  ['Check Existing', 'Is New?'],
  ['Is New?', 'AI Pace', 0], ['AI Pace', 'AI Analysis'], ['Is New?', 'Review Loop', 1],
  ['AI Analysis', 'Validate AI'],
  ['Validate AI', 'AI OK?'],
  ['AI OK?', 'Save Review', 0], ['AI OK?', 'Review Loop', 1],
  ['Save Review', 'Review Loop'],
  ['Run Summary', 'Save Run'],
];
const connections = {};
for (const [from, to, out = 0] of links) {
  const c = (connections[from] ||= { main: [] });
  (c.main[out] ||= []).push({ node: to, type: 'main', index: 0 });
}
for (const c of Object.values(connections)) for (let i = 0; i < c.main.length; i++) c.main[i] ||= [];

nodes.forEach((n, i) => (n.position = [200 + (i % 12) * 240, 200 + Math.floor(i / 12) * 260])); // two rows

const wf = { id: P.id, name: P.name, nodes, connections, settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh' }, active: false };
fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log(`${nodes.length} nodes -> ${path.relative(process.cwd(), OUT)}`);
