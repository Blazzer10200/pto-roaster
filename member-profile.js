import {validateBackup} from './model.js';
import {permits} from './access-model.js';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const fieldLabels={name:'character name',username:'username',stateId:'State ID',phone:'phone',rank:'gang rank',status:'roster status',joined:'joined date',notes:'notes'};
const changedFields=(before,after)=>Object.entries(fieldLabels).filter(([key])=>(before[key]??'')!==(after[key]??'')).map(([,label])=>label).join(', ')||'no field changes';
export const profileOf=user=>({name:user.name,username:user.username,stateId:user.stateId||'',phone:user.phone||'',profileRevision:user.profileRevision||0});
export function profileFields(body,{required=true}={}){
  const name=typeof body.name==='string'?body.name.trim():'',username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
  const stateId=typeof body.stateId==='string'?body.stateId.trim():'',phone=typeof body.phone==='string'?body.phone.trim():'';
  if(!name||name.length>60||!/^[a-z0-9_.-]{3,32}$/.test(username))fail('Enter a character name and a username of 3–32 letters, numbers, dots, underscores, or hyphens.');
  if((required||stateId)&&!/^\d{5}$/.test(stateId))fail('State ID must be exactly five digits.');
  if((required||phone)&&(!/^[+\d() .-]{3,30}$/.test(phone)||!/[0-9]{3}/.test(phone.replace(/\D/g,''))))fail('Enter an in-game phone number using 3–30 digits and phone punctuation.');
  return {name,username,stateId,phone};
}
export function uniqueProfile(users,profile,id){
  if(users.some(u=>u.id!==id&&(u.username.toLowerCase()===profile.username||u.email===profile.username)))fail('That username is already taken.',409);
  if(profile.stateId&&users.some(u=>u.id!==id&&u.stateId===profile.stateId))fail('That State ID is already linked to an account.',409);
}
const requireRevision=(actual,expected,message)=>{if(!Number.isSafeInteger(expected)||expected!==actual)fail(message,409);};
const rosterRevision=(revision,body)=>requireRevision(revision,body.revision,'Roster changed. Close this form and reload the latest records.');
export function updatedProfile(users,target,body={},actor,{review=false}={}){
  if(target.owner&&target.id!==actor.id)fail('Only the Owner can edit their own account details.',403);
  requireRevision(target.profileRevision||0,body.profileRevision,'Account details changed. Reopen the profile before saving.');
  const fields=profileFields(body);
  if(review&&(fields.name!==target.name||fields.username!==target.username))fail('An account administrator must edit the character name or username before approval.',403);
  uniqueProfile(users,fields,target.id);
  return {...target,...fields,profileRevision:(target.profileRevision||0)+1};
}
export function syncProfile(data,user){
  return validateBackup({...data,members:data.members.map(m=>m.userId===user.id?{...m,...profileOf(user)}:m)});
}
export function attachMember(data,users,user,body,revision){
  rosterRevision(revision,body);
  if(user.disabled||user.approval!=='approved')fail('Choose an approved, enabled account.');
  if(data.members.some(m=>m.userId===user.id))fail('This account already has a roster profile. Open that member to edit or restore it.',409);
  // Older accounts may have blank contact fields until an administrator completes them.
  profileFields(profileOf(user),{required:false});
  const old=body.memberId?data.members.find(m=>m.id===body.memberId):null;
  if(body.memberId&&(!old||old.userId))fail('That roster entry is unavailable or already linked.',409);
  const rank=old?.rank||body.rank;
  if(!old&&!data.ranks.includes(rank))fail('Choose a current gang rank.');
  const member={...(old||{id:crypto.randomUUID(),rank,status:'active',joined:body.joined||new Date().toISOString().slice(0,10),notes:''}),...profileOf(user),userId:user.id};
  const next=validateBackup({...data,members:old?data.members.map(m=>m.id===old.id?member:m):[...data.members,member]});
  return next;
}
export function assertLinkedMembers(current,next,users){
  for(const old of current.members)if(old.userId&&!next.members.some(m=>m.id===old.id&&m.userId===old.userId))fail('Use Remove from roster in member management to remove a linked member.',403);
  for(const m of next.members){
    const old=current.members.find(x=>x.id===m.id);
    if(m.userId){
      const user=users.find(u=>u.id===m.userId);
      if(!old||old.userId!==m.userId||!user||Object.entries(profileOf(user)).some(([key,value])=>(m[key]??(key==='profileRevision'?0:''))!==value))fail('Edit linked account details through the member profile.',403);
    }else if(!old)fail('Invite a member or add an existing account to the roster.',403);
  }
}

