import {readIdentity,pickerMarkup,mountProfilePicker} from './profile-ui.js';
import {mountFinance} from './finance-ui.js';
import {financeDay} from './finance-model.js';
import {authRequest,loginScreen,approvalScreen,mountAccess,mountRequests,accountDialog} from './auth-ui.js';
import {securityGate,securityNudge} from './security-ui.js';
import {permits} from './access-model.js';
import {accountMenu,dismissAccountMenu} from './ui-shell.js';
import { rosterPage, rosterRows, memberForm, gangSettings } from './roster.js';
import { CloudLedger } from './cloud.js';
import { mountPlayerPicker } from './player-picker.js';
import { cents, total, paid, balance, validatePurchase, addPayment, validateBackup, freshData, contactBalance, payContact } from './model.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => '$' + (value / 100).toLocaleString('en-US', {maximumFractionDigits:2});
const uid = () => crypto.randomUUID();
const icon = (name, size=20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',plus:'<path d="M12 5v14M5 12h14"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',history:'<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--panel)"/><circle cx="15" cy="17" r="3" fill="var(--panel)"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',down:'<path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/>',wallet:'<path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M20 12h-5v5h5"/>',box:'<path d="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',check:'<path d="m5 12 4 4L19 6"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',chevron:'<path d="m9 5 7 7-7 7"/>',coin:'<circle cx="12" cy="12" r="9"/><path d="M15 8H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9M12 6v12"/>',moon:'<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>'})[name] || ''}</svg>`;
let data=freshData(), loadError = '', cloud=null, saving=false, authSession=null;
let pageDirty=false,syncBusy=false;
const hasOpenModal=()=>!!$('#modal')?.open;
const canApplyRemote=()=>!pageDirty&&!saving&&!hasOpenModal()&&!$('#finance-panel')?.busy;
function syncMessage(message=''){const note=$('#live-sync-note');if(note){note.hidden=!message;note.textContent=message;}}
document.addEventListener('input',event=>{if(event.target.closest('#app main form')&&!event.target.closest('#requests-panel'))pageDirty=true;});
document.addEventListener('change',event=>{if(event.target.closest('#app main form')&&!event.target.closest('#requests-panel'))pageDirty=true;});
const permissionPage=id=>({overview:'bands',history:'ledger',contacts:'ledger'}[id]||id);
const can=(id,level='view')=>permits(authSession?.permissions,permissionPage(id),level);
const storageLabel=()=>authSession?.development?'Saved locally':'Saved online';
let memberFilter='current', memberSearch='';
let page='roster', filter='all', search='', draft={}, draftContact='', draftNotes='', draftPaid='';
async function commit(next) {
  if (saving) return false;
  if (loadError) { toast(loadError); return false; }
  saving=true;
  document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
  if ($('#connection-status')) $('#connection-status').textContent='Saving…';
  try {
    next=validateBackup(next);
    if(cloud) data=validateBackup(await cloud.save(next));
    else throw Error('Sign in before saving records.');
    pageDirty=false;
    if ($('#connection-status')) $('#connection-status').textContent=cloud?storageLabel():'Saved in this browser';
    return true;
  } catch(error) {
    if(cloud) loadError=error.conflict?error.message:'Save could not be confirmed. Reload to check the latest ledger before trying again.';
    if ($('#connection-status')) $('#connection-status').textContent=cloud?'Save not confirmed · reload required':'Save failed';
    toast(loadError || 'Could not save: '+error.message);
    return false;
  } finally {
    saving=false;
    document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);
  }
}
const contact = id => data.contacts.find(c=>c.id===id);
const initials = name => name.trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase();
const avatar = (c,i=0) => `<span class="avatar shade-${i%4}">${esc(initials(c?.name || '?'))}</span>`;
const dateText = date => new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const status = p => balance(p)===0 ? '<span class="status settled"><i></i>Paid</span>' : `<span class="status pending"><i></i>${paid(p)>0?'Partial':'Unpaid'}</span>`;
function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4000); }
document.addEventListener('click',dismissAccountMenu);
document.addEventListener('keydown',dismissAccountMenu);
document.addEventListener('focusin',dismissAccountMenu);
function go(next) {const target=next==='purchase'?'overview':next;if(!can(target)){toast('Your role does not have access to this page.');return;}page=target;search='';filter='all';render();sendPresence();window.scrollTo({top:0});}
function render() {
  pageDirty=false;
  if(!authSession?.authenticated||authSession.user.approval!=='approved'||authSession.security?.enrollmentRequired)return;
  const pages={roster:()=>rosterPage(data,memberSearch,memberFilter),overview:overview,history:historyPage,contacts:contactsPage,settings:settingsPage,access:()=>'<div id="access-panel"><p>Loading roles…</p></div>',requests:()=>'<div id="requests-panel"><p>Loading join requests…</p></div>'};
  if(!can(page))page=Object.keys(pages).find(id=>can(id))||'none';
  const navigation={roster:['roster','people','Roster'],bands:['overview','wallet','Bands'],ledger:['history','history','Ledger'],settings:['settings','settings','Settings'],access:['access','people','Roles & access'],requests:['requests','people','Join requests']};
  const groups=authSession.categories.map(category=>({...category,links:category.pages.filter(id=>can(id))})).filter(category=>category.links.length);
  $('#app').innerHTML=`<header class="simple-header"><div class="header-top"><a class="brand" href="#" data-page="${Object.keys(pages).find(id=>can(id))||'none'}"><picture class="gang-logo"><source media="(prefers-reduced-motion: reduce)" srcset="./pto-still.png"><img src="./pto.gif" alt="" width="56" height="56"></picture>${esc(data.name)}</a>${accountMenu(authSession)}</div><nav class="category-nav" aria-label="Main navigation">${groups.map(category=>`<div class="nav-category"><span>${esc(category.id==='treasury'&&category.name==='Treasury'?'Finances':category.name)}</span><div>${category.links.map(id=>{const [route,ic,label]=navigation[id];return `<button data-page="${route}" class="simple-nav ${permissionPage(page)===id?'active':''}" ${permissionPage(page)===id?'aria-current="page"':''}>${icon(ic,16)}<span>${label}</span>${id==='requests'?`<span class="request-nav-count" ${authSession.pendingRequests?'':'hidden'}>${authSession.pendingRequests||0}</span>`:''}</button>`;}).join('')}</div></div>`).join('')}</nav></header><div class="simple-shell"><main>${securityNudge(authSession)}<div id="live-sync-note" class="notice" role="status" hidden></div>${loadError?`<div class="notice error">${esc(loadError)}</div>`:''}${page!=='none'&&page!=='overview'&&!can(page,'manage')?'<div class="readonly-notice">View access · Your role cannot save changes on this page.</div>':''}${pages[page]?pages[page]():'<div class="empty"><h1>Access pending</h1><p>Your account is ready. Ask an Owner or access manager to assign a role.</p></div>'}</main><footer><span id="connection-status">${storageLabel()}</span><div class="footer-links">${can('settings')?'<button class="text-button" data-page="settings">Backups & settings</button>':''}<button class="text-button" data-action="reload">Reload latest</button></div></footer></div>`;
  bindForms();updateCalculator();applyPagePermissions();
  if($('#finance-panel'))mountFinance($('#finance-panel'),authSession,{request:authRequest,canRefresh:canApplyRemote,onClean:()=>{pageDirty=false;},onSaved:()=>{pageDirty=false;toast('Finance records saved.');}});
  if(page==='access')mountAccess($('#access-panel'),authSession,refreshSession,async()=>{authSession=await authRequest('/api/session');data=validateBackup(await cloud.load());pageDirty=false;});
  if(page==='requests')mountRequests($('#requests-panel'),authSession,async message=>{data=validateBackup(await cloud.load());await pollSession();if(message)toast(message);});
}
function applyPagePermissions(){
  document.querySelectorAll('main [data-page]').forEach(button=>{if(!can(button.dataset.page))button.hidden=true;});
  for(const [selector,required] of [['[data-action=invite-member]','roster'],['[data-action=gang-notes]','roster'],['[data-action=add-contact]','bands']])document.querySelectorAll(selector).forEach(button=>{if(!can(required,'manage'))button.hidden=true;});
  if(!can('ledger'))document.querySelectorAll('.owed-panel,.gang-bands').forEach(panel=>panel.hidden=true);
  if(page==='overview'&&!can('bands','manage')&&$('#purchase-form .save-button'))$('#purchase-form .save-button').disabled=true;
  if(page==='settings'&&!can('settings','manage'))document.querySelectorAll('#settings-form input,#settings-form button,#gang-settings-form input,#gang-settings-form textarea,#gang-settings-form button').forEach(input=>input.disabled=true);
  if(!['roster','bands','ledger','settings'].every(id=>can(id,'manage')))document.querySelectorAll('[data-action=import]').forEach(button=>button.hidden=true);
}
function restrictModal(){
  if($('#account-password-form'))return;
  if($('#member-form')&&!can('roster','manage')){document.querySelectorAll('#member-form input,#member-form textarea,#member-form button').forEach(input=>input.disabled=true);$('#modal h2').textContent='Member details';}
  if(!can('ledger','manage'))document.querySelectorAll('#contact-payment-form input,#contact-payment-form button,#payment-form input,#payment-form button,[data-edit-contact]').forEach(input=>input.disabled=true);
  if(!can('bands','manage'))document.querySelectorAll('[data-new-dropoff]').forEach(button=>button.hidden=true);
}
async function refreshSession(){
  authSession=await authRequest('/api/session');
  if(!authSession.authenticated){cloud=null;loginScreen(authSession,openWorkspace);return;}
  if(authSession.user.approval!=='approved'||authSession.security?.enrollmentRequired){await openWorkspace(authSession);return;}
  // Load a fresh, filtered snapshot whenever your permissions change.
  data=validateBackup(await cloud.load());render();
}
function title(eyebrow,heading,description,actions='') {
  return `<div class="page-heading"><div><h1>${heading}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function overview() {
  return '<div id="finance-panel" data-finance-mode="bands"><p>Loading your bands…</p></div>';
}
function owedPanel() {
  const people=data.contacts.map(c=>({...c,owed:contactBalance(data.purchases,c.id)})).filter(c=>c.owed>0).sort((a,b)=>b.owed-a.owed);
  const owed=people.reduce((s,c)=>s+c.owed,0);
  return `<section class="panel owed-panel"><div class="panel-header"><h2>Who you owe</h2></div><div class="owed-total"><strong>${money(owed)}</strong><span>Total unpaid</span></div>${people.length?people.slice(0,5).map((c,i)=>`<button class="recent-row" data-contact="${esc(c.id)}">${avatar(c,i)}<span class="recent-person"><strong>${esc(c.name)}</strong></span><span class="recent-amount"><strong>${money(c.owed)}</strong><small>Record payment ${icon('chevron',11)}</small></span></button>`).join(''):'<div class="empty compact"><h3>Nothing owed.</h3><p>Unpaid bands will appear here.</p></div>'}<div class="panel-foot"><button class="text-button" data-page="contacts">All players ${icon('arrow',14)}</button></div></section>`;
}
function calculator() {
  return `<section class="panel calculator"><form id="purchase-form"><div class="contact-field"><label for="player-search">Player</label><div class="contact-input"><div class="player-picker" id="player-picker"><input type="hidden" id="purchase-contact" name="contact" value="${esc(draftContact)}"><div class="picker-control"><input id="player-search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="player-options" aria-haspopup="listbox" placeholder="Choose a player" autocomplete="off" spellcheck="false" required><button class="picker-toggle" type="button" data-picker-toggle aria-label="Open player list" tabindex="-1">${icon('chevron',17)}</button></div><div class="picker-panel" data-picker-panel hidden><div class="picker-hint">${icon('search',14)} Type a name to search</div><div id="player-options" role="listbox" aria-label="Players"></div><p class="picker-message" data-picker-message role="status" hidden></p></div></div><button type="button" class="button secondary" data-action="add-contact">${icon('plus',16)} Add player</button></div></div><div class="calc-table"><div class="calc-labels"><span>BAND / PRICE EACH</span><span>QUANTITY</span><span>VALUE</span></div>${data.bands.filter(b=>b.active).map(b=>`<div class="calc-row"><div class="band-name"><span class="band-icon" style="--band:${b.color}">${icon(b.id==='band-0'?'coin':'wallet',19)}</span><div><strong>${esc(b.name)}</strong><small>${b.price?money(b.price)+' each':'Set price in Settings'}</small></div></div><div class="stepper"><button type="button" data-step="-1" data-band="${esc(b.id)}" aria-label="Decrease ${esc(b.name)}">−</button><input aria-label="${esc(b.name)} quantity" type="number" min="0" max="1000000" step="1" data-quantity="${esc(b.id)}" value="${draft[b.id]?.quantity||0}"><button type="button" data-step="1" data-band="${esc(b.id)}" aria-label="Increase ${esc(b.name)}">+</button></div><span class="row-subtotal" data-subtotal="${esc(b.id)}">$0</span></div>`).join('')||'<p class="empty">Add a band in Settings to get started.</p>'}</div><div class="calc-helper"><button type="button" class="text-button" data-page="settings">Change band prices ${icon('arrow',13)}</button></div><details class="optional-entry" ${draftPaid||draftNotes?'open':''}><summary>Add a payment or note <span>(optional)</span></summary><div class="optional-fields"><label for="amount-paid">Already paid</label><div class="money-input"><span>$</span><input id="amount-paid" type="number" min="0" step="0.01" max="1000000000000" placeholder="0" value="${esc(draftPaid)}"><button type="button" class="text-button" data-action="pay-full">Paid in full</button></div><label for="purchase-notes">Note</label><input id="purchase-notes" class="notes-input" maxlength="2000" placeholder="Optional note" value="${esc(draftNotes)}"><p>Band value: <span id="purchase-total">$0</span></p></div></details><div class="total-box"><div><span>OWED FOR THESE BANDS</span><strong id="remaining">$0</strong></div><span id="item-count">0 items</span></div><div class="form-error" id="purchase-error" role="alert"></div><button class="button primary save-button" type="submit">${icon('check',18)} Save bands ${icon('arrow',18)}</button></form></section>`;
}
function table(records) {
  return records.length?`<div class="table-scroll"><table><thead><tr><th>PLAYER</th><th>DATE</th><th>BAND VALUE</th><th>STILL OWED</th><th>STATUS</th></tr></thead><tbody>${records.map((p,i)=>`<tr><td><button class="person-button" data-purchase="${esc(p.id)}">${avatar(contact(p.contactId),i)}${esc(contact(p.contactId)?.name)}</button></td><td>${dateText(p.date)}</td><td class="number">${money(total(p))}</td><td class="number ${balance(p)?'amber':''}">${money(balance(p))}</td><td>${status(p)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty"><h3>${data.purchases.length?'No matching entries.':'Your ledger is ready.'}</h3><p>${data.purchases.length?'Try another player or show all entries.':'Record a drop-off to start tracking bands and payments.'}</p>${data.purchases.length?'<button class="button secondary" data-action="reset-history">Show all entries</button>':can('bands','manage')?'<button class="button primary" data-page="overview">Record bands</button>':''}</div>`;
}
function filteredPurchases(){return [...data.purchases].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).filter(p=>(filter==='all'||(filter==='open'?balance(p)>0:balance(p)===0))&&`${contact(p.contactId)?.name} ${p.notes}`.toLowerCase().includes(search.toLowerCase()));}
function historyPage(){return '<div id="finance-panel" data-finance-mode="ledger"><p>Loading the finance ledger…</p></div>'+(data.purchases.length||data.contacts.length?'<details class="finance-legacy"><summary>Earlier ledger records & outside players</summary>'+legacyHistoryPage()+'</details>':'');}
function legacyHistoryPage() {
  return title('','Ledger','All recorded bands and payments.',`<button class="button secondary" data-page="contacts">Player balances</button><button class="button primary" data-page="overview">${icon('plus',18)} Record bands</button>`)+`<section class="panel"><div class="list-toolbar"><div class="tabs">${[['all','All'],['open','Unpaid'],['paid','Paid']].map(([id,label])=>`<button class="${filter===id?'selected':''}" data-filter="${id}">${label}</button>`).join('')}</div><label class="search-field">${icon('search',17)}<input id="history-search" placeholder="Search players or notes" value="${esc(search)}" aria-label="Search ledger"></label></div><div id="history-results">${table(filteredPurchases())}</div></section>`;
}
function contactCards() {
  const people=data.contacts.filter(c=>`${c.name} ${c.notes}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>contactBalance(data.purchases,b.id)-contactBalance(data.purchases,a.id)||a.name.localeCompare(b.name));
  return people.length?people.map((c,i)=>`<button class="player-row" data-contact="${esc(c.id)}">${avatar(c,i)}<strong>${esc(c.name)}</strong><span class="player-balance"><strong class="${contactBalance(data.purchases,c.id)?'amber':'lime'}">${money(contactBalance(data.purchases,c.id))}</strong><small>Owed</small></span>${icon('chevron',16)}</button>`).join(''):`<div class="empty"><h3>${search?'No matching players.':'No ledger players yet.'}</h3><p>${search?'Try a different name or show all players.':'Add a player to keep their drop-offs and balance together.'}</p>${search?'<button class="button secondary" data-action="reset-contacts">Show all players</button>':can('bands','manage')?'<button class="button primary" data-action="add-contact">+ Add player</button>':''}</div>`;
}
function contactsPage() {
  return title('','Player balances','Band balances for members and other players. These records do not create website logins.',`<button class="button secondary" data-page="history">Ledger</button><button class="button primary" data-action="add-contact">${icon('plus',18)} Add player</button>`)+`<label class="search-field contact-search">${icon('search',17)}<input id="contact-search" placeholder="Find a player" aria-label="Search players"></label><div class="panel player-list" id="contact-results">${contactCards()}</div>`;
}
function bandSetting(b){return `<div class="setting-band" data-setting-band="${esc(b.id)}"><input type="color" name="color" value="${b.color}" aria-label="Band color"><input name="bandname" aria-label="Band name" value="${esc(b.name)}" maxlength="40" required><label class="money-input"><span>$</span><input name="price" aria-label="Default unit price" value="${b.price/100}" type="number" min="0" max="1000000000" step="0.01" required></label><label class="toggle-label"><input type="checkbox" name="active" ${b.active?'checked':''}> Active</label><button type="button" class="icon-button" data-move="up" aria-label="Move band up">↑</button><button type="button" class="icon-button" data-move="down" aria-label="Move band down">↓</button></div>`;}
function settingsPage() {
  return title('','Settings','Manage your roster, band prices, and backups.')+gangSettings(data)+`<form id="settings-form" class="simple-settings"><section class="panel settings-panel"><div class="panel-header"><div><h2>Bands & prices</h2><p>Changes apply to new entries only.</p></div><button type="button" class="button secondary" data-action="add-band">${icon('plus',16)} Add band</button></div><div class="settings-band-head"><span>COLOR & NAME</span><span>PRICE EACH</span><span>VISIBLE / ORDER</span></div><div id="band-settings">${data.bands.map(bandSetting).join('')}</div><div class="form-error" id="settings-error" role="alert"></div><button class="button primary" type="submit">${icon('check',17)} Save settings</button></section></form><section class="panel settings-panel backup-panel"><div><h2>Backup</h2><p>Records save to this workspace. This download covers roster and earlier ledger records. Account-linked deposits, payments, and account details are included in full encrypted backups under Roles & access.</p></div><div class="backup-actions"><button class="button secondary" data-action="export">${icon('down',16)} Download backup</button><button class="button secondary" data-action="import">Restore backup</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div></section>`;
}
function updateCalculator() {
  if (!$('#purchase-form')) return;
  let sum=0,count=0;
  document.querySelectorAll('[data-quantity]').forEach(input=>{
    const id=input.dataset.quantity,band=data.bands.find(b=>b.id===id);
    const quantity=Number(input.value);
    draft[id]={quantity:input.value,price:band.price/100};
    input.setCustomValidity(quantity>0&&band.price<=0?'Set a price for this band in Settings first.':'');
    const subtotal=Number.isFinite(quantity)?band.price*quantity:0;
    sum+=subtotal;count+=quantity;
    [...document.querySelectorAll('[data-subtotal]')].find(el=>el.dataset.subtotal===id).textContent=money(subtotal);
  });
  $('#purchase-total').textContent=money(sum);
  $('#item-count').textContent=count.toLocaleString()+' items';
  $('#remaining').textContent=money(sum-cents($('#amount-paid').value||0));
  $('#amount-paid').max=String(sum/100);
  return sum;
}
function clearDraft(){draft={};draftContact='';draftNotes='';draftPaid='';}
function bindForms(){
  $('#roster-search')?.addEventListener('input',e=>{memberSearch=e.target.value;$('#roster-results').innerHTML=rosterRows(data,memberSearch,memberFilter);applyPagePermissions();});
  $('#gang-settings-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try {
      const next={...data,name:$('#gang-name').value.trim(),rosterLimit:Number($('#roster-limit').value),ranks:$('#gang-ranks').value.split(/\r?\n/).map(rank=>rank.trim()).filter(Boolean)};
      if(await commit(validateBackup(next))){render();toast('Gang settings saved.');}
    }catch(error){$('#gang-settings-error').textContent=error.message;}
  });
  if ($('#player-picker')) mountPlayerPicker($('#player-picker'), {options:data.contacts, value:draftContact, onChange:id=>{draftContact=id;}});
  $('#purchase-form')?.addEventListener('input',()=>{draftContact=$('#purchase-contact').value;draftNotes=$('#purchase-notes').value;draftPaid=$('#amount-paid').value;updateCalculator();});
  $('#purchase-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const date=new Date().toISOString();const lines=data.bands.filter(b=>b.active&&Number(draft[b.id]?.quantity)>0).map(b=>({id:b.id,name:b.name,color:b.color,quantity:Number(draft[b.id].quantity),price:cents(draft[b.id].price)}));const amount=cents($('#amount-paid').value||0);const p=validatePurchase({id:uid(),kind:'dropoff',contactId:$('#purchase-contact').value,date,lines,payments:amount?[{id:uid(),amount,date}]:[],notes:$('#purchase-notes').value.trim()});if(await commit({...data,purchases:[p,...data.purchases]})){clearDraft();render();toast('Bands saved. Player balance updated.');}}catch(error){$('#purchase-error').textContent=error.message;}});
  $('#history-search')?.addEventListener('input',e=>{search=e.target.value;$('#history-results').innerHTML=table(filteredPurchases());});
  $('#contact-search')?.addEventListener('input',e=>{search=e.target.value;$('#contact-results').innerHTML=contactCards();});
  $('#settings-form')?.addEventListener('submit',async e=>{e.preventDefault();const bands=[...document.querySelectorAll('[data-setting-band]')].map(row=>({id:row.dataset.settingBand,name:row.querySelector('[name=bandname]').value.trim(),color:row.querySelector('[name=color]').value,price:cents(row.querySelector('[name=price]').value),active:row.querySelector('[name=active]').checked}));const next={...data,bands};try{validateBackup(next);if(await commit(next)){clearDraft();render();toast('Settings saved. Your new rates are ready.');}}catch(error){$('#settings-error').textContent=error.message;}});
  $('#backup-file')?.addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw new Error('Please use a backup smaller than 5 MB.');const next=validateBackup(JSON.parse(await file.text()));openModal(`<h2>Restore this backup?</h2><p>This will restore roster and earlier ledger records with <strong>${next.members.length} members, ${next.contacts.length} ledger players, and ${next.purchases.length} purchases</strong> from ${esc(next.name)}. Current account-linked deposits and payment history stay intact. Export your roster and earlier ledger first if you want to keep them.</p><div class="modal-actions"><button class="button secondary" data-action="close">Cancel</button><button class="button primary" id="confirm-import">Restore backup</button></div>`);$('#confirm-import').onclick=async ()=>{if(await commit(next)){clearDraft();$('#modal').close();render();toast('Backup restored.');}};}catch(error){toast('Backup not restored: '+error.message);}e.target.value='';});
}
function openModal(html){$('#modal').innerHTML=`<button class="modal-close icon-button" data-action="close" aria-label="Close dialog">${icon('close')}</button>${html}`;if(!$('#modal').open)$('#modal').showModal();queueMicrotask(restrictModal);}
function editMember(id) {
  const member=data.members.find(m=>m.id===id);if(!member)return;
  const canManage=can('roster','manage'),canEditIdentity=canManage&&(!member.userId||(can('access','manage')));
  const revision=cloud.revision;
  openModal(memberForm(data,member,{canManage,canEditIdentity}));
  const ranks=[...new Set([...data.ranks,member.rank])];
  mountProfilePicker($('#modal'),'member-rank',ranks.map(rank=>({id:rank,name:rank})),member.rank);
  $('#remove-roster-member')?.addEventListener('click',()=>{
    openModal(`<h2>Remove ${esc(member.name)} from the roster?</h2><p>This deletes their roster profile and notes. Their website account, access, and finance history remain. To stop sign-in or delete the account, use Roles & access → People.</p><p>Use Archive instead if you may want to restore this roster profile later.</p><p class="form-error" id="remove-member-error" role="alert"></p><div class="member-actions"><button class="button secondary" id="cancel-remove-member">Cancel</button><button class="button primary" id="confirm-remove-member">Remove from roster</button></div>`);
    $('#cancel-remove-member').onclick=()=>editMember(id);
    $('#confirm-remove-member').onclick=async()=>{const button=$('#confirm-remove-member');button.disabled=true;try{await authRequest('/api/members/'+id,{method:'DELETE',body:{revision}});$('#modal').close();await refreshSession();toast('Member removed from the roster.');}catch(error){$('#remove-member-error').textContent=error.message;}finally{button.disabled=false;}};
  });
  $('#member-form').onsubmit=async e=>{
    e.preventDefault();if(!canManage||saving)return;
    const form=e.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
    try {
      const body={revision,rank:$('#member-rank').value,status:form.querySelector('[name=member-status]:checked').value,joined:$('#member-joined').value,notes:$('#member-notes').value.trim(),...(canEditIdentity&&(!member.userId||['name','username','stateId','phone'].some(key=>(readIdentity(form,member)[key]??'')!==(member[key]??'')))?{profile:readIdentity(form,member)}:{})};
      await authRequest('/api/members/'+id,{method:'PUT',body});
      $('#modal').close();await refreshSession();toast('Member profile saved.');
    }catch(error){$('#member-error').textContent=error.message;}
    finally{button.disabled=false;}
  };
}
function inviteMember(){
  if(!can('roster','manage'))return;
  const url=new URL(location.href);url.search='';url.hash='join';
  openModal(`<h2>Invite member</h2><p>Share this link so they can create their own account with their character name, State ID, and phone number. Approve their request to add them to the roster.</p><label for="invite-link">Signup link</label><input id="invite-link" readonly value="${esc(url.href)}"><div class="member-actions"><button class="button primary" id="copy-invite">Copy link</button><button class="button secondary" data-action="existing-member">Add existing account</button></div><p id="invite-message" role="status"></p>${authSession.development?'<p class="access-help">This preview link works on this computer. Public invitations use the published website.</p>':''}`);
  $('#copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);$('#invite-message').textContent='Link copied.';}catch{$('#invite-link').select();$('#invite-message').textContent='Select and copy the link above.';}};
}
async function addExistingMember(memberId=''){
  if(!can('roster','manage'))return;
  try{
    data=validateBackup(await cloud.load());const revision=cloud.revision;
    const directory=await authRequest('/api/profiles'),available=directory.users.filter(u=>!u.disabled&&!u.memberId);
    const member=memberId?data.members.find(m=>m.id===memberId):null;
    if(memberId&&(!member||member.userId))throw Error('This member changed. Reload the roster before linking.');
    openModal(`<h2>${member?'Link account to '+esc(member.name):'Add existing account'}</h2><p>${member?'Choose the matching account. Its character name, username, State ID, and phone will be used; the current rank, joined date, status, and notes stay with this roster entry.':'Choose an approved account that is not yet on the roster.'}</p>${available.length?`<form id="link-member-form">${pickerMarkup('link-account','Account')}${member?'':pickerMarkup('link-rank','Gang rank')}<p id="link-account-details" class="access-help"></p><div class="form-error" role="alert"></div><button class="button primary" type="submit">${member?'Link account':'Add to roster'}</button></form>`:'<p>No available accounts. Already-linked members can be edited or restored from the roster. New members should create an account and request to join.</p>'}`);
    if(!available.length)return;
    mountProfilePicker($('#modal'),'link-account',available.map(u=>({id:u.id,name:u.name+' · @'+u.username+(u.stateId?' · '+u.stateId:'')})),'',id=>{const u=available.find(x=>x.id===id);$('#link-account-details').textContent=u?'State ID: '+(u.stateId||'Not set')+' · Phone: '+(u.phone||'Not set'):'';});
    if(!member)mountProfilePicker($('#modal'),'link-rank',data.ranks.map(rank=>({id:rank,name:rank})),data.ranks.at(-1));
    $('#link-member-form').onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
      try{const user=available.find(u=>u.id===$('#link-account').value);if(!user)throw Error('Choose an account.');
        await authRequest('/api/members',{method:'POST',body:{userId:user.id,profileRevision:user.profileRevision,memberId,joined:new Date().toLocaleDateString('en-CA'),rank:$('#link-rank')?.value,revision}});
        $('#modal').close();await refreshSession();toast('Account linked to roster.');
      }catch(error){form.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}
    };
  }catch(error){toast(error.message);}
}
function editGangNotes(){
  openModal(`<h2>Gang notes</h2><form id="gang-notes-form"><label for="gang-notes">Reminders & priorities</label><textarea id="gang-notes" rows="7" maxlength="4000">${esc(data.gangNotes)}</textarea><div class="form-error" id="gang-notes-error" role="alert"></div><button class="button primary">Save notes</button></form>`);
  $('#gang-notes-form').onsubmit=async e=>{e.preventDefault();if(await commit({...data,gangNotes:$('#gang-notes').value.trim()})){$('#modal').close();render();toast('Gang notes saved.');}};
}
function contactForm(id){const c=contact(id);openModal(`<h2>${c?'Edit player':'Add player'}</h2><form id="contact-form"><label for="contact-name">Name or in-game alias</label><input id="contact-name" required maxlength="60" value="${esc(c?.name||'')}" autofocus><label for="contact-notes">Notes <span class="muted">(optional)</span></label><textarea id="contact-notes" maxlength="2000" rows="3" placeholder="Anything useful to remember…">${esc(c?.notes||'')}</textarea><div class="form-error" id="contact-error" role="alert"></div><button class="button primary" type="submit">${c?'Save changes':'Add player'} ${icon('arrow',17)}</button></form>`);$('#contact-form').onsubmit=async e=>{e.preventDefault();const name=$('#contact-name').value.trim();if(!name){$('#contact-error').textContent='Enter a contact name.';return;}const item={id:c?.id||uid(),name,notes:$('#contact-notes').value.trim()};if(await commit({...data,contacts:c?data.contacts.map(old=>old.id===c.id?item:old):[...data.contacts,item]})){if(!c)draftContact=item.id;$('#modal').close();render();toast(c?'Contact updated.':'Contact added.');}};}
function contactDetail(id) {
  const c=contact(id);if(!c)return;
  const records=data.purchases.filter(p=>p.contactId===id).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  const owed=contactBalance(data.purchases,id);
  openModal(`<div class="detail-person">${avatar(c)}<div><div class="eyebrow">LEDGER PLAYER</div><h2>${esc(c.name)}</h2></div></div><p class="contact-note">${esc(c.notes||'')}</p><div class="detail-summary"><span>You owe them<strong class="${owed?'amber':'lime'}">${money(owed)}</strong></span><span>Total received<strong>${money(records.reduce((s,p)=>s+total(p),0))}</strong></span></div><div class="contact-actions"><button class="button primary" data-new-dropoff="${esc(id)}">${icon('plus',16)} Record bands</button><button class="button secondary" data-edit-contact="${esc(id)}">Edit player</button></div>${owed>0?`<form id="contact-payment-form" class="contact-payment-form"><label for="contact-payment-amount">Amount paid</label><p>Pays off the oldest unpaid bands first.</p><div class="payment-entry"><input id="contact-payment-amount" type="number" min="0.01" max="${owed/100}" step="0.01" value="${owed/100}" required aria-label="Amount paid to player"><button class="button primary" type="submit">Record payment</button></div><div id="contact-payment-error" class="form-error" role="alert"></div></form>`:'<div class="settled-note">'+icon('check',18)+' Nothing owed. You’re all settled up.</div>'}<h3 class="detail-history-title">History</h3>${records.length?records.map(p=>`<button class="detail-purchase" data-purchase="${esc(p.id)}"><span>${dateText(p.date)}<small>${p.lines.map(l=>`${l.quantity} × ${esc(l.name)}`).join(', ')}</small></span><span class="entry-amount"><strong>${money(total(p))}</strong><small>${money(balance(p))} owed</small></span>${status(p)}${icon('chevron',14)}</button>`).join(''):'<p>No bands recorded yet.</p>'}`);
  $('#contact-payment-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try {
      const next=payContact(data.purchases,id,cents($('#contact-payment-amount').value),new Date().toISOString(),uid());
      if(await commit({...data,purchases:next})){render();contactDetail(id);toast('Payment saved. Balance updated.');}
    } catch(error){$('#contact-payment-error').textContent=error.message;}
  });
}
function purchaseDetail(id){const p=data.purchases.find(p=>p.id===id);if(!p)return;openModal(`<div class="eyebrow">ENTRY · ${esc(new Date(p.date).toLocaleString('en-US'))}</div><h2>${esc(contact(p.contactId)?.name)}</h2>${status(p)}<div class="receipt">${p.lines.map(l=>`<div><span><i style="background:${l.color}"></i>${esc(l.name)}<small>${l.quantity.toLocaleString()} × ${money(l.price)}</small></span><strong>${money(l.quantity*l.price)}</strong></div>`).join('')}</div><div class="detail-summary"><span>Band value<strong>${money(total(p))}</strong></span><span>You owe them<strong class="${balance(p)?'amber':'lime'}">${money(balance(p))}</strong></span></div>${p.notes?`<p class="contact-note">${esc(p.notes)}</p>`:''}<h3>Payment history</h3>${p.payments.length?p.payments.map(pay=>`<div class="payment-line"><span>${dateText(pay.date)} · ${new Date(pay.date).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span><strong>${money(pay.amount)}</strong></div>`).join(''):'<p>No payments recorded.</p>'}${balance(p)>0?`<form id="payment-form"><label for="payment-amount">Record a payment</label><div class="payment-entry"><input id="payment-amount" type="number" min="0.01" max="${balance(p)/100}" step="0.01" value="${balance(p)/100}" required aria-label="Payment amount"><button type="submit" class="button primary">Record payment</button></div><div id="payment-error" class="form-error" role="alert"></div></form>`:'<div class="settled-note">'+icon('check',18)+' All settled. This entry is paid in full.</div>'}`);$('#payment-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const updated=addPayment(p,cents($('#payment-amount').value),new Date().toISOString(),uid());if(await commit({...data,purchases:data.purchases.map(old=>old.id===p.id?updated:old)})){render();purchaseDetail(id);toast('Payment recorded. Balance updated.');}}catch(error){$('#payment-error').textContent=error.message;}});}
document.addEventListener('pointerdown',e=>{
  const picker=$('#player-picker');
  if(picker && !picker.contains(e.target)) picker.closePicker?.();
});
document.addEventListener('click',async e=>{
  if(saving){e.preventDefault();return;}
  const button=e.target.closest('button,a');if(!button)return;
  if(button.dataset.editMember){editMember(button.dataset.editMember);return;}
  if(button.dataset.linkMember){await addExistingMember(button.dataset.linkMember);return;}
  if(button.dataset.memberFilter){memberFilter=button.dataset.memberFilter;render();return;}
  if(button.dataset.archiveMember){if(await commit({...data,members:data.members.map(m=>m.id===button.dataset.archiveMember?{...m,status:'archived'}:m)})){$('#modal').close();render();toast('Member archived. You can restore them from Archive.');}return;}
  if(button.dataset.page){e.preventDefault();go(button.dataset.page);return;}
  if(button.dataset.newDropoff){clearDraft();draftContact=button.dataset.newDropoff;$('#modal').close();go('purchase');return;}
  if(button.dataset.purchase){purchaseDetail(button.dataset.purchase);return;}
  if(button.dataset.contact){contactDetail(button.dataset.contact);return;}
  if(button.dataset.editContact){contactForm(button.dataset.editContact);return;}
  if(button.dataset.filter){filter=button.dataset.filter;render();return;}
  if(button.dataset.step){const input=[...document.querySelectorAll('[data-quantity]')].find(el=>el.dataset.quantity===button.dataset.band);input.value=Math.min(1000000,Math.max(0,(Number(input.value)||0)+Number(button.dataset.step)));updateCalculator();return;}
  if(button.dataset.move){const row=button.closest('[data-setting-band]');if(button.dataset.move==='up'&&row.previousElementSibling)row.before(row.previousElementSibling);else if(button.dataset.move==='down'&&row.nextElementSibling)row.after(row.nextElementSibling);return;}
  switch(button.dataset.action){
    case 'reset-roster':memberSearch='';memberFilter='current';render();$('#roster-search')?.focus();break;
    case 'reset-history':search='';filter='all';render();$('#history-search')?.focus();break;
    case 'reset-contacts':search='';render();$('#contact-search')?.focus();break;
    case 'account':accountDialog(authSession.user,openModal,refreshSession);break;
    case 'logout':await authRequest('/api/auth/logout',{method:'POST',body:{}});$('#modal').close();authSession=null;cloud=null;clearDraft();await start();break;
    case 'close':$('#modal').close();break;
    case 'invite-member':inviteMember();break;
    case 'existing-member':await addExistingMember();break;
    case 'gang-notes':editGangNotes();break;
    case 'add-contact':contactForm();break;
    case 'pay-full':draftPaid=String(updateCalculator()/100);$('#amount-paid').value=draftPaid;updateCalculator();break;
    case 'add-band':$('#band-settings').insertAdjacentHTML('beforeend',bandSetting({id:uid(),name:'New band',color:'#b9d984',price:0,active:true}));break;
    case 'reload':location.reload();break;
    case 'export':{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`pto-roaster-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup downloaded. Keep it somewhere safe.');break;}
    case 'import':$('#backup-file').click();break;
  }
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});

