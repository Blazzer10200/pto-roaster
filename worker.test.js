import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { handleApi } from './worker.js';
import { freshData } from './model.js';

function database() {
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('./drizzle/0000_tired_moondragon.sql',import.meta.url),'utf8'));
  const db={prepare(text){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(text).get(...args)||null;},async run(){const result=sql.prepare(text).run(...args);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  return {DB:db,sql};
}
function request(path='/api/ledger',body,headers={}) {
  return new Request('https://bandbook.test'+path,{method:body?'PUT':'GET',headers:{...(body?{'Content-Type':'application/json','Origin':'https://bandbook.test','X-Bandbook-Request':'1'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
}
test('anonymous visitors open the app and read the ledger without a login redirect',async()=>{
  const env=database();
  assert.equal((await handleApi(new Request('https://bandbook.test/api/ledger'),env)).status,200);
  const result=await worker.fetch(new Request('https://bandbook.test/'),{...env,ASSETS:{fetch:async()=>new Response('<h1>Bandbook</h1>')}});
  assert.equal(result.status,200);assert.equal(result.headers.get('location'),null);
  assert.match(await result.text(),/Bandbook/);
});
test('new hosted ledger is empty and public session needs no identity',async()=>{
  const env=database();const initial=await (await handleApi(request(),env)).json();
  assert.equal(initial.revision,0);assert.equal(initial.data.contacts.length,0);assert.ok(initial.data.bands.every(b=>b.price===0));
  assert.deepEqual(await (await handleApi(request('/api/session'),env)).json(),{access:'public'});
});
test('saves persist in SQLite with an audit snapshot and stale writes cannot overwrite them',async()=>{
  const env=database();const data=freshData();data.name='My ledger';
  const body={data,revision:0,writeId:crypto.randomUUID()};
  const saved=await handleApi(request('/api/ledger',body),env);assert.equal(saved.status,200);
  const again=await handleApi(request('/api/ledger',body),env);assert.equal(again.status,200);
  const stale=await handleApi(request('/api/ledger',{...body,writeId:crypto.randomUUID(),data:{...data,name:'Stale'}}),env);assert.equal(stale.status,409);
  const current=await (await handleApi(request(),env)).json();assert.equal(current.data.name,'My ledger');assert.equal(current.revision,1);
  assert.equal(env.sql.prepare('SELECT count(*) AS count FROM ledger_revisions').get().count,1);
});
test('cross-origin writes and corrupt backups are rejected without altering the ledger',async()=>{
  const env=database(),body={data:freshData(),revision:0,writeId:crypto.randomUUID()};
  assert.equal((await handleApi(request('/api/ledger',body,{Origin:'https://other.test'}),env)).status,403);
  assert.equal((await handleApi(request('/api/ledger',{...body,data:{}}),env)).status,400);
  assert.equal((await handleApi(request('/api/ledger',{...body,revision:-1}),env)).status,400);
  assert.equal(env.sql.prepare('SELECT count(*) AS count FROM ledger_revisions').get().count,0);
});
test('oversized ledger uploads are rejected and database failure does not pretend to save',async()=>{
  const env=database(),body={data:freshData(),revision:0,writeId:crypto.randomUUID(),padding:'x'.repeat(950001)};
  assert.equal((await handleApi(request('/api/ledger',body),env)).status,413);
  assert.equal((await handleApi(request(),{})).status,503);
});
