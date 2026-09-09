import test from 'node:test';
import assert from 'node:assert/strict';
import {onlineUsers,memberPresence} from './presence.js';
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

test('member sidebar groups by roster rank, protects private fields and excludes archived or unapproved accounts',()=>{
 const now=200000;
 const users=[{id:'a',name:'Active Member',approval:'approved',password:'private',phone:'private'},
 {id:'o',name:'Owner',approval:'approved',owner:true},{id:'p',name:'Applicant',approval:'pending'},
 {id:'d',name:'Disabled',approval:'approved',disabled:true},{id:'x',name:'Archived',approval:'approved'}];
 const data={ranks:['Leader','Member'],members:[{id:'ma',userId:'a',name:'Old Name',rank:'Leader',status:'active',notes:'private'},
 {id:'mx',userId:'x',name:'Archived',rank:'Member',status:'archived'},
 {id:'legacy',name:'Legacy Member',rank:'Member',status:'inactive'}]};
 const sessions=[{user_id:'a',last_seen:now-1000,expires:now+600000,page:'ledger',hash:'private'},
 {user_id:'o',last_seen:now-121000,expires:now+600000,page:'access'}];
 const result=memberPresence(sessions,users,data,now);
 assert.deepEqual(result.members,[{id:'ma',name:'Active Member',rank:'Leader',online:true,hasAccount:true},
 {id:'legacy',name:'Legacy Member',rank:'Member',online:false,hasAccount:false},
 {id:'o',name:'Owner',rank:'Owner',online:false,hasAccount:true}]);
 assert.deepEqual(result.ranks,['Owner','Leader','Member']);assert.doesNotMatch(JSON.stringify(result),/private|ledger|lastSeen/);
 assert.ok(memberPresence(sessions,users,data,now+121000).members.every(m=>!m.online));
});
