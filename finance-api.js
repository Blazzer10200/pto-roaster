import {createHash} from 'node:crypto';
import {permits} from './access-model.js';
import {depositTotal,outstanding,emptyFinance,validateFinance,weeklyBills,weeklyCosts,financeDay,financeMoney,nextThursday} from './finance-model.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const ratesVersion=bands=>createHash('sha256').update(JSON.stringify(bands)).digest('hex');
const requestId=body=>{if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId))fail('A valid submission ID is required.');return body.requestId;};
export function financeRequest({route,method,body,data,revision,permissions,actor,users,now=Date.now()}){
  const manage=permits(permissions,'ledger','manage'),viewLedger=permits(permissions,'ledger'),submit=permits(permissions,'bands');
  if(!submit&&!viewLedger)fail('Bands or Ledger access required.',403);
  const finance=structuredClone(data.finance||emptyFinance(now)),at=new Date(now).toISOString();let action=!data.finance?'Finance tracking started from '+finance.startDate:null;
  const name=id=>users.find(u=>u.id===id)?.name||finance.deposits.find(e=>e.userId===id)?.name||'Former member';
  const snapshot=()=>({revision:revision+(action?1:0),day:financeDay(now),ratesVersion:ratesVersion(data.bands),bands:data.bands.filter(b=>b.active),canSubmit:submit,canManage:manage,canViewLedger:viewLedger,user:{id:actor.id,name:actor.name,stateId:actor.stateId||''},deposits:finance.deposits.filter(e=>viewLedger||e.userId===actor.id).map(e=>({...e,name:name(e.userId)})),payouts:finance.payouts.filter(p=>viewLedger||p.userId===actor.id),bills:viewLedger?weeklyBills(finance,now):[],startDate:viewLedger?finance.startDate:null});
  if(route==='/api/finance'&&method==='GET'){}
  else if(route==='/api/finance/deposits'&&method==='POST'){
    if(!submit)fail('Bands access required to submit a deposit.',403);
    const id=requestId(body),old=finance.deposits.find(e=>e.id===id);
    if(old){if(old.userId!==actor.id||JSON.stringify(old.lines.map(({id,quantity})=>({id,quantity})))!==JSON.stringify(body.lines)||old.notes!==body.notes?.trim())fail('Submission ID already used for different details. Refresh before adding another deposit.',409);return {payload:snapshot()};}
    if(body.userId!==undefined&&body.userId!==actor.id)fail('Deposits must belong to your signed-in account.',403);
    if(body.ratesVersion!==ratesVersion(data.bands))fail('Band prices changed. Refresh the form and check the new total before saving.',409);
    if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>100||new Set(body.lines.map(l=>l?.id)).size!==body.lines.length)fail('Choose at least one band quantity.');
    const lines=body.lines.map(l=>{const b=data.bands.find(b=>b.id===l?.id&&b.active);if(!b||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>1000000||b.price<=0)fail('Use whole quantities and bands with a configured price.');return {id:b.id,name:b.name,color:b.color,price:b.price,quantity:l.quantity};});
    if(typeof body.notes!=='string'||body.notes.length>2000)fail('Keep notes within 2,000 characters.');
    const entry={id,userId:actor.id,name:actor.name,at,lines,notes:body.notes.trim(),status:'pending'};finance.deposits.unshift(entry);action='Band deposit submitted: '+actor.name+' — '+financeMoney(depositTotal(entry));
  }else if(route==='/api/finance/payouts'&&method==='POST'){
    if(!manage)fail('Ledger management is required to confirm payment.',403);
    const sameEntries=ids=>Array.isArray(body.expectedEntryIds)&&body.expectedEntryIds.length===ids.length&&new Set(body.expectedEntryIds).size===ids.length&&ids.every(id=>body.expectedEntryIds.includes(id));
    const id=requestId(body),old=finance.payouts.find(p=>p.id===id);if(old){if(old.userId!==body.userId||old.amount!==body.expectedOutstanding||!sameEntries(old.entryIds))fail('Payment ID already used.',409);return {payload:snapshot()};}
    const entries=finance.deposits.filter(e=>e.userId===body.userId&&e.status==='pending'),amount=outstanding(entries);
    if(!amount||amount!==body.expectedOutstanding||!sameEntries(entries.map(e=>e.id)))fail('These deposits changed or have already been paid. Refresh and review the current entries and amount.',409);
    if(body.userId===actor.id&&!actor.owner)fail('Another finance manager must confirm your payout.',403);
    finance.payouts.unshift({id,userId:body.userId,amount,entryIds:entries.map(e=>e.id),at,by:actor.id,byName:actor.name});for(const entry of entries){entry.status='paid';entry.payoutId=id;}
    action='Band payout confirmed: '+name(body.userId)+' — '+financeMoney(amount)+' across '+entries.length+' deposits';
  }else if(route.startsWith('/api/finance/deposits/')&&method==='POST'){
    if(!manage)fail('Ledger management is required to review deposits.',403);
    const entry=finance.deposits.find(e=>e.id===route.slice('/api/finance/deposits/'.length));if(!entry)fail('Deposit not found.',404);
    if(entry.status!=='pending')fail('This deposit was already reviewed or paid.',409);
    if(body.decision!=='reject'||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)fail('Give a reason for rejecting this deposit.');
    Object.assign(entry,{status:'rejected',reason:body.reason.trim(),reviewedAt:at,reviewedBy:actor.id,reviewedByName:actor.name});action='Band deposit rejected: '+name(entry.userId)+' — '+entry.reason;
  }else if(route==='/api/finance/bills'&&method==='POST'){
    if(!manage)fail('Ledger management is required to confirm a weekly payment.',403);
    const id=requestId(body),cost=weeklyCosts.find(c=>c.id===body.kind),bill=weeklyBills(finance,now).find(b=>b.kind===body.kind&&b.dueDate===body.dueDate);
    if(finance.bills.some(b=>b.id===id&&b.kind===body.kind&&b.dueDate===body.dueDate))return {payload:snapshot()};
    if(!cost||!bill||bill.status==='paid'||body.dueDate>nextThursday(financeDay(now)))fail('This weekly bill is unavailable or already paid.',409);
    finance.bills.unshift({id,kind:cost.id,dueDate:body.dueDate,amount:cost.amount,at,by:actor.id,byName:actor.name});action=cost.name+' paid for '+body.dueDate+' — '+financeMoney(cost.amount);
  }else return null;
  validateFinance(finance);
  return {payload:snapshot(),...(action?{nextData:{...data,finance},action}: {})};
}