// Shared by SQLite and D1. Return a complete proposal before either backend writes.
export function memberRequest({route,method,body,users,data,revision,permissions,actor}){
  if(route.startsWith('/api/users/')&&method==='DELETE'){
    if(!permits(permissions,'access','manage'))fail('Account administration permission required.',403);
    const target=users.find(u=>u.id===route.slice('/api/users/'.length));if(!target)fail('Account not found.',404);
    if(target.owner||target.id===actor.id)fail('The Owner and your own account cannot be deleted.',403);
    rosterRevision(revision,body);requireRevision(target.profileRevision||0,body.profileRevision,'Account details changed. Reopen the account before deleting.');
    if(body.username!==target.username)fail('Type the exact username to confirm deletion.');
    if(data.finance?.deposits.some(e=>e.userId===target.id&&e.status==='pending'))fail('Settle or reject this account’s pending deposits in the finance ledger before deleting it.',409);
    const nextData=validateBackup({...data,members:data.members.filter(m=>m.userId!==target.id)});
    return {deletedUser:target.id,nextData,payload:{ok:true},action:'Account deleted: '+target.name+' (@'+target.username+'); linked roster removed; finance history retained'};
  }
  if(route.startsWith('/api/members/')&&method==='DELETE'){
    if(!permits(permissions,'roster','manage'))fail('Roster management permission required.',403);
    rosterRevision(revision,body);
    const target=data.members.find(m=>m.id===route.slice('/api/members/'.length));if(!target)fail('Member not found.',404);
    return {nextData:validateBackup({...data,members:data.members.filter(m=>m.id!==target.id)}),payload:{ok:true},action:'Removed from roster: '+target.name+'; website account and finance history retained'};
  }
  if(route==='/api/profiles'&&method==='GET'){
    if(!permits(permissions,'roster','manage')&&!permits(permissions,'access','manage'))fail('Member management permission required.',403);
    return {payload:{users:users.filter(u=>u.approval==='approved').map(u=>({id:u.id,...profileOf(u),owner:!!u.owner,disabled:!!u.disabled,memberId:data.members.find(m=>m.userId===u.id)?.id||null})),revision}};
  }
  if(route.startsWith('/api/profiles/')&&method==='PUT'){
    if(!permits(permissions,'access','manage'))fail('Account administration permission required to edit identity details.',403);
    const target=users.find(u=>u.id===route.slice('/api/profiles/'.length));if(!target)fail('Account not found.',404);
    const user=updatedProfile(users,target,body,actor),nextData=syncProfile(data,user);
    return {user,nextData,payload:{ok:true,profile:profileOf(user)},action:'Member account details updated: '+user.name+' — '+changedFields(target,user)};
  }
  if(route==='/api/members'&&method==='POST'){
    if(!permits(permissions,'roster','manage'))fail('Roster management permission required.',403);
    const user=users.find(u=>u.id===body.userId);if(!user)fail('Account not found.',404);
    requireRevision(user.profileRevision||0,body.profileRevision,'Account details changed. Reopen the account picker.');
    const nextData=attachMember(data,users,user,body,revision);
    return {nextData,payload:{ok:true},action:'Account linked to roster: '+user.name+' — '+(body.memberId?'existing profile '+body.memberId:'new profile, rank '+body.rank)};
  }
  if(route.startsWith('/api/members/')&&method==='PUT'){
    if(!permits(permissions,'roster','manage'))fail('Roster management permission required.',403);
    rosterRevision(revision,body);
    const member=data.members.find(m=>m.id===route.slice('/api/members/'.length));if(!member)fail('Member not found.',404);
    let user,identity={};
    if(member.userId){
      const target=users.find(u=>u.id===member.userId);if(!target)fail('Linked account not found.',409);
      if(body.profile){
        if(!permits(permissions,'access','manage'))fail('Account administration permission required to edit identity details.',403);
        user=updatedProfile(users,target,body.profile,actor);identity=profileOf(user);
      }
    }else{
      const f=body.profile||member;
      identity=profileFields({...f,username:'unlinked'},{required:false});delete identity.username;
    }
    if(body.rank!==member.rank&&!data.ranks.includes(body.rank))fail('Choose a current gang rank.');
    const next={...member,...identity,rank:body.rank,status:body.status,joined:body.joined,notes:body.notes};
    const nextData=validateBackup({...data,members:data.members.map(m=>m.id===member.id?next:m)});
    return {user,nextData,payload:{ok:true},action:'Roster member updated: '+next.name+' — '+changedFields(member,next)};
  }
  return null;
}
