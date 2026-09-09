import {accessPages} from './access-model.js';
export const onlineWindowMs=120000;
// Shared member list exposes only roster labels and a coarse activity flag.
export function memberPresence(sessions,users,data,now=Date.now()){
  const active=new Set(onlineUsers(sessions,users,now).map(u=>u.id));
  const approved=users.filter(u=>!u.disabled&&u.approval==='approved');
  const linked=new Set((data.members||[]).map(m=>m.userId).filter(Boolean));
  const members=[];
  for(const member of data.members||[]){
    if(member.status==='archived')continue;
    const user=approved.find(u=>u.id===member.userId);
    if(member.userId&&!user)continue;
    members.push({id:member.id,name:user?.name||member.name,rank:member.rank,online:!!user&&active.has(user.id),hasAccount:!!user});
  }
  for(const user of approved.filter(u=>!linked.has(u.id)))members.push({id:user.id,name:user.name,rank:user.owner?'Owner':'Member',online:active.has(user.id),hasAccount:true});
  return {members,ranks:[...new Set(['Owner',...(data.ranks||[]),'Member'])],onlineWindowSeconds:onlineWindowMs/1000};
}
export function onlineUsers(sessions,users,now=Date.now()){
  const latest=new Map();
  for(const session of sessions){
    if(session.expires<=now||!Number.isFinite(session.last_seen)||session.last_seen<now-onlineWindowMs)continue;
    const user=users.find(u=>u.id===session.user_id&&!u.disabled&&u.approval==='approved');if(!user)continue;
    if((latest.get(user.id)?.lastSeen||0)>=session.last_seen)continue;
    latest.set(user.id,{id:user.id,name:user.name,username:user.username,owner:!!user.owner,page:accessPages.find(p=>p.id===session.page)?.name||'Workspace',lastSeen:session.last_seen});
  }
  return [...latest.values()].sort((a,b)=>b.lastSeen-a.lastSeen);
}
