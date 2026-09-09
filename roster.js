import { rosterCounts } from './model.js';
import {uiIcon} from './ui-utils.js';
import {identityInputs,pickerMarkup} from './profile-ui.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
export function rosterRows(data,query='',filter='current') {
  const members=data.members.filter(m=>(filter==='current'?m.status!=='archived':m.status===filter)&&`${m.name} ${m.rank} ${m.username||''} ${m.stateId||''} ${m.phone||''} ${m.notes}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>(data.ranks.indexOf(a.rank)<0?999:data.ranks.indexOf(a.rank))-(data.ranks.indexOf(b.rank)<0?999:data.ranks.indexOf(b.rank))||a.name.localeCompare(b.name));
  return members.length?`<div class="roster-columns" aria-hidden="true"><span>MEMBER</span><span>RANK</span><span>STATUS</span><span></span></div>${members.map(m=>`<button class="roster-row" data-edit-member="${esc(m.id)}" aria-label="View ${esc(m.name)}"><span class="member-identity"><span class="member-avatar">${esc(initials(m.name))}</span><span><strong>${esc(m.name)}</strong><small>${esc(m.stateId?'State ID '+m.stateId:'State ID not set')} · ${esc(m.userId?'@'+m.username:'Account not linked')}</small><small>${esc(m.phone||'Phone not set')}</small></span></span><span class="rank-tag rank-tone-${Math.max(0,data.ranks.indexOf(m.rank))%4}">${esc(m.rank)}</span><span class="member-status ${m.status}"><i></i>${m.status==='active'?'Active':m.status==='inactive'?'Inactive':'Archived'}</span><span class="row-arrow" aria-hidden="true">${uiIcon('next')}</span></button>`).join('')}`:`<div class="empty roster-empty"><h3>${query?'No matching members.':filter==='archived'?'No archived members.':filter==='active'?'No active members.':filter==='inactive'?'No inactive members.':'Your roster starts here.'}</h3><p>${query?'Try a character name, username, State ID, phone, or rank.':filter==='archived'?'Members you archive stay available here.':filter!=='current'?'Choose All to see the rest of your roster.':'Invite your people. Approving their join requests adds them to the roster.'}</p>${!query&&filter==='current'?'<button class="button primary" data-action="invite-member">Invite member</button>':query||filter!=='current'?'<button class="button secondary" data-action="reset-roster">Show all members</button>':''}</div>`;
}
export function rosterPage(data,query='',filter='current') {
  const counts=rosterCounts(data.members,data.rosterLimit);
  return `<div class="page-heading"><div><h1>Roster</h1><p>${counts.total} ${counts.total===1?'member':'members'} · ${counts.active} active · ${counts.inactive} inactive</p></div><div class="heading-actions"><button class="button primary" data-action="invite-member">Invite member</button></div></div>
  <section class="panel roster-panel simple-roster"><div class="roster-toolbar"><div class="tabs" aria-label="Filter members">${[['current','All',counts.total],['active','Active',counts.active],['inactive','Inactive',counts.inactive],['archived','Archive',counts.archived]].map(([id,label,count])=>`<button data-member-filter="${id}" class="${filter===id?'selected':''}" aria-pressed="${filter===id}">${label}<span>${count}</span></button>`).join('')}</div><label class="search-field"><input id="roster-search" placeholder="Search name, State ID, phone…" aria-label="Search roster" value="${esc(query)}"></label></div><div id="roster-results">${rosterRows(data,query,filter)}</div></section>`;
}
export function memberForm(data,member,{canEditIdentity=true,canManage=true}={}) {
  return `<h2>${canManage?'Edit member':'Member details'}</h2><p class="member-form-intro">${member.userId?'Account and roster details stay connected.':'This existing roster entry has not been linked to an account.'}</p>
  ${!member.userId&&canManage?'<button class="button secondary" data-link-member="'+esc(member.id)+'">Link account</button>':''}
  <form id="member-form" class="member-form">
  ${identityInputs('member',member,{username:!!member.userId,readonly:!canEditIdentity,required:!!member.userId&&canEditIdentity})}
  ${member.userId&&!canEditIdentity?'<p class="access-help">An account administrator can edit these identity details.</p>':''}
  ${pickerMarkup('member-rank','Gang rank')}
  <fieldset class="status-choices"><legend>Roster status</legend>${['active','inactive','archived'].map(status=>`<label><input type="radio" name="member-status" value="${status}" ${member.status===status?'checked':''}>${status[0].toUpperCase()+status.slice(1)}</label>`).join('')}</fieldset>
  <p class="access-help">Archive hides the member from the current roster and lets you restore them later. Remove from roster deletes this roster profile. Website accounts are managed under Admin → Accounts & access.</p>
  <label for="member-joined">Date joined</label><input type="date" id="member-joined" required value="${esc(member.joined)}">
  <label for="member-notes">Notes <span class="muted">(optional)</span></label><textarea id="member-notes" rows="3" maxlength="2000">${esc(member.notes)}</textarea>
  <div class="form-error" id="member-error" role="alert"></div>
  ${canManage?'<div class="member-actions"><button type="submit" class="button primary">Save member</button><button type="button" class="button secondary" id="remove-roster-member">Remove from roster</button></div>':''}</form>`;
}
export function gangSettings(data) {
  return `<form id="gang-settings-form" class="gang-settings panel settings-panel"><h2>Website & roster</h2><p>Set the website name and member ranks.</p><label for="gang-name">Website name</label><input id="gang-name" required maxlength="40" value="${esc(data.name)}"><label for="roster-limit">Roster limit</label><input id="roster-limit" type="number" min="0" max="2000" step="1" value="${data.rosterLimit}" required><small>Use 0 for no limit. Archived members do not count.</small><label for="gang-ranks">Ranks, highest first</label><textarea id="gang-ranks" rows="5" required maxlength="1230">${esc(data.ranks.join('\n'))}</textarea><small>One rank per line. Members keep their current rank if you remove it here.</small><div class="form-error" id="gang-settings-error" role="alert"></div><button class="button primary" type="submit">Save gang settings</button></form>`;
}
