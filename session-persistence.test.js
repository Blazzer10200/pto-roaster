import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createDevApi} from './dev-api.mjs';

const password='Session-regression-password-123';
const makeRequest=(port,path,body,cookies='')=>new Request(`http://127.0.0.1:${port}${path}`,{method:body?'POST':'GET',headers:{Cookie:cookies,...(body?{Origin:`http://127.0.0.1:${port}`,'X-Bandbook-Request':'1','Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const setup=api=>api.handle(makeRequest(4173,'/api/auth/setup',{name:'Test Owner',username:'owner',password,remember:true}));

test('remembered preview sessions coexist on one hostname and sign out independently',async t=>{
  const main=createDevApi({cookieName:'pto_dev_session_4173'}),sample=createDevApi({cookieName:'pto_dev_session_4174'});
  t.after(()=>{main.close();sample.close();});
  // Browsers key cookies by host/path/name, not by the server port.
  const jar=new Map(),save=response=>{const [pair]=response.headers.get('set-cookie').split(';'),[name,value]=pair.split('=');if(value)jar.set(name,value);else jar.delete(name);};
  const cookies=()=>[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
  save(await setup(main));save(await setup(sample));
  assert.equal((await (await main.handle(makeRequest(4173,'/api/session',null,cookies()))).json()).authenticated,true,'sample login must not overwrite main login');
  assert.equal((await (await sample.handle(makeRequest(4174,'/api/session',null,cookies()))).json()).authenticated,true);
  save(await sample.handle(makeRequest(4174,'/api/auth/logout',{},cookies())));
  assert.equal((await (await main.handle(makeRequest(4173,'/api/session',null,cookies()))).json()).authenticated,true,'sample logout must not clear the main cookie');
  assert.equal((await (await sample.handle(makeRequest(4174,'/api/session',null,cookies()))).json()).authenticated,false);
});

test('remembered login survives a database reopen while session-only login retains its shorter lifetime',async t=>{
  const file=join(mkdtempSync(join(tmpdir(),'pto-session-test-')),'session.sqlite'),key=randomBytes(32);
  let time=Date.now(),api=createDevApi({file,key,now:()=>time,cookieName:'pto_dev_session_4173'});
  t.after(()=>api.close());
  await setup(api);
  const signIn=remember=>api.handle(makeRequest(4173,'/api/auth/login',{username:'owner',password,remember}));
  const persistent=await signIn(true),temporary=await signIn(false);
  assert.match(persistent.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000/);
  assert.doesNotMatch(temporary.headers.get('set-cookie'),/Max-Age|Expires/);
  const persistentCookie=persistent.headers.get('set-cookie').split(';')[0],temporaryCookie=temporary.headers.get('set-cookie').split(';')[0];
  api.close();api=createDevApi({file,key,now:()=>time,cookieName:'pto_dev_session_4173'});
  const session=async cookie=>(await (await api.handle(makeRequest(4173,'/api/session',null,cookie))).json());
  assert.equal((await session(persistentCookie)).user.remembered,true);
  time+=13*60*60*1000;
  assert.equal((await session(temporaryCookie)).authenticated,false);
  assert.equal((await session(persistentCookie)).authenticated,true);
  time+=30*24*60*60*1000;
  assert.equal((await session(persistentCookie)).authenticated,false);
});
