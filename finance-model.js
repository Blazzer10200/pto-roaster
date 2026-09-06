export const financeMoney=value=>'$'+(value/100).toLocaleString('en-US',{maximumFractionDigits:2});
export const financeDay=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export const nextThursday=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(4-d.getUTCDay()+7)%7);return d.toISOString().slice(0,10);};
export const depositTotal=entry=>entry.lines.reduce((sum,line)=>sum+line.quantity*line.price,0);
export const outstanding=entries=>entries.filter(e=>e.status==='pending').reduce((sum,e)=>sum+depositTotal(e),0);
export const emptyFinance=(now=Date.now())=>({version:1,startDate:nextThursday(financeDay(now)),deposits:[],payouts:[],bills:[]});
export const weeklyCosts=[{id:'house',name:'Gang house',amount:500000},{id:'taxes',name:'Gang taxes',amount:500000}];
export function weeklyBills(finance,now=Date.now()){
  const today=financeDay(now),end=nextThursday(today),rows=[];
  for(let due=finance.startDate;due<=end;){
    for(const cost of weeklyCosts){const paid=finance.bills.find(b=>b.dueDate===due&&b.kind===cost.id);rows.push({...cost,kind:cost.id,dueDate:due,...(paid||{}),status:paid?'paid':due<today?'overdue':due===today?'due':'upcoming'});}
    const date=new Date(due+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+7);due=date.toISOString().slice(0,10);
  }
  return rows;
}
export function validateFinance(finance){
  if(!finance||finance.version!==1||!validDay(finance.startDate)||new Date(finance.startDate+'T12:00:00Z').getUTCDay()!==4||!Array.isArray(finance.deposits)||!Array.isArray(finance.payouts)||!Array.isArray(finance.bills)||finance.deposits.length>10000||finance.payouts.length>10000||finance.bills.length>10000)throw Error('Invalid finance records.');
  const ids=new Set(),text=(v,max=100)=>typeof v==='string'&&v.trim().length>0&&v.length<=max,date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  const identity=x=>{if(!x||!text(x.id)||ids.has(x.id))throw Error('Duplicate or invalid finance record.');ids.add(x.id);};
  for(const p of finance.payouts){identity(p);if(!text(p.userId)||!text(p.by)||!text(p.byName,60)||!date(p.at)||!Number.isSafeInteger(p.amount)||p.amount<=0||!Array.isArray(p.entryIds)||!p.entryIds.length||new Set(p.entryIds).size!==p.entryIds.length)throw Error('Invalid payout.');}
  for(const e of finance.deposits){
    identity(e);if(!text(e.userId)||!text(e.name,60)||!date(e.at)||!['pending','paid','rejected'].includes(e.status)||typeof e.notes!=='string'||e.notes.length>2000||!Array.isArray(e.lines)||!e.lines.length||e.lines.length>100)throw Error('Invalid deposit.');
    for(const l of e.lines)if(!text(l.id)||!text(l.name,40)||!/^#[0-9a-f]{6}$/i.test(l.color)||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>1000000||!Number.isSafeInteger(l.price)||l.price<=0)throw Error('Invalid deposit quantity or rate.');
    if(new Set(e.lines.map(l=>l.id)).size!==e.lines.length||!Number.isSafeInteger(depositTotal(e))||depositTotal(e)>100000000000000)throw Error('Deposit exceeds the supported amount.');
    if(e.status==='paid'&&!finance.payouts.some(p=>p.id===e.payoutId&&p.userId===e.userId&&p.entryIds.includes(e.id)))throw Error('Deposit payment is missing.');
    if(e.status==='rejected'&&(!text(e.reason,500)||!text(e.reviewedBy)||!text(e.reviewedByName,60)||!date(e.reviewedAt)))throw Error('Deposit review is missing.');
  }
  const accumulated=finance.deposits.reduce((n,e)=>n+depositTotal(e),0);if(!Number.isSafeInteger(accumulated)||accumulated>100000000000000)throw Error('Finance records exceed the supported total.');
  for(const p of finance.payouts){const entries=p.entryIds.map(id=>finance.deposits.find(e=>e.id===id&&e.payoutId===p.id&&e.userId===p.userId&&e.status==='paid'));if(entries.some(e=>!e)||entries.reduce((n,e)=>n+depositTotal(e),0)!==p.amount)throw Error('Payout does not match the paid deposits.');}
  const bills=new Set();for(const b of finance.bills){identity(b);const key=b.kind+':'+b.dueDate;if(bills.has(key)||!weeklyCosts.some(c=>c.id===b.kind&&c.amount===b.amount)||!validDay(b.dueDate)||b.dueDate<finance.startDate||new Date(b.dueDate+'T12:00:00Z').getUTCDay()!==4||!date(b.at)||!text(b.by)||!text(b.byName,60))throw Error('Invalid weekly payment.');bills.add(key);}
  return finance;
}
