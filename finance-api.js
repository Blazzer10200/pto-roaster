import {createHash} from 'node:crypto';
import {permits} from './access-model.js';
import {depositTotal,outstanding,emptyFinance,validateFinance,weeklyBills,costsFor,financeDay,financeMoney,nextThursday,financeEntries,paidFor,isReversed,cashBalance,validFinanceDay} from './finance-model.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const ratesVersion=bands=>createHash('sha256').update(JSON.stringify(bands)).digest('hex');
const requestId=body=>{if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId))fail('A valid submission ID is required.');return body.requestId;};
const amount=value=>{if(!Number.isSafeInteger(value)||value<0||value>100000000000000)fail('Enter a valid amount.');return value;};
export function financeRequest({route,method,body,data,revision,permissions,actor,users,now=Date.now()}){
  const manage=permits(permissions,'ledger','manage'),viewLedger=permits(permissions,'ledger'),submit=permits(permissions,'bands');
  if(!submit&&!viewLedger)fail('Bands or Ledger access required.',403);
  const finance=structuredClone(data.finance||emptyFinance(now)),at=new Date(now).toISOString();let action=!data.finance?'Finance tracking started from '+finance.startDate:null;
  const name=id=>users.find(u=>u.id===id)?.name||finance.deposits.find(e=>e.userId===id)?.name||'Former member';
  const receipt={at,by:actor.id,byName:actor.name};
  const currentEntries=()=>financeEntries(finance);
  const snapshot=()=>({revision:revision+(action?1:0),day:financeDay(now),ratesVersion:ratesVersion(data.bands),bands:data.bands.filter(b=>b.active),canSubmit:submit,canManage:manage,canViewLedger:viewLedger,owner:!!actor.owner,user:{id:actor.id,name:actor.name,stateId:actor.stateId||''},
    deposits:currentEntries().filter(e=>viewLedger||e.userId===actor.id).map(e=>({...e,name:name(e.userId),identity:(()=>{const u=users.find(u=>u.id===e.userId);return u?{username:u.username,stateId:u.stateId||'',phone:u.phone||''}:null;})()})),
    payouts:finance.payouts.filter(p=>viewLedger||p.userId===actor.id).map(p=>({...p,reversal:(finance.reversals||[]).find(r=>r.recordId===p.id)||null})),
    bills:viewLedger?weeklyBills(finance,now):[],billPayments:viewLedger?finance.bills.map(b=>({...b,reversal:(finance.reversals||[]).find(r=>r.recordId===b.id)||null})):[],startDate:viewLedger?finance.startDate:null,
    requireVerification:!!finance.requireVerification,schedules:viewLedger?finance.schedules||[]:[],cashEnabled:viewLedger?!!finance.cashEnabled:false,cashBalance:viewLedger?cashBalance(finance):null,cashEntries:viewLedger?(finance.cashEntries||[]).map(e=>({...e,reversal:(finance.reversals||[]).find(r=>r.recordId===e.id)||null})):[],
    capacity:actor.owner?{bytes:Buffer.byteLength(JSON.stringify(data)),limit:1400000,deposits:finance.deposits.length,recordLimit:10000}:null});
  const requireManage=()=>{if(!manage)fail('Treasury management is required.',403);};
  const requireOwner=()=>{if(!actor.owner)fail('Only the Owner can make this change.',403);};
  const checkRevision=()=>{if(body.revision!==revision)fail('Records changed. Refresh and review the latest details.',409);};
  const reason=()=>{if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)fail('Give a reason of up to 500 characters.');return body.reason.trim();};
  const cash=(id,kind,value,why)=>{if(finance.cashEnabled)(finance.cashEntries||=[]).unshift({id:'cash-'+id,kind,amount:value,reason:why,...receipt,recordId:id});};
  if(route==='/api/finance'&&method==='GET'){}
  else if(route==='/api/finance/deposits'&&method==='POST'){
    if(!submit)fail('Bands access required to submit a deposit.',403);
    const id=requestId(body),old=finance.deposits.find(e=>e.id===id);
    if(old){if(old.userId!==actor.id||JSON.stringify(old.lines.map(({id,quantity})=>({id,quantity})))!==JSON.stringify(body.lines)||old.notes!==body.notes?.trim())fail('Submission ID already used for different details. Refresh before adding another deposit.',409);return {payload:snapshot()};}
    if(body.userId!==undefined&&body.userId!==actor.id)fail('Deposits must belong to your signed-in account.',403);
    if(body.ratesVersion!==ratesVersion(data.bands))fail('Band prices changed. Refresh rates and review your total before saving.',409);
    if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>100||new Set(body.lines.map(l=>l?.id)).size!==body.lines.length)fail('Choose at least one band quantity.');
    const lines=body.lines.map(l=>{const b=data.bands.find(b=>b.id===l?.id&&b.active);if(!b||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>1000000||b.price<=0)fail('Use whole quantities and bands with a configured price.');return {id:b.id,name:b.name,color:b.color,price:b.price,quantity:l.quantity};});
    if(typeof body.notes!=='string'||body.notes.length>2000)fail('Keep notes within 2,000 characters.');
    finance.deposits.unshift({id,userId:actor.id,name:actor.name,at,lines,notes:body.notes.trim(),status:'pending',requiresVerification:!!finance.requireVerification});
    action='Band deposit submitted: '+actor.name+' — '+financeMoney(lines.reduce((n,l)=>n+l.price*l.quantity,0));
  }else if(route==='/api/finance/payouts'&&method==='POST'){
    requireManage();
    const sameEntries=ids=>Array.isArray(body.expectedEntryIds)&&body.expectedEntryIds.length===ids.length&&new Set(body.expectedEntryIds).size===ids.length&&ids.every(id=>body.expectedEntryIds.includes(id));
    const id=requestId(body),old=finance.payouts.find(p=>p.id===id);
    if(old){if(old.userId!==body.userId||old.amount!==(body.amount??body.expectedOutstanding)||!sameEntries(old.expectedEntryIds||old.entryIds))fail('Payment ID already used.',409);return {payload:snapshot()};}
    const entries=currentEntries().filter(e=>e.userId===body.userId&&e.status==='pending').sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id)),owed=outstanding(entries);
    if(!owed||owed!==body.expectedOutstanding||!sameEntries(entries.map(e=>e.id)))fail('These deposits changed or have already been paid. Refresh and review the current entries and amount.',409);
    if(body.userId===actor.id&&!actor.owner)fail('Another finance manager must confirm your payout.',403);
    if(entries.some(e=>e.requiresVerification&&!e.verified))fail('Verify the submitted bands before confirming payment.',409);
    const value=amount(body.amount??owed);if(value<=0||value>owed)fail('Pay an amount greater than zero and no higher than the outstanding balance.');
    let remaining=value;const allocations=[];for(const e of entries){if(!remaining)break;const applied=Math.min(remaining,e.remaining);allocations.push({entryId:e.id,amount:applied});remaining-=applied;}
    const pay={id,userId:body.userId,amount:value,entryIds:allocations.map(a=>a.entryId),expectedEntryIds:entries.map(e=>e.id),allocations,...receipt};
    finance.payouts.unshift(pay);for(const e of finance.deposits.filter(e=>e.userId===body.userId&&e.status==='pending'))if(paidFor(finance,e)===depositTotal(e)){e.status='paid';e.payoutId=id;}
    cash(id,'payout',-value,'Member payout: '+name(body.userId));action='Band payout confirmed: '+name(body.userId)+' — '+financeMoney(value)+' across '+allocations.length+' deposits';
  }else if(route.startsWith('/api/finance/deposits/')&&method==='POST'){
    const entry=finance.deposits.find(e=>e.id===route.slice('/api/finance/deposits/'.length));if(!entry)fail('Deposit not found.',404);
    const own=entry.userId===actor.id;
    if(!manage&&!(own&&body.decision==='withdraw'))fail('Treasury management is required to review deposits.',403);
    if(entry.status!=='pending')fail('This deposit was already reviewed or paid.',409);
    if(body.decision==='verify'){requireManage();if(entry.verified)return {payload:snapshot()};entry.verified=receipt;action='Stash verified: '+name(entry.userId)+' — '+financeMoney(depositTotal(entry));}
    else{
      if(!['reject','withdraw'].includes(body.decision))fail('Choose a review action.');
      if(body.decision==='withdraw'&&!own)fail('Only the submitting member can withdraw their deposit.',403);
      if(paidFor(finance,entry)>0)fail('This deposit has a partial payment. Ask the Owner to reverse that payment before correcting it.',409);
      Object.assign(entry,{status:body.decision==='withdraw'?'withdrawn':'rejected',reason:reason(),reviewedAt:at,reviewedBy:actor.id,reviewedByName:actor.name});
      action='Band deposit '+entry.status+': '+name(entry.userId)+' — '+entry.reason;
    }
  }else if(route==='/api/finance/bills'&&method==='POST'){
    requireManage();if(body.kind==='house')fail('House payments are no longer tracked.');const id=requestId(body),bill=weeklyBills(finance,now).find(b=>b.kind===body.kind&&b.dueDate===body.dueDate);
    if(finance.bills.some(b=>b.id===id&&b.kind===body.kind&&b.dueDate===body.dueDate))return {payload:snapshot()};
    if(!bill||bill.status==='paid'||body.dueDate>nextThursday(financeDay(now)))fail('This weekly bill is unavailable or already paid.',409);
    if(body.expectedAmount!==undefined&&body.expectedAmount!==bill.amount)fail('The bill amount changed. Refresh and review it.',409);
    finance.bills.unshift({id,kind:bill.kind,dueDate:bill.dueDate,amount:bill.amount,...receipt});cash(id,'bill',-bill.amount,bill.name+' for '+bill.dueDate);action=bill.name+' paid for '+bill.dueDate+' — '+financeMoney(bill.amount);
  }else if(route==='/api/finance/reversals'&&method==='POST'){
    requireOwner();const id=requestId(body),old=(finance.reversals||[]).find(r=>r.id===id);if(old){if(old.recordId!==body.recordId||old.reason!==body.reason?.trim())fail('Reversal ID already used.',409);return {payload:snapshot()};}
    checkRevision();const original=(body.kind==='payout'?finance.payouts:body.kind==='bill'?finance.bills:body.kind==='cash'?finance.cashEntries||[]:[]).find(e=>e.id===body.recordId);
    if(!original||isReversed(finance,original.id)||body.kind==='cash'&&!['income','expense','reconcile'].includes(original.kind))fail('This record cannot be reversed.',409);
    (finance.reversals||=[]).unshift({id,kind:body.kind,recordId:original.id,reason:reason(),...receipt});
    if(body.kind==='payout')for(const e of finance.deposits.filter(e=>original.entryIds.includes(e.id))){e.status='pending';delete e.payoutId;}
    const linked=(finance.cashEntries||[]).find(e=>e.recordId===original.id);if(body.kind==='cash')cash(id,'reversal',-original.amount,'Reversal: '+body.reason);else if(linked)cash(id,'reversal',-linked.amount,'Reversal: '+body.reason);
    action='Owner reversed '+body.kind+': '+original.id+' — '+body.reason;
  }else if(route==='/api/finance/cash'&&method==='POST'){
    requireManage();const id=requestId(body);if((finance.cashEntries||[]).some(e=>e.id===id)){const old=finance.cashEntries.find(e=>e.id===id);if(old.kind!==body.kind||old.reason!==body.reason?.trim()||old.inputAmount!==body.amount)fail('Cash entry ID already used.',409);return {payload:snapshot()};}
    checkRevision();const value=amount(body.amount),why=reason();if(!['opening','income','expense','reconcile'].includes(body.kind))fail('Choose a cashbook entry type.');
    if(body.kind==='opening'){requireOwner();if(finance.cashEnabled)fail('The cashbook already has an opening balance.',409);finance.cashEnabled=true;}
    else if(!finance.cashEnabled)fail('The Owner needs to set the opening cash balance first.',409);
    if(body.kind==='reconcile')requireOwner();
    const signed=body.kind==='expense'?-value:body.kind==='reconcile'?value-cashBalance(finance):value;
    (finance.cashEntries||=[]).unshift({id,kind:body.kind,inputAmount:value,amount:signed,reason:why,...receipt});action='Cashbook '+body.kind+': '+financeMoney(signed)+' — '+why;
  }else if(route==='/api/finance/settings'&&method==='POST'){
    requireOwner();checkRevision();if(typeof body.requireVerification!=='boolean')fail('Choose whether new deposits require verification.');
    finance.requireVerification=body.requireVerification;
    if(body.startDate!==undefined&&body.startDate!==finance.startDate){if(finance.deposits.length||finance.bills.length)fail('Tracking has already started; its original start date is preserved.');if(!validFinanceDay(body.startDate)||nextThursday(body.startDate)!==body.startDate||body.startDate<'2020-01-01'||body.startDate>nextThursday(financeDay(now)))fail('Choose a valid Thursday tracking start.');finance.startDate=body.startDate;}
    if(body.schedule){const s=body.schedule;if(!validFinanceDay(s.effectiveDate)||nextThursday(s.effectiveDate)!==s.effectiveDate||s.effectiveDate<=financeDay(now)||finance.bills.some(b=>b.dueDate>=s.effectiveDate))fail('Choose a future Thursday after any already-recorded bills.');if(s.house!==undefined&&s.house!==0)fail('House payments are no longer tracked.');amount(s.taxes);if(!s.taxes)fail('The weekly tax amount must be positive.');finance.schedules=[...(finance.schedules||[]).filter(x=>x.effectiveDate!==s.effectiveDate),{effectiveDate:s.effectiveDate,house:0,taxes:s.taxes,...receipt}];}
    action='Finance settings updated; historical rates and payments preserved';
  }else return null;
  validateFinance(finance);
  return {payload:snapshot(),...(action?{nextData:{...data,finance},action}:{})};
}
