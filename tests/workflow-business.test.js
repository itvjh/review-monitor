const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const Fn = Object.getPrototypeOf(async function(){}).constructor;
const run = (name, $, rows) => new Fn('$','$input', fs.readFileSync(path.join(__dirname,'../workflows/code',name+'.js'),'utf8'))($,{first:()=>({json:rows[0]}),all:()=>rows.map(json=>({json}))});
test('property jobs sort numeric IDs and keep Google total review budget', async()=>{
  const out=await run('prepare-businesses',()=>({first:()=>({json:{platform:'google',reviewsPerRun:5}})}),[{businesses:[{business_identifier:'900000'},{business_identifier:'100000'},{business_identifier:'300000'}]}]);
  assert.deepEqual(out.map(r=>r.json.business_identifier),['100000','300000','900000']);
  assert.deepEqual(out.map(r=>r.json.business_limit),[2,2,1]);
});
test('many known review IDs collapse to one browser request and preserve query errors',async()=>{
  const out=await run('known-review-ids',null,[{review_hash:'a'},{review_hash:'b'}]);
  assert.equal(out.length,1);assert.deepEqual(out[0].json.known,['a','b']);
  assert.ok((await run('known-review-ids',null,[{error:{message:'failed'}}]))[0].json.error);
});
test('property-loop results join reviews to the right database IDs without cross-property mixing',async()=>{
  const batches=[{business:{business_identifier:'900000',business_name:'B'},upsert:{id:'uuid-b',external_business_id:'900000'},response:{status:'OK',scanned:1,reviews:[{business_identifier:'900000',review_id:'3',review_hash:'b'}]}},{business:{business_identifier:'100000',business_name:'A'},upsert:{id:'uuid-a',external_business_id:'100000'},response:{status:'OK',scanned:2,reviews:[{business_identifier:'100000',review_id:'10',review_hash:'a10'},{business_identifier:'100000',review_id:'2',review_hash:'a2'}]}}];
  const out=await run('flatten-reviews',()=>assert.fail('must use embedded property IDs'),batches);
  assert.deepEqual(out.map(r=>[r.json.business_id,r.json.review_id]),[['uuid-a','2'],['uuid-a','10'],['uuid-b','3']]);
  assert.equal(out[0].json._stats.businesses,2);assert.equal(out[0].json._stats.scanned,3);
});
