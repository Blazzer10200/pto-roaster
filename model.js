export const cents = value => Math.round(Number(value) * 100);
export const total = purchase => purchase.lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
export const paid = purchase => purchase.payments.reduce((sum, payment) => sum + payment.amount, 0);
export const balance = purchase => total(purchase) - paid(purchase);
export function validatePurchase(purchase) {
  if (purchase.kind !== undefined && !['purchase', 'dropoff'].includes(purchase.kind)) throw new Error('Choose a purchase or a drop-off.');
  if (!purchase.contactId || !purchase.lines.length) throw new Error('Choose a contact and enter at least one quantity.');
  for (const line of purchase.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.price) || line.price <= 0) throw new Error('Quantities must be whole numbers and prices must be greater than zero.');
  }
  if (!Number.isSafeInteger(total(purchase)) || total(purchase) > 100000000000000) throw new Error('This purchase exceeds the supported amount.');
  for (const payment of purchase.payments) if (!Number.isSafeInteger(payment.amount) || payment.amount < 0) throw new Error('Enter a valid payment.');
  if (paid(purchase) > total(purchase)) throw new Error('The amount paid cannot exceed the purchase total.');
  return purchase;
}
export function addPayment(purchase, amount, date, id) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > balance(purchase)) throw new Error('Enter a payment greater than zero and no higher than the remaining balance.');
  return { ...purchase, payments: [...purchase.payments, { id, amount, date }] };
}
export function contactBalance(purchases, contactId) {
  return purchases.filter(p => p.contactId === contactId).reduce((sum, p) => sum + balance(p), 0);
}
export function payContact(purchases, contactId, amount, date, paymentId) {
  const owed = contactBalance(purchases, contactId);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > owed) throw new Error('Enter a payment greater than zero and no higher than this contact’s balance.');
  const open = purchases.filter(p => p.contactId === contactId && balance(p) > 0)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  let remaining = amount;
  const updates = new Map();
  for (const purchase of open) {
    if (remaining === 0) break;
    const applied = Math.min(remaining, balance(purchase));
    updates.set(purchase.id, addPayment(purchase, applied, date, paymentId + ':' + purchase.id));
    remaining -= applied;
  }
  return purchases.map(p => updates.get(p.id) || p);
}
export const defaultRanks = ['Leader','Underboss','Enforcer','Member','Prospect'];
export function rosterCounts(members, limit=0) {
  const current=members.filter(m=>m.status!=='archived');
  return {total:current.length,active:current.filter(m=>m.status==='active').length,inactive:current.filter(m=>m.status==='inactive').length,archived:members.length-current.length,open:limit?Math.max(0,limit-current.length):null};
}
export function validateBackup(data) {
  if (!data || data.version !== 1 || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 40 || !Array.isArray(data.bands) || !Array.isArray(data.contacts) || !Array.isArray(data.purchases)) throw new Error('This is not a valid PTO Roaster backup.');
  const ids = new Set();
  const identity = item => { if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Invalid or duplicate record ID.'); ids.add(item.id); };
  for (const band of data.bands) {
    identity(band);
    if (typeof band.name !== 'string' || !band.name.trim() || band.name.length > 40 || !/^#[0-9a-f]{6}$/i.test(band.color) || !Number.isSafeInteger(band.price) || band.price < 0 || band.price > 100000000000 || typeof band.active !== 'boolean') throw new Error('Invalid band settings.');
  }
  for (const contact of data.contacts) { identity(contact); if (typeof contact.name !== 'string' || !contact.name.trim() || contact.name.length > 60 || typeof contact.notes !== 'string' || contact.notes.length > 2000) throw new Error('Invalid contact.'); }
  for (const purchase of data.purchases) {
    identity(purchase);
    if (!data.contacts.some(c => c.id === purchase.contactId) || !Array.isArray(purchase.lines) || !Array.isArray(purchase.payments) || !Number.isFinite(Date.parse(purchase.date)) || typeof purchase.notes !== 'string') throw new Error('Invalid purchase record.');
    for (const line of purchase.lines) if (typeof line.name !== 'string' || !/^#[0-9a-f]{6}$/i.test(line.color)) throw new Error('Invalid purchase item.');
    for (const payment of purchase.payments) if (!Number.isFinite(Date.parse(payment.date))) throw new Error('Invalid payment date.');
    validatePurchase(purchase);
  }
  const members=data.members ?? [],ranks=data.ranks ?? [...defaultRanks],rosterLimit=data.rosterLimit ?? 0,gangNotes=data.gangNotes ?? '';
  if(!Array.isArray(members)||members.length>2000||!Array.isArray(ranks)||!ranks.length||ranks.length>30||ranks.some(r=>typeof r!=='string'||!r.trim()||r.length>40)||new Set(ranks).size!==ranks.length) throw new Error('Check the roster and rank names.');
  if(!Number.isSafeInteger(rosterLimit)||rosterLimit<0||rosterLimit>2000||typeof gangNotes!=='string'||gangNotes.length>4000) throw new Error('Check the roster limit and gang notes.');
  for(const member of members) {
    identity(member);
    if(typeof member.name!=='string'||!member.name.trim()||member.name.length>60||typeof member.rank!=='string'||!member.rank.trim()||member.rank.length>40||!['active','inactive','archived'].includes(member.status)||typeof member.callsign!=='string'||member.callsign.length>40||typeof member.notes!=='string'||member.notes.length>2000||!/^\d{4}-\d{2}-\d{2}$/.test(member.joined)||!Number.isFinite(Date.parse(member.joined))) throw new Error('Check member name, rank, status, and joined date.');
  }
  return {...data,members,ranks,rosterLimit,gangNotes};
}
export function freshData(demo = false) {
  const bands = [ ['Loose change', '#c2c9b5', 1], ['White band', '#e4e5e0', 100], ['Blue band', '#82aef5', 500], ['Purple band', '#ba98e4', 1000], ['Brown band', '#b28b6f', 5000] ].map(([name,color,price],i) => ({id:'band-'+i,name,color,price:demo ? price*100 : 0,active:true}));
  const data = { version:1, name:'PTO Roaster', bands, contacts:[], purchases:[],members:[],ranks:[...defaultRanks],rosterLimit:0,gangNotes:'' };
  if (!demo) return data;
  data.contacts = [{id:'c1',name:'Marcus Reed',notes:'Usually around in the evenings.'},{id:'c2',name:'Nico Vega',notes:''},{id:'c3',name:'Alex Carter',notes:'Prefers one payment per pickup.'},{id:'c4',name:'Jordan Blake',notes:''}];
  data.members=data.contacts.map((c,i)=>({id:'member-demo-'+i,name:c.name,callsign:['PTO-01','PTO-02','PTO-03','PTO-04'][i],rank:['Leader','Enforcer','Member','Prospect'][i],status:i===2?'inactive':'active',joined:new Date().toISOString().slice(0,10),notes:i===2?'Away this week.':'Sample roster member.'}));
  data.rosterLimit=20;
  data.gangNotes='Keep your rank and availability up to date. Add meeting reminders and shared notes here.';
  const specs = [['c1',2,24,6000,0],['c2',3,18,18000,0],['c3',4,8,25000,1],['c4',1,65,6500,2],['c1',3,12,12000,3],['c2',2,40,10000,5]];
  data.purchases = specs.map(([contactId,b,q,p,days],i) => {const date=new Date();date.setDate(date.getDate()-days);date.setHours(14-i,20,0,0);return {id:'demo-'+i,contactId,date:date.toISOString(),notes:'Sample purchase — for preview only.',lines:[{...bands[b],quantity:q}],payments:[{id:'dp-'+i,amount:p*100,date:date.toISOString()}]};});
  return data;
}
