import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudLedger} from './cloud.js';

test('cloud client submits the loaded revision and advances it only after a confirmed save',async t=>{
  let call=0;
  t.mock.method(globalThis,'fetch',async(path,options)=>{
    assert.equal(path,'/api/ledger');
    if(call++===0)return Response.json({data:{name:'Old'},revision:3});
    const body=JSON.parse(options.body);assert.equal(body.revision,3);assert.equal(body.data.name,'New');assert.ok(body.writeId);
    assert.equal(options.headers['X-Bandbook-Request'],'1');
    return Response.json({data:body.data,revision:4});
  });
  const ledger=new CloudLedger();assert.deepEqual(await ledger.load(),{name:'Old'});
  assert.deepEqual(await ledger.save({name:'New'}),{name:'New'});assert.equal(ledger.revision,4);
});
test('conflicts and expired sessions remain errors, with no revision advance',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:'Changed on another device.'},{status:409}));
  const ledger=new CloudLedger();ledger.revision=2;
  await assert.rejects(ledger.save({}),error=>error.conflict===true);assert.equal(ledger.revision,2);
  globalThis.fetch=async()=>Response.json({},{status:401});
  await assert.rejects(ledger.load(),/session expired/);
});
