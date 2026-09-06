import {accessPages} from './access-model.js';
export const onlineWindowMs=120000;
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