async function openWorkspace(session){
  authSession=session;
  if(!session.authenticated){cloud=null;loginScreen(session,openWorkspace);return;}
  if(session.user.approval!=='approved'){cloud=null;approvalScreen(session,openWorkspace);return;}
  if(session.security?.enrollmentRequired){cloud=null;securityGate(session,openWorkspace,authRequest);return;}
  cloud=new CloudLedger();loadError='';
  data=validateBackup(await cloud.load());clearDraft();render();
  sendPresence();
}
let presenceBusy=false;
async function sendPresence(){
  if(presenceBusy||document.visibilityState!=='visible'||!cloud||!authSession?.authenticated||authSession.user.approval!=='approved'||!can(page))return;
  presenceBusy=true;try{await authRequest('/api/presence',{method:'POST',body:{page:permissionPage(page)}});}catch{}finally{presenceBusy=false;}
}
setInterval(sendPresence,45000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){sendPresence();pollSession();}});
async function pollSession(){
  if(syncBusy||!authSession?.authenticated||saving||document.visibilityState!=='visible'||document.querySelector('[data-security-sensitive]'))return;
  syncBusy=true;
  try{
    const previous=authSession,updated=await authRequest('/api/session');
    if(!updated.authenticated||updated.user.approval!==previous.user.approval||JSON.stringify(updated.permissions)!==JSON.stringify(previous.permissions)||JSON.stringify(updated.categories)!==JSON.stringify(previous.categories)||JSON.stringify(updated.roles)!==JSON.stringify(previous.roles)||JSON.stringify(updated.security)!==JSON.stringify(previous.security)){
      $('#modal').close();await openWorkspace(updated);return;
    }
    authSession=updated;
    if(updated.user.approval!=='approved'){
      if(updated.user.profileRevision!==previous.user.profileRevision)approvalScreen(updated,openWorkspace);
      return;
    }
    if(updated.user.profileRevision!==previous.user.profileRevision){const menu=document.querySelector('.account-menu');if(menu)menu.outerHTML=accountMenu(updated);}
    document.querySelectorAll('.request-nav-count').forEach(badge=>{badge.textContent=updated.pendingRequests||0;badge.hidden=!updated.pendingRequests;});
    const versions=updated.versions||{};let waiting=false;
    if(cloud&&Number.isSafeInteger(versions.workspace)&&versions.workspace!==cloud.revision){
      if(!canApplyRemote())waiting=true;
      else{
        const currentCloud=cloud,snapshot=await currentCloud.request('/api/ledger');
        if(currentCloud===cloud&&canApplyRemote()&&snapshot.revision>=currentCloud.revision){
          data=validateBackup(snapshot.data);currentCloud.revision=snapshot.revision;loadError='';
          if(!['access','requests','overview','history'].includes(page))render();
          else if(page==='history'&&$('#history-results'))$('#history-results').innerHTML=table(filteredPurchases());
        }else waiting=true;
      }
    }
    const finance=$('#finance-panel');
    if(finance?.refreshFromServer&&(finance.seenRevision!==versions.workspace||finance.seenAccounts!==versions.accounts||finance.seenDay!==financeDay())){
      if(!canApplyRemote()||!await finance.refreshFromServer())waiting=true;
      else finance.seenAccounts=versions.accounts;
    }
    const requests=$('#requests-panel');
    if(requests?.refreshFromServer&&versions.requests!==requests.seenVersion){
      if(await requests.refreshFromServer())requests.seenVersion=versions.requests;
    }
    const access=$('#access-panel'),seen=access?.seenVersions||{};
    if(access?.refreshFromServer&&(seen.accounts!==versions.accounts||seen.access!==versions.access||(access.currentTab==='activity'&&seen.audit!==versions.audit))){
      if(!canApplyRemote())waiting=true;
      else if(await access.refreshFromServer(canApplyRemote))access.seenVersions={...versions};
      else waiting=true;
    }
    syncMessage(waiting?'New updates are available. Your edits are preserved. Finish or cancel editing to load the latest records.':'');
    if($('#connection-status')&&!loadError)$('#connection-status').textContent=storageLabel()+' · Updates connected';
  }catch{
    syncMessage('Connection interrupted. Checking for updates again automatically.');
    if($('#connection-status'))$('#connection-status').textContent='Updates disconnected · retrying';
  }finally{syncBusy=false;}
}
setInterval(pollSession,3000);
window.addEventListener('focus',pollSession);
$('#modal').addEventListener('close',pollSession);
async function start() {
  $('#app').innerHTML='<div class="startup"><h1>PTO Roaster</h1><p>Opening your workspace…</p></div>';
  try {
    const session=await authRequest('/api/session');
    if(!session.authenticated){loginScreen(session,openWorkspace);return;}
    await openWorkspace(session);
  }catch {
    $('#app').innerHTML='<div class="startup"><h1>Unable to open the workspace</h1><p>Check your connection, then try again.</p><button class="button primary" data-action="reload">Try again</button></div>';
  }
}
start();
