import {sampleData} from './test-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes,scryptSync} from 'node:crypto';
import worker from './worker.js';
import {createDevApi} from './dev-api.mjs';
import {totp,decryptBackup,unseal} from './security-crypto.mjs';
import {restoreSnapshot} from './backup-restore.mjs';
import {createHash} from 'node:crypto';

const origin='https://blazzer10200.github.io',apiOrigin='https://bandbook.test';
const password='Testing-only-Password-32768';
const salt='01'.repeat(16),hash=salt+':'+scryptSync(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
function database(){
 const sql=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('./drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('./drizzle/'+f,import.meta.url),'utf8'));
 const DB={prepare(text){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},execute(){return {meta:{changes:Number(sql.prepare(text).run(...args).changes)}};},async run(){return this.execute();}};},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {DB,sql,PTO_SECURITY_KEY:randomBytes(32).toString('base64'),PTO_MIGRATION_TOKEN:randomBytes(32).toString('hex')};
}
function request(path,body,{token='',method=body?'POST':'GET',source=origin,headers={}}={}){
 return new Request(apiOrigin+path,{method,headers:{Origin:source,'CF-Connecting-IP':'192.0.2.1',...(body?{'Content-Type':'application/json','X-Bandbook-Request':'1'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
}
async function call(env,path,body,options){return worker.fetch(request(path,body,options),env);}
async function initialized(t){
 const env=database();t.after(()=>env.sql.close());
 const local=createDevApi({seed:sampleData(),key:Buffer.from(env.PTO_SECURITY_KEY,'base64')});
 for(const [id,owner,roles] of [['owner',1,[]],['leader',0,['admin']]])local.db.prepare("INSERT INTO users(id,name,email,username,password,owner,roles,approval) VALUES(?,?,?,?,?,?,?,'approved')").run(id,id,id+'@pto.invalid',id,hash,owner,JSON.stringify(roles));
 const snapshot=local.snapshot();local.close();
 const migrated=await call(env,'/api/operator/migrate',snapshot,{source:apiOrigin,headers:{'X-PTO-Migration':env.PTO_MIGRATION_TOKEN}});assert.equal(migrated.status,200,await migrated.text());
 env.original=snapshot;return env;
}
async function login(env,username='leader'){
 const res=await call(env,'/api/auth/login',{username,password});assert.equal(res.status,200,await res.clone().text());return {token:res.headers.get('X-PTO-Session'),data:await res.json()};
}

test('public page requires application login; migration is authenticated and one-time',async t=>{
 const env=await initialized(t);
 assert.equal((await call(env,'/api/ledger')).status,401);
 assert.deepEqual(await (await call(env,'/api/session')).json(),{authenticated:false,setupRequired:false,development:false});
 assert.equal((await call(env,'/api/auth/setup',{})).status,409);
 assert.equal((await call(env,'/api/operator/migrate',env.original,{source:apiOrigin,headers:{'X-PTO-Migration':env.PTO_MIGRATION_TOKEN}})).status,409);
 assert.equal((await call(env,'/api/operator/migrate',env.original)).status,404);
 const res=await worker.fetch(new Request(apiOrigin+'/'),{ASSETS:{fetch:async()=>new Response('<h1>PTO</h1>')}});
 assert.equal(res.status,200);assert.equal(res.headers.get('X-Frame-Options'),'DENY');
});
test('deployment Owner recovery is scoped, expires, revokes sessions and cannot replay',async t=>{
 const env=await initialized(t),owner=await login(env,'owner'),leader=await login(env);
 const nextPassword='Replacement-owner-password-999',nextSalt='03'.repeat(16);
 const replacement=nextSalt+':'+scryptSync(nextPassword,nextSalt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 const settings={ownerId:'owner',username:'owner',previousDigest:createHash('sha256').update(hash).digest('hex'),password:replacement,expires:Date.now()+1800000};
 env.PTO_OWNER_PASSWORD_RESET=JSON.stringify({...settings,ownerId:'leader',username:'leader'});
 assert.equal((await call(env,'/api/ledger',undefined,owner)).status,200);
 env.PTO_OWNER_PASSWORD_RESET=JSON.stringify({...settings,expires:Date.now()-1});
 assert.equal((await call(env,'/api/ledger',undefined,owner)).status,200);
 env.PTO_OWNER_PASSWORD_RESET=JSON.stringify(settings);
 assert.equal((await call(env,'/api/ledger',undefined,owner)).status,401);
 assert.equal((await call(env,'/api/ledger',undefined,leader)).status,200);
 const signedIn=await call(env,'/api/auth/login',{username:'owner',password:nextPassword});assert.equal(signedIn.status,200);
 const renewed={token:signedIn.headers.get('x-pto-session')};assert.equal((await call(env,'/api/ledger',undefined,renewed)).status,200);
 assert.equal((await signedIn.json()).user.owner,true);
 assert.equal(env.sql.prepare("SELECT count(*) AS n FROM pto_events WHERE action LIKE 'Owner password reset%'").get().n,1);
});
test('migrated leader signs in from Pages; unauthorized origins cannot read or preflight',async t=>{
 const deletionPreflight=await worker.fetch(new Request(apiOrigin+'/api/users/example',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'DELETE'}}),{});
 assert.equal(deletionPreflight.status,204);assert.match(deletionPreflight.headers.get('Access-Control-Allow-Methods'),/DELETE/);
 const env=await initialized(t),{token,data}=await login(env);
 assert.equal(data.user.owner,false);assert.equal(data.permissions.access,'manage');
 const loaded=await call(env,'/api/ledger',undefined,{token});assert.equal(loaded.status,200);
 assert.equal(loaded.headers.get('Access-Control-Allow-Origin'),origin);
 const denied=await call(env,'/api/ledger',undefined,{token,source:'https://evil.test'});assert.equal(denied.status,403);
 const preflight=await call(env,'/api/ledger',undefined,{method:'OPTIONS'});assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);
 assert.equal((await call(env,'/api/ledger',undefined,{method:'OPTIONS',source:'https://evil.test'})).status,403);
 const logout=await call(env,'/api/auth/logout',{}, {token});assert.equal(logout.status,200);
 assert.equal((await call(env,'/api/ledger',undefined,{token})).status,401);
});
test('remembered Pages cookies restore sessions, expire, and respect logout and origin boundaries',async t=>{
 const env=await initialized(t),start=Date.now();
 const signed=await call(env,'/api/auth/login',{username:'leader',password,remember:true});assert.equal(signed.status,200);
 const cookie=signed.headers.get('set-cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=None; Partitioned; Path=\/; Max-Age=2592000/);
 assert.equal(signed.headers.get('Access-Control-Allow-Credentials'),'true');
 const options={headers:{Cookie:cookie.split(';')[0]}};
 const session=await (await call(env,'/api/session',undefined,options)).json();assert.equal(session.authenticated,true);assert.equal(session.user.remembered,true);
 const state=JSON.parse(env.sql.prepare('SELECT document FROM pto_state').get().document);assert.ok(state.sessions[0].expires>=start+2592000000);assert.equal(state.sessions[0].remember,1);
 const denied=await call(env,'/api/session',undefined,{...options,source:'https://evil.test'});assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Credentials'),null);
 const logout=await call(env,'/api/auth/logout',{},options);assert.match(logout.headers.get('set-cookie'),/Partitioned; Path=\/; Max-Age=0/);
 assert.equal((await (await call(env,'/api/session',undefined,options)).json()).authenticated,false);
 const ordinary=await call(env,'/api/auth/login',{username:'leader',password},{source:apiOrigin});assert.match(ordinary.headers.get('set-cookie'),/SameSite=Strict/);assert.doesNotMatch(ordinary.headers.get('set-cookie'),/Max-Age|Partitioned/);
 const expired=JSON.parse(env.sql.prepare('SELECT document FROM pto_state').get().document);assert.ok(expired.sessions[0].expires<Date.now()+43200001);expired.sessions[0].expires=Date.now()-1;env.sql.prepare('UPDATE pto_state SET document=?').run(JSON.stringify(expired));
 assert.equal((await (await call(env,'/api/session',undefined,{headers:{Cookie:ordinary.headers.get('set-cookie').split(';')[0]},source:apiOrigin})).json()).authenticated,false);
});
test('registration waits for approval; member reads are filtered and cannot save',async t=>{
 const env=await initialized(t),leader=await login(env);
 const registered=await call(env,'/api/auth/register',{username:'new.member',name:'New Member',stateId:'01234',phone:'555-1234',password});assert.equal(registered.status,200);
 const member={token:registered.headers.get('X-PTO-Session')},u=(await registered.json()).user;
 assert.equal(u.approval,'pending');assert.equal((await call(env,'/api/ledger',undefined,member)).status,403);
 assert.equal((await call(env,'/api/requests/'+u.id,{decision:'approved',roleIds:['member'],profile:u,rank:'Prospect',revision:0},leader)).status,200);
 const loaded=await (await call(env,'/api/ledger',undefined,member)).json();assert.equal(loaded.data.purchases.length,0);assert.ok(loaded.data.members.length);
 assert.equal((await call(env,'/api/ledger',{data:loaded.data,revision:loaded.revision},{...member,method:'PUT'})).status,403);
 assert.equal((await call(env,'/api/access',undefined,member)).status,403);
 assert.equal((await call(env,'/api/presence',{page:'roster'},member)).status,200);
 assert.equal((await call(env,'/api/presence',undefined,member)).status,403);
 assert.equal((await call(env,'/api/presence',{page:'access'},member)).status,403);
 let online=await (await call(env,'/api/presence',undefined,leader)).json();assert.equal(online.users.length,1);assert.equal(online.users[0].id,u.id);assert.equal(online.users[0].page,'Roster');assert.equal(online.users[0].password,undefined);
 await call(env,'/api/auth/logout',{},member);online=await (await call(env,'/api/presence',undefined,leader)).json();assert.equal(online.users.length,0);
 assert.equal((await call(env,'/api/users/owner',{disabled:true,roleIds:[]},{...leader,method:'PUT'})).status,400);
});
test('simultaneous edits preserve one winner and encrypted backups restore accounts',async t=>{
 const env=await initialized(t),leader=await login(env);
 const current=await (await call(env,'/api/ledger',undefined,leader)).json();
 const edits=await Promise.all(['First','Second'].map(name=>call(env,'/api/ledger',{revision:current.revision,data:{...current.data,name}},{...leader,method:'PUT'})));
 assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
 const final=await (await call(env,'/api/ledger',undefined,leader)).json();assert.equal(final.revision,current.revision+1);
 const parts=env.sql.prepare('SELECT document FROM pto_backups ORDER BY day,part').all();assert.ok(parts.length);
 const snapshot=JSON.parse(unseal(JSON.parse(parts.map(r=>r.document).join('')),Buffer.from(env.PTO_SECURITY_KEY,'base64')).toString());
 const restored=restoreSnapshot(snapshot);assert.equal(restored.db.prepare('SELECT count(*) AS n FROM users').get().n,2);restored.close();
});
test('authenticator challenges, recovery, admin gate and session revocation work on hosted API',async t=>{
 const env=await initialized(t),owner=await login(env,'owner'),leader=await login(env);
 const setup=await call(env,'/api/security/setup',{currentPassword:password},owner);assert.equal(setup.status,200,await setup.clone().text());
 const {secret,qr}=await setup.json();assert.match(qr,/^data:image\/svg\+xml;base64,/);
 const confirmed=await call(env,'/api/security/confirm',{code:totp(secret)},owner);assert.equal(confirmed.status,200);
 const codes=(await confirmed.json()).recoveryCodes;owner.token=confirmed.headers.get('X-PTO-Session');
 assert.equal((await call(env,'/api/ledger',undefined,leader)).status,200);
 // Advance last accepted step for subsequent independent reauthentication in this fixture.
 const state=JSON.parse(env.sql.prepare('SELECT document FROM pto_state').get().document);state.security[0].last_step=-1;env.sql.prepare('UPDATE pto_state SET document=?').run(JSON.stringify(state));
 const policy=await call(env,'/api/security/policy',{currentPassword:password,code:totp(secret),requireAdminMfa:true},owner);assert.equal(policy.status,200);
 assert.equal((await call(env,'/api/ledger',undefined,leader)).status,403);
 const challenged=await login(env,'owner');assert.equal(challenged.data.mfaRequired,true);assert.equal(challenged.token,null);
 assert.equal((await call(env,'/api/auth/mfa',{challenge:challenged.data.challenge,code:totp(secret)})).status,401);
 const recovered=await call(env,'/api/auth/recover',{username:'owner',recoveryCode:codes[0],password:'New-testing-password-999'});assert.equal(recovered.status,200);
 assert.equal((await call(env,'/api/ledger',undefined,owner)).status,401);
 assert.equal((await call(env,'/api/auth/recover',{username:'owner',recoveryCode:codes[0],password:'New-testing-password-999'})).status,401);
});
test('hosted rate limits survive API instances, uploads are bounded and missing bindings fail closed',async t=>{
 const env=await initialized(t);
 for(let i=0;i<8;i++)assert.equal((await call(env,'/api/auth/login',{username:'leader',password:'incorrect'})).status,401);
 assert.equal((await call(env,'/api/auth/login',{username:'leader',password})).status,429);
 assert.equal((await call(env,'/api/auth/login',{username:'leader@pto.invalid',password})).status,429);
 assert.equal((await call(env,'/api/ledger',{padding:'x'.repeat(950001)},{method:'PUT'})).status,413);
 assert.equal((await call({},'/api/ledger')).status,503);
});
