import test from 'node:test';
import assert from 'node:assert/strict';
import {onlineUsers} from './presence.js';
import {createDevApi} from './dev-api.mjs';
test('presence excludes stale, expired, pending and disabled users; deduplicates sessions and exposes no tokens',()=>{
  const now=200000,users=[{id:'a',name:'Owner',username:'owner',owner:1,approval:'approved',password:'private'},{id:'b',name:'Pending',approval:'pending'},{id:'c',name:'Disabled',approval:'approved',disabled:1}];
  const sessions=[{user_id:'a',last_seen:now-200,expires:now+1000,page:'ledger',hash:'private'},{user_id:'a',last_seen:now-100,expires:now+1000,page:'roster'},{user_id:'b',last_seen:now,expires:now+1000},{user_id:'c',last_seen:now,expires:now+1000}];
  assert.deepEqual(onlineUsers(sessions,users,now),[{id:'a',name:'Owner',username:'owner',owner:true,page:'Roster',lastSeen:now-100}]);
  assert.deepEqual(onlineUsers(sessions,users,now+130000),[]);
});
test('local presence needs login, is admin-only to view and disappears after logout',async()=>{
  const api=createDevApi();
  const request=(path,body,cookie='')=>new Request('http://127.0.0.1:4173'+path,{method:body?'POST':'GET',headers:{Origin:'http://127.0.0.1:4173','Content-Type':'application/json','X-Bandbook-Request':'1',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
  try{
    assert.equal((await api.handle(request('/api/presence'))).status,401);
    const setup=await api.handle(request('/api/auth/setup',{username:'owner',name:'Owner',password:'Local-presence-password-123'})),cookie=setup.headers.get('set-cookie').split(';')[0];
    assert.equal((await api.handle(request('/api/presence',{page:'roster'},cookie))).status,200);
    assert.equal((await (await api.handle(request('/api/presence',null,cookie))).json()).users.length,1);
    await api.handle(request('/api/auth/logout',{},cookie));assert.equal(api.db.prepare('SELECT count(*) AS n FROM presence').get().n,0);
  }finally{api.close();}
});
