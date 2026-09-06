import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createDevApi} from './dev-api.mjs';
import {stateFromSnapshot,handleCloudApi} from './cloud-api.mjs';
import {sampleData} from './test-fixtures.js';
import {emptyFinance,weeklyBills,validateFinance,outstanding,depositTotal,financeDay} from './finance-model.js';
import {enableMemberBands,initialAccess} from './access-model.js';
import {restoreSnapshot} from './backup-restore.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
function fixture(t,hosted){
 const api=createDevApi({seed:sampleData()}),tokens={},names={owner:'Finance Owner',manager:'Finance Buddy',member:'Rocco Moretti',other:'Other Member',pending:'Waiting Member'};
 for(const [id,name] of Object.entries(names)){
  api.db.prepare('INSERT INTO users(id,name,email,username,password,owner,roles,approval) VALUES(?,?,?,?,?,?,?,?)').run(id,name,id+'@pto.invalid',id,'ab'.repeat(16)+':'+'cd'.repeat(64),Number(id==='owner'),JSON.stringify(id==='owner'?[]:id==='manager'?['admin']:['member']),id==='pending'?'pending':'approved');
  tokens[id]=randomBytes(32).toString('base64url');api.db.prepare('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').run(digest(tokens[id]),id,Date.now()+3600000);
 }
 api.db.prepare('INSERT INTO account_security(user_id) VALUES(?)').run('member');
 api.db.prepare('INSERT INTO recovery_codes(user_id,hash) VALUES(?,?)').run('member','fixture-recovery-hash');
 api.db.prepare('INSERT INTO login_challenges(hash,user_id,expires,password_version) VALUES(?,?,?,?)').run('fixture-challenge','member',Date.now()+60000,'fixture-password');
 let handle=r=>api.handle(r),origin='http://127.0.0.1:4173',snapshot=()=>api.snapshot();
 if(hosted){
  const document=api.snapshot(),state=stateFromSnapshot(document,Buffer.from(document.key,'base64'));state.sessions=api.db.prepare('SELECT * FROM sessions').all();state.challenges=api.db.prepare('SELECT * FROM login_challenges').all();api.close();
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());for(const f of readdirSync(new URL('./drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('./drizzle/'+f,import.meta.url),'utf8'));
  sql.prepare('INSERT INTO pto_state(id,revision,document,write_id,updated_at) VALUES(1,0,?,?,?)').run(JSON.stringify(state),'fixture',new Date().toISOString());
  const DB={prepare(text){let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},execute(){return {meta:{changes:Number(sql.prepare(text).run(...args).changes)}};},async run(){return this.execute();}};},async batch(statements){sql.exec('BEGIN');try{const r=statements.map(s=>s.execute());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  origin='https://pto.test';handle=r=>handleCloudApi(r,{DB,PTO_SECURITY_KEY:document.key});snapshot=()=>{const s=JSON.parse(sql.prepare('SELECT document FROM pto_state').get().document);return {...document,tables:{...document.tables,users:s.users,workspace:[s.workspace],account_security:s.security,recovery_codes:s.recovery}};};
 }else t.after(()=>api.close());
 const call=async(path,{as='member',body,method=body?'POST':'GET'}={})=>{const response=await handle(new Request(origin+path,{method,headers:{Origin:origin,...(as?{Cookie:'pto_session='+tokens[as]}:{}),...(body?{'Content-Type':'application/json','X-Bandbook-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,payload:await response.json()};};
 return {call,snapshot};
}
for(const hosted of [false,true])test(`${hosted?'D1':'SQLite'} finance: own deposits, locked rates, private balances, payouts, bills and history`,async t=>{
 const {call,snapshot}=fixture(t,hosted);
 assert.equal((await call('/api/finance',{as:''})).status,401);assert.equal((await call('/api/finance',{as:'pending'})).status,403);
 let own=(await call('/api/finance')).payload;assert.equal(own.user.name,'Rocco Moretti');assert.equal(own.canSubmit,true);assert.equal(own.canManage,false);assert.equal(own.bills.length,0);
 const first={requestId:crypto.randomUUID(),ratesVersion:own.ratesVersion,lines:[{id:'band-1',quantity:5}],notes:'House stash'};
 assert.equal((await call('/api/finance/deposits',{body:{...first,userId:'other'}})).status,403);
 assert.equal((await call('/api/finance/deposits',{body:{...first,ratesVersion:'stale'}})).status,409);
 for(const quantity of [-1,1.5,1000001])assert.equal((await call('/api/finance/deposits',{body:{...first,lines:[{id:'band-1',quantity}]}})).status,400);
 own=(await call('/api/finance/deposits',{body:{...first,price:1,payments:[{amount:50000}]}})).payload;
 assert.equal(own.deposits.length,1);assert.equal(own.deposits[0].userId,'member');assert.equal(depositTotal(own.deposits[0]),50000);assert.equal(own.deposits[0].status,'pending');
 assert.equal((await call('/api/finance/deposits',{body:first})).payload.deposits.length,1);
 assert.equal((await call('/api/finance/deposits',{body:{...first,notes:'Different submission'}})).status,409);
 assert.equal((await call('/api/finance',{as:'other'})).payload.deposits.length,0);
 const manager=(await call('/api/finance',{as:'manager'})).payload;assert.equal(manager.deposits.length,1);assert.equal(manager.bills.length,2);assert.equal(manager.bills.reduce((n,b)=>n+b.amount,0),1000000);
 const payout={requestId:crypto.randomUUID(),userId:'member',expectedOutstanding:50000,expectedEntryIds:[first.requestId]};
 assert.equal((await call('/api/finance/payouts',{body:payout})).status,403);
 const second={...first,requestId:crypto.randomUUID(),lines:[{id:'band-2',quantity:2}]};assert.equal((await call('/api/finance/deposits',{body:second})).status,200);
 assert.equal((await call('/api/finance/payouts',{as:'manager',body:payout})).status,409);
 const paid={...payout,expectedOutstanding:150000,expectedEntryIds:[first.requestId,second.requestId]};assert.equal((await call('/api/finance/payouts',{as:'manager',body:paid})).status,200);
 assert.equal((await call('/api/finance/payouts',{as:'manager',body:paid})).status,200);
 own=(await call('/api/finance')).payload;assert.equal(outstanding(own.deposits),0);assert.equal(own.deposits.length,2);assert.equal(own.payouts.length,1);assert.equal(own.payouts[0].byName,'Finance Buddy');assert.ok(own.deposits.every(e=>e.status==='paid'));
 assert.equal((await call('/api/finance/payouts',{as:'manager',body:{...paid,requestId:crypto.randomUUID()}})).status,409);
 const third={...first,requestId:crypto.randomUUID()};await call('/api/finance/deposits',{body:third});
 assert.equal((await call('/api/finance/deposits/'+third.requestId,{body:{decision:'reject',reason:'Wrong count'}})).status,403);
 assert.equal((await call('/api/finance/deposits/'+third.requestId,{as:'manager',body:{decision:'reject',reason:'Please recount the stash'}})).status,200);
 own=(await call('/api/finance')).payload;assert.equal(own.deposits[0].reason,'Please recount the stash');assert.equal(outstanding(own.deposits),0);
 const ownerDeposit={...first,requestId:crypto.randomUUID()};await call('/api/finance/deposits',{as:'owner',body:ownerDeposit});assert.equal((await call('/api/finance/payouts',{as:'owner',body:{requestId:crypto.randomUUID(),userId:'owner',expectedOutstanding:50000,expectedEntryIds:[ownerDeposit.requestId]}})).status,403);
 const bill={requestId:crypto.randomUUID(),kind:'house',dueDate:manager.startDate};assert.equal((await call('/api/finance/bills',{body:bill})).status,403);assert.equal((await call('/api/finance/bills',{as:'manager',body:bill})).status,200);assert.equal((await call('/api/finance/bills',{as:'manager',body:bill})).status,200);assert.equal((await call('/api/finance/bills',{as:'owner',body:{...bill,requestId:crypto.randomUUID()}})).status,409);
 const ledger=(await call('/api/ledger',{as:'owner'})).payload;assert.equal(ledger.data.finance,undefined);assert.equal((await call('/api/ledger',{as:'owner',method:'PUT',body:{...ledger,data:{...ledger.data,finance:emptyFinance()}}})).status,403);
 const originalRate=own.deposits[1].lines[0].price;ledger.data.bands[1].price=99900;assert.equal((await call('/api/ledger',{as:'owner',method:'PUT',body:ledger})).status,200);
 const after=(await call('/api/finance')).payload;assert.equal(after.deposits[1].lines[0].price,originalRate);assert.equal((await call('/api/finance/deposits',{body:{...first,requestId:crypto.randomUUID()}})).status,409);
 const restored=restoreSnapshot(snapshot());t.after(()=>restored.close());const finance=JSON.parse(restored.snapshot().tables.workspace[0].document).finance;assert.equal(finance.deposits.length,4);assert.equal(finance.payouts.length,1);assert.equal(finance.bills.length,1);assert.equal(restored.db.prepare('SELECT count(*) AS count FROM sessions').get().count,0);
 const audit=(await call('/api/audit',{as:'owner'})).payload;assert.match(JSON.stringify(audit),/Band payout confirmed: Rocco Moretti/);assert.match(JSON.stringify(audit),/Gang house paid/);
});
for(const hosted of [false,true])test(`${hosted?'D1':'SQLite'} concurrent finance confirmations pay each deposit and weekly bill once`,async t=>{
 const {call}=fixture(t,hosted),initial=(await call('/api/finance')).payload;
 const depositId=crypto.randomUUID();await call('/api/finance/deposits',{body:{requestId:depositId,ratesVersion:initial.ratesVersion,lines:[{id:'band-1',quantity:10}],notes:''}});
 const paid=await Promise.all(['owner','manager'].map(as=>call('/api/finance/payouts',{as,body:{requestId:crypto.randomUUID(),userId:'member',expectedOutstanding:100000,expectedEntryIds:[depositId]}})));
 assert.deepEqual(paid.map(r=>r.status).sort(),[200,409]);assert.equal((await call('/api/finance')).payload.payouts.length,1);
 const manager=(await call('/api/finance',{as:'manager'})).payload;
 const bills=await Promise.all(['owner','manager'].map(as=>call('/api/finance/bills',{as,body:{requestId:crypto.randomUUID(),kind:'taxes',dueDate:manager.startDate}})));
 assert.deepEqual(bills.map(r=>r.status).sort(),[200,409]);assert.equal((await call('/api/finance',{as:'owner'})).payload.bills.filter(b=>b.status==='paid').length,1);
});
for(const hosted of [false,true])test(`${hosted?'D1':'SQLite'} stale payout cannot pay replacement deposits with the same balance`,async t=>{
 const {call}=fixture(t,hosted),initial=(await call('/api/finance')).payload;
 const first={requestId:crypto.randomUUID(),ratesVersion:initial.ratesVersion,lines:[{id:'band-1',quantity:10}],notes:''};
 await call('/api/finance/deposits',{body:first});
 const payout={requestId:crypto.randomUUID(),userId:'member',expectedOutstanding:100000,expectedEntryIds:[first.requestId]};
 await call('/api/finance/deposits/'+first.requestId,{as:'manager',body:{decision:'reject',reason:'Corrected entry needed'}});
 const replacement={...first,requestId:crypto.randomUUID()};await call('/api/finance/deposits',{body:replacement});
 assert.equal((await call('/api/finance/payouts',{as:'owner',body:payout})).status,409);
 assert.equal(outstanding((await call('/api/finance')).payload.deposits),100000);
 assert.equal((await call('/api/finance/payouts',{as:'owner',body:{...payout,expectedEntryIds:[replacement.requestId]}})).status,200);
 assert.equal((await call('/api/finance/payouts',{as:'owner',body:payout})).status,409);
});
for(const hosted of [false,true])test(`${hosted?'D1':'SQLite'} account deletion revokes access, removes linked roster, and preserves settled finances`,async t=>{
 const {call,snapshot}=fixture(t,hosted),initial=(await call('/api/finance')).payload;
 const linked=await call('/api/members',{as:'owner',body:{userId:'member',profileRevision:0,revision:initial.revision,rank:'Member',joined:'2026-09-05'}});assert.equal(linked.status,200);
 const deletion={username:'member',profileRevision:0,revision:initial.revision+1};
 assert.equal((await call('/api/users/member',{method:'DELETE',body:deletion})).status,403);
 assert.equal((await call('/api/users/owner',{as:'manager',method:'DELETE',body:{...deletion,username:'owner'}})).status,403);
 assert.equal((await call('/api/users/manager',{as:'manager',method:'DELETE',body:{...deletion,username:'manager'}})).status,403);
 assert.equal((await call('/api/users/member',{as:'owner',method:'DELETE',body:{...deletion,username:'wrong'}})).status,400);
 assert.equal((await call('/api/users/member',{as:'owner',method:'DELETE',body:{...deletion,revision:initial.revision}})).status,409);
 const deposit={requestId:crypto.randomUUID(),ratesVersion:initial.ratesVersion,lines:[{id:'band-1',quantity:1}],notes:'Receipt kept'};
 const saved=await call('/api/finance/deposits',{body:deposit});deletion.revision=saved.payload.revision;
 assert.equal((await call('/api/users/member',{as:'owner',method:'DELETE',body:deletion})).status,409);
 const paid=await call('/api/finance/payouts',{as:'owner',body:{requestId:crypto.randomUUID(),userId:'member',expectedOutstanding:10000,expectedEntryIds:[deposit.requestId]}});deletion.revision=paid.payload.revision;
 assert.equal((await call('/api/users/member',{as:'owner',method:'DELETE',body:deletion})).status,200);
 assert.equal((await call('/api/session')).payload.authenticated,false);assert.equal((await call('/api/finance')).status,401);
 const finance=(await call('/api/finance',{as:'owner'})).payload;assert.equal(finance.deposits[0].status,'paid');assert.equal(finance.deposits[0].name,'Rocco Moretti');assert.equal(finance.payouts.length,1);
 const backup=snapshot();assert.equal(backup.tables.users.some(u=>u.id==='member'),false);assert.equal(JSON.parse(backup.tables.workspace[0].document).members.some(m=>m.userId==='member'),false);assert.equal(backup.tables.account_security.some(r=>r.user_id==='member'),false);assert.equal(backup.tables.recovery_codes.some(r=>r.user_id==='member'),false);
 const restored=restoreSnapshot(backup);t.after(()=>restored.close());assert.equal(JSON.parse(restored.snapshot().tables.workspace[0].document).finance.payouts.length,1);
 assert.match(JSON.stringify((await call('/api/audit',{as:'owner'})).payload),/Account deleted: Rocco Moretti/);
});
for(const hosted of [false,true])test(`${hosted?'D1':'SQLite'} roster removal keeps the login and supports explicitly adding it back`,async t=>{
 const {call}=fixture(t,hosted),ledger=(await call('/api/ledger',{as:'owner'})).payload;
 await call('/api/members',{as:'owner',body:{userId:'member',profileRevision:0,revision:ledger.revision,rank:'Member',joined:'2026-09-05'}});
 const current=(await call('/api/ledger',{as:'owner'})).payload,member=current.data.members.find(m=>m.userId==='member');
 assert.equal((await call('/api/members/'+member.id,{method:'DELETE',body:{revision:current.revision}})).status,403);
 assert.equal((await call('/api/members/'+member.id,{as:'owner',method:'DELETE',body:{revision:ledger.revision}})).status,409);
 assert.equal((await call('/api/members/'+member.id,{as:'owner',method:'DELETE',body:{revision:current.revision}})).status,200);
 assert.equal((await call('/api/session')).payload.authenticated,true);
 const directory=(await call('/api/profiles',{as:'owner'})).payload;assert.equal(directory.users.find(u=>u.id==='member').memberId,null);
 assert.equal((await call('/api/members',{as:'owner',body:{userId:'member',profileRevision:0,revision:directory.revision,rank:'Member',joined:'2026-09-05'}})).status,200);
});
test('Thursday obligations cross weeks and Central-time midnight without erasing arrears',()=>{
 const f=emptyFinance(Date.parse('2026-09-09T15:00:00Z'));assert.equal(f.startDate,'2026-09-10');assert.equal(weeklyBills(f,Date.parse('2026-09-10T04:59:00Z'))[0].status,'upcoming');assert.equal(weeklyBills(f,Date.parse('2026-09-10T05:00:00Z'))[0].status,'due');
 const later=weeklyBills(f,Date.parse('2026-09-18T12:00:00Z'));assert.equal(later.length,6);assert.equal(later.filter(b=>b.status==='overdue').reduce((n,b)=>n+b.amount,0),2000000);assert.equal(financeDay(Date.parse('2026-11-02T05:59:00Z')),'2026-11-01');
 assert.throws(()=>validateFinance({...f,startDate:'2026-09-09'}));
});
test('default member self-service migration is one-time and respects explicit restrictions',()=>{
 const c=initialAccess();delete c.financeAccessVersion;delete c.roles[1].pages.bands;assert.equal(enableMemberBands(c),true);assert.equal(c.roles[1].pages.bands,'view');c.roles[1].pages.bands='none';assert.equal(enableMemberBands(c),false);assert.equal(c.roles[1].pages.bands,'none');
 delete c.financeAccessVersion;assert.equal(enableMemberBands(c),true);assert.equal(c.roles[1].pages.bands,'none');
});
