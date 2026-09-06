import {permits,permissionsFor} from './access-model.js';
import {financeDay,validFinanceDay} from './finance-model.js';
export const emptyHub=()=>({events:[],availability:[],notes:{},reads:{}});
export function validateHub(h){
  if(!h||!Array.isArray(h.events)||h.events.length>500||!Array.isArray(h.availability)||h.availability.length>2000||!h.notes||typeof h.notes!=='object'||Array.isArray(h.notes)||!h.reads||typeof h.reads!=='object'||Array.isArray(h.reads))throw Error('Invalid gang activity data.');
  const ids=new Set();
  for(const e of h.events){if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.title!=='string'||!e.title.trim()||e.title.length>100||!Number.isFinite(Date.parse(e.at))||typeof e.location!=='string'||e.location.length>200||typeof e.notes!=='string'||e.notes.length>2000||!e.responses||typeof e.responses!=='object'||Array.isArray(e.responses))throw Error('Invalid gang event.');ids.add(e.id);for(const r of Object.values(e.responses))if(!['yes','maybe','no','attended','absent'].includes(r))throw Error('Invalid attendance response.');}
  for(const a of h.availability)if(typeof a.userId!=='string'||!validFinanceDay(a.from)||!validFinanceDay(a.to)||a.to<a.from||typeof a.note!=='string'||a.note.length>500)throw Error('Invalid availability dates.');
  for(const [id,n]of Object.entries(h.notes))if(id.length>100||typeof n!=='string'||n.length>2000)throw Error('Invalid leadership note.');
  for(const [id,r]of Object.entries(h.reads))if(id.length>100||!Array.isArray(r)||r.length>300||r.some(x=>typeof x!=='string'||x.length>160))throw Error('Invalid notification state.');
  return h;
}
export function hubRequest({route,method,body,data,revision,permissions,actor,users,config,now=Date.now()}){
  const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
  const roster=permits(permissions,'roster'),manage=permits(permissions,'roster','manage'),access=permits(permissions,'access','manage'),bands=permits(permissions,'bands'),treasury=permits(permissions,'ledger');
  if(!Object.values(permissions).some(level=>level==='view'||level==='manage'))fail('Workspace access is required.',403);
  const h=structuredClone(data.hub||emptyHub()),at=new Date(now).toISOString(),day=financeDay(now);let action='';
  const notifications=[];
  function updateNotifications(){notifications.length=0;
  if((actor.reviewed_at||actor.reviewedAt))notifications.push({id:'approval:'+(actor.reviewed_at||actor.reviewedAt),title:'Your account was approved',at:actor.reviewed_at||actor.reviewedAt,page:'roster'});
  if(bands)for(const p of data.finance?.payouts||[])if(p.userId===actor.id)notifications.push({id:'payout:'+p.id,title:'Payment recorded: $'+(p.amount/100).toLocaleString('en-US'),at:p.at,page:'overview',recordId:p.entryIds[0]});
  if(bands)for(const e of data.finance?.deposits||[])if(e.userId===actor.id&&e.reviewedAt)notifications.push({id:'review:'+e.id,title:'Deposit '+e.status+': '+e.reason,at:e.reviewedAt,page:'overview',recordId:e.id});
  if(bands)for(const r of data.finance?.reversals||[]){const p=data.finance.payouts.find(p=>p.id===r.recordId&&p.userId===actor.id);if(p)notifications.push({id:'reversal:'+r.id,title:'Payment corrected: '+r.reason,at:r.at,page:'overview',recordId:p.entryIds[0]});}
  if(permits(permissions,'requests'))for(const u of users.filter(u=>u.approval==='pending'))notifications.push({id:'request:'+u.id+':'+u.requested_at,title:'Join request: '+u.name,at:u.requested_at||at,page:'requests'});
  if(roster)for(const e of h.events.filter(e=>!e.cancelled&&e.at>=at))notifications.push({id:'event:'+e.id+':'+e.at,title:'Upcoming: '+e.title,at:e.createdAt||e.at,page:'events'});
  }
  updateNotifications();
  function snapshot(){updateNotifications();const read=h.reads[actor.id]||[];return {revision:revision+(action?1:0),day,canManage:manage,canSeeRoster:roster,events:roster?h.events.map(e=>({...e,responses:Object.entries(e.responses).map(([id,response])=>({userId:id,name:users.find(u=>u.id===id)?.name||'Former member',response}))})):[],availability:roster?h.availability.map(a=>({...a,name:users.find(u=>u.id===a.userId)?.name||'Former member'})):[],notes:manage?h.notes:{},members:roster?data.members.map(m=>({id:m.id,userId:m.userId,name:m.name,status:m.status,rank:m.rank,stateId:m.stateId})):[],notifications:notifications.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100).map(n=>({...n,read:read.includes(n.id)})),owner:actor.owner?{pending:users.filter(u=>u.approval==='pending').length,incomplete:users.filter(u=>u.approval==='approved'&&(!u.stateId||!u.phone)).map(u=>({id:u.id,name:u.name})),administrators:users.filter(u=>!u.owner&&u.approval==='approved'&&permits(permissionsFor({roleIds:JSON.parse(u.roles),disabled:!!u.disabled},config),'access','manage')).map(u=>({name:u.name})),bytes:Buffer.byteLength(JSON.stringify({data,users:users.map(u=>({id:u.id,name:u.name,roles:u.roles}))})),limit:1400000}:null};}
  if(route==='/api/hub'&&method==='GET')return {payload:snapshot()};
  if(method!=='POST')return null;
  if(route==='/api/hub/read'){if(!Array.isArray(body.ids)||body.ids.some(id=>!notifications.some(n=>n.id===id)))fail('Choose current notifications.');h.reads[actor.id]=[...new Set([...(h.reads[actor.id]||[]),...body.ids])].slice(-300);action='Notifications marked read';}
  else{
    if(body.revision!==revision)fail('Gang activity changed. Refresh before saving.',409);
    if(route==='/api/hub/events'){
      if(!manage)fail('Roster management is required.',403);if(typeof body.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.id))fail('Invalid event reference.');
      const old=h.events.find(e=>e.id===body.id);
      if(body.cancel){if(!old)fail('Event not found.',404);old.cancelled=true;action='Gang event cancelled: '+old.title;}
      else{const e={id:body.id,title:body.title,at:body.at,location:body.location||'',notes:body.notes||'',createdAt:old?.createdAt||at,by:actor.id,responses:old?.responses||{}};h.events=old?h.events.map(x=>x.id===e.id?e:x):[e,...h.events];action='Gang event saved: '+e.title;}
    }else if(route==='/api/hub/rsvp'){
      if(!roster)fail('Roster access is required.',403);const e=h.events.find(e=>e.id===body.id&&!e.cancelled);if(!e)fail('Event not found.',404);
      const target=body.userId||actor.id;if(target!==actor.id&&!manage||['attended','absent'].includes(body.response)&&!manage)fail('Roster management is required to mark attendance.',403);
      if(!users.some(u=>u.id===target&&u.approval==='approved')||!['yes','maybe','no','attended','absent'].includes(body.response))fail('Invalid attendance response.');
      if(!manage&&['attended','absent'].includes(e.responses[target]))fail('Attendance has been recorded. Ask a roster manager to correct it.',409);
      e.responses[target]=body.response;action='Event response updated: '+e.title;
    }else if(route==='/api/hub/availability'){
      if(!roster)fail('Roster access is required.',403);const target=body.userId||actor.id;if(target!==actor.id&&!manage)fail('You can update only your own availability.',403);
      h.availability=h.availability.filter(a=>a.userId!==target);if(!body.clear)h.availability.push({userId:target,from:body.from,to:body.to,note:body.note||'',at});action='Member availability updated';
    }else if(route==='/api/hub/notes'){
      if(!manage)fail('Leadership notes require roster management.',403);if(!data.members.some(m=>m.id===body.memberId))fail('Member not found.',404);h.notes[body.memberId]=body.note;action='Leadership note updated';
    }else return null;
  }
  validateHub(h);return {nextData:{...data,hub:h},action,payload:snapshot()};
}
