const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createDirectory, normalize } = require('../collector/models/businessDirectory');
const { pageHint, seek } = require('../collector/models/reviewLocator');
const { parse } = require('../collector/controllers/readOptions');
test('property directory persists IDs and enumerates only on explicit refresh', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'property-ids-'));
  try {
    const store = createDirectory(path.join(dir, 'ids.json')); let count = 0;
    const discover = async () => { count++; return [{business_identifier:'900000',business_name:'B'}, {business_identifier:'100000',business_name:'A'}]; };
    assert.deepEqual((await store.get('google', discover)).map(b=>b.business_identifier), ['100000','900000']);
    await createDirectory(path.join(dir,'ids.json')).get('google',discover); assert.equal(count,1);
    await store.get('google',discover,true); assert.equal(count,2);
    await assert.rejects(store.get('agoda',async()=>[]));
    assert.equal(store.snapshot().google.businesses.length,2);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('scoped crawl accepts one numeric property, refuses duplicate batches and untrusted identifiers', () => {
  assert.equal(parse('{"businesses":[{"business_identifier":"20057470"}]}').businesses[0].business_identifier,'20057470');
  for(const businesses of [[],[{business_identifier:'x'}],[{business_identifier:'20057470'},{business_identifier:'20087897'}]]) assert.throws(()=>parse(JSON.stringify({businesses})));
  assert.throws(()=>normalize([]));
});
test('review page hints are tied to both IDs and recover when the target moved earlier', async () => {
  assert.equal(pageHint({property_id:'a',review_id:'r',page:2},'b','r',5),0);
  assert.equal(pageHint({property_id:'a',review_id:'r',page:2},'a','r',5),2);
  let current=0, opens=0; const visited=[];
  const found=await seek({hint:2,maxPages:4,open:async()=>{current=0;opens++;return true;},next:async()=>++current<4,find:async()=>{visited.push(current);return current===1?{id:'r'}:null;}});
  assert.deepEqual(found,{id:'r'}); assert.equal(opens,2); assert.deepEqual(visited,[2,3,0,1]);
});
