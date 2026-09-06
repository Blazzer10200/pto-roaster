export const financeMoney=value=>'$'+(value/100).toLocaleString('en-US',{maximumFractionDigits:2});
export const financeDay=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export const validFinanceDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export const nextThursday=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(4-d.getUTCDay()+7)%7);return d.toISOString().slice(0,10);};
export const depositTotal=entry=>entry.lines.reduce((sum,line)=>sum+line.quantity*line.price,0);
export const outstanding=entries=>entries.filter(e=>e.status==='pending').reduce((sum,e)=>sum+(e.remaining??depositTotal(e)),0);
export const isReversed=(finance,id)=>(finance.reversals||[]).some(r=>r.recordId===id);
export function paidFor(finance,entry){
  return finance.payouts.filter(p=>!isReversed(finance,p.id)).reduce((sum,p)=>sum+(p.allocations?p.allocations.filter(a=>a.entryId===entry.id).reduce((n,a)=>n+a.amount,0):p.entryIds.includes(entry.id)?depositTotal(entry):0),0);
}
export function financeEntries(finance){return finance.deposits.map(e=>({...e,paidAmount:paidFor(finance,e),remaining:e.status==='pending'?depositTotal(e)-paidFor(finance,e):0}));}
export const cashBalance=finance=>(finance.cashEntries||[]).reduce((n,e)=>n+e.amount,0);
export function stashBreakdown(entries){
  const bands=new Map();for(const e of entries.filter(e=>e.status==='pending'))for(const line of e.lines){const b=bands.get(line.id)||{id:line.id,name:line.name,color:line.color,quantity:0,amount:0};b.quantity+=line.quantity;b.amount+=line.quantity*line.price;bands.set(line.id,b);}return [...bands.values()];
}
export const emptyFinance=(now=Date.now())=>({version:1,startDate:nextThursday(financeDay(now)),deposits:[],payouts:[],bills:[]});
export const weeklyCosts=[{id:'house',name:'Gang house',amount:500000},{id:'taxes',name:'Gang taxes',amount:500000}];
export function costsFor(finance,day){const schedule=(finance.schedules||[]).filter(s=>s.effectiveDate<=day).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0];return weeklyCosts.map(c=>({...c,amount:schedule?schedule[c.id]:c.amount}));}
export function weeklyBills(finance,now=Date.now()){
  const today=financeDay(now),end=nextThursday(today),rows=[];
  for(let due=finance.startDate;due<=end;){
    for(const cost of costsFor(finance,due)){const paid=finance.bills.find(b=>b.dueDate===due&&b.kind===cost.id&&!isReversed(finance,b.id));rows.push({...cost,kind:cost.id,dueDate:due,...(paid||{}),status:paid?'paid':due<today?'overdue':due===today?'due':'upcoming'});}
    const date=new Date(due+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+7);due=date.toISOString().slice(0,10);
  }return rows;
}
export function validateFinance(finance){
  const f=finance,text=(v,max=100)=>typeof v==='string'&&v.trim().length>0&&v.length<=max,date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v)),money=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000000000;
  if(!f||f.version!==1||!validFinanceDay(f.startDate)||nextThursday(f.startDate)!==f.startDate||!['deposits','payouts','bills'].every(k=>Array.isArray(f[k])&&f[k].length<=10000))throw Error('Invalid finance records.');
  const ids=new Set(),identity=x=>{if(!x||!text(x.id)||ids.has(x.id))throw Error('Duplicate or invalid finance record.');ids.add(x.id);};
  for(const key of ['reversals','cashEntries','schedules'])if(f[key]!==undefined&&(!Array.isArray(f[key])||f[key].length>10000))throw Error('Invalid finance history.');
  if(f.requireVerification!==undefined&&typeof f.requireVerification!=='boolean'||f.cashEnabled!==undefined&&typeof f.cashEnabled!=='boolean')throw Error('Invalid finance settings.');
  const reversed=new Set();
  for(const r of f.reversals||[]){identity(r);if(!['payout','bill','cash'].includes(r.kind)||!text(r.recordId)||reversed.has(r.recordId)||!text(r.reason,500)||!text(r.by)||!text(r.byName,60)||!date(r.at))throw Error('Invalid reversal.');reversed.add(r.recordId);}
  for(const e of f.deposits){
    identity(e);if(!text(e.userId)||!text(e.name,60)||!date(e.at)||!['pending','paid','rejected','withdrawn'].includes(e.status)||typeof e.notes!=='string'||e.notes.length>2000||!Array.isArray(e.lines)||!e.lines.length||e.lines.length>100)throw Error('Invalid deposit.');
    for(const l of e.lines)if(!text(l.id)||!text(l.name,40)||!/^#[0-9a-f]{6}$/i.test(l.color)||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>1000000||!money(l.price)||l.price<=0)throw Error('Invalid deposit quantity or rate.');
    if(new Set(e.lines.map(l=>l.id)).size!==e.lines.length||!money(depositTotal(e)))throw Error('Deposit exceeds the supported amount.');
    if(['rejected','withdrawn'].includes(e.status)&&(!text(e.reason,500)||!text(e.reviewedBy)||!text(e.reviewedByName,60)||!date(e.reviewedAt)))throw Error('Deposit review is missing.');
    if(e.verified&&(!text(e.verified.by)||!text(e.verified.byName,60)||!date(e.verified.at)))throw Error('Invalid verification.');
    if(e.requiresVerification!==undefined&&typeof e.requiresVerification!=='boolean')throw Error('Invalid verification requirement.');
  }
  for(const p of f.payouts){
    identity(p);if(!text(p.userId)||!text(p.by)||!text(p.byName,60)||!date(p.at)||!money(p.amount)||p.amount<=0||!Array.isArray(p.entryIds)||!p.entryIds.length||new Set(p.entryIds).size!==p.entryIds.length)throw Error('Invalid payout.');
    const entries=p.entryIds.map(id=>f.deposits.find(e=>e.id===id&&e.userId===p.userId));if(entries.some(e=>!e))throw Error('Payout does not match the paid deposits.');
    if(p.allocations){if(!Array.isArray(p.allocations)||p.allocations.length!==p.entryIds.length||new Set(p.allocations.map(a=>a.entryId)).size!==p.allocations.length||p.allocations.some(a=>!p.entryIds.includes(a.entryId)||!money(a.amount)||a.amount<=0)||p.allocations.reduce((n,a)=>n+a.amount,0)!==p.amount)throw Error('Invalid payout allocations.');}
    else if(entries.reduce((n,e)=>n+depositTotal(e),0)!==p.amount)throw Error('Payout does not match the paid deposits.');
  }
  for(const e of f.deposits){const paid=paidFor(f,e),total=depositTotal(e);if(paid>total||e.status==='paid'&&paid!==total||e.status==='pending'&&paid>=total||['withdrawn','rejected'].includes(e.status)&&paid)throw Error('Deposit balance does not match its payment history.');}
  if(!money(f.deposits.reduce((n,e)=>n+depositTotal(e),0)))throw Error('Finance records exceed the supported total.');
  const dates=new Set();for(const s of f.schedules||[]){if(!validFinanceDay(s.effectiveDate)||nextThursday(s.effectiveDate)!==s.effectiveDate||dates.has(s.effectiveDate)||!money(s.house)||!money(s.taxes)||s.house+s.taxes<=0)throw Error('Invalid weekly schedule.');dates.add(s.effectiveDate);}
  const bills=new Set();for(const b of f.bills){identity(b);const key=b.kind+':'+b.dueDate;if(!isReversed(f,b.id)){if(bills.has(key))throw Error('Duplicate weekly payment.');bills.add(key);}if(!costsFor(f,b.dueDate).some(c=>c.id===b.kind&&c.amount===b.amount)||!validFinanceDay(b.dueDate)||b.dueDate<f.startDate||nextThursday(b.dueDate)!==b.dueDate||!date(b.at)||!text(b.by)||!text(b.byName,60))throw Error('Invalid weekly payment.');}
  for(const e of f.cashEntries||[]){identity(e);if(!Number.isSafeInteger(e.amount)||Math.abs(e.amount)>100000000000000||!['opening','income','expense','reconcile','payout','bill','reversal'].includes(e.kind)||!text(e.reason,500)||!text(e.by)||!text(e.byName,60)||!date(e.at))throw Error('Invalid cashbook entry.');}
  if(!Number.isSafeInteger(cashBalance(f)))throw Error('Cashbook exceeds supported balance.');
  for(const r of f.reversals||[])if(!(r.kind==='payout'?f.payouts:r.kind==='bill'?f.bills:f.cashEntries||[]).some(e=>e.id===r.recordId))throw Error('Original record missing from reversal.');
  return f;
}
