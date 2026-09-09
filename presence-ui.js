const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {readUiPreference,saveUiPreference} from './ui-utils.js';
export function mountMembersSidebar(root,request,userId=''){
  root.innerHTML='<details class="member-drawer"><summary>Members <span data-member-count>Checking…</span></summary><div class="member-sidebar-content"><p class="member-presence-help">Online means active on this website within the last 2 minutes.</p><div data-member-groups></div><p class="member-presence-message" role="status"></p><button type="button" class="text-button" data-page="roster">View roster</button></div></details>';
  const message=root.querySelector('.member-presence-message'),groups=root.querySelector('[data-member-groups]'),count=root.querySelector('[data-member-count]');
  const desktop=matchMedia('(min-width: 1100px)'),drawer=root.querySelector('details');
  const preferenceKey=()=>`members-panel:${userId}:${desktop.matches?'desktop':'mobile'}`;
  const resize=()=>{const preference=readUiPreference(preferenceKey());drawer.open=preference===null?desktop.matches:preference==='open';};
  resize();desktop.addEventListener('change',resize);
  drawer.querySelector('summary').addEventListener('click',()=>saveUiPreference(preferenceKey(),drawer.open?'closed':'open'));
  const initials=name=>name.trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase();
  const row=(member,unavailable)=>`<li class="sidebar-member ${unavailable?'unknown':member.online?'online':'offline'}"><span class="sidebar-avatar" aria-hidden="true">${esc(initials(member.name))}<i></i></span><span><strong>${esc(member.name)}</strong><small>${esc(member.rank)} · ${unavailable?'Status unavailable':!member.hasAccount?'No website account':member.online?'Online':'Offline'}</small></span></li>`;
  let last=null,busy=false,timer,stopped=false;
  function render(unavailable=false){
    if(!last)return;
    const online=last.members.filter(m=>m.online),offline=last.members.filter(m=>!m.online);
    count.textContent=unavailable?'Unavailable':online.length+' online · '+last.members.length+' member'+(last.members.length===1?'':'s');
    const section=(label,members)=>`<section class="member-rank-group"><h2>${esc(label)} <span>${members.length}</span></h2><ul>${members.sort((a,b)=>a.name.localeCompare(b.name)).map(m=>row(m,unavailable)).join('')}</ul></section>`;
    groups.innerHTML=unavailable?section('Members',last.members):[...new Set([...last.ranks,...online.map(m=>m.rank)])].map(rank=>{const members=online.filter(m=>m.rank===rank);return members.length?section(rank,members):'';}).join('')+(offline.length?section('Offline',offline):'');
    if(!last.members.length)groups.innerHTML='<p class="member-presence-help">Members will appear here when they join.</p>';
  }
  async function update(){
    clearTimeout(timer);if(stopped||busy)return;if(!root.isConnected){root.dispose();return;}
    if(document.visibilityState==='visible'){
      busy=true;
      try{const fresh=await request('/api/presence/members');if(stopped||!root.isConnected)return;last=fresh;render();message.textContent='';}
      catch{if(root.isConnected){render(true);count.textContent='Unavailable';message.textContent='Could not refresh member status. Retrying automatically.';}}
      finally{busy=false;}
    }
    if(!stopped&&root.isConnected)timer=setTimeout(update,15000);
  }
  const visible=()=>{if(document.visibilityState==='visible')update();};
  document.addEventListener('visibilitychange',visible);
  root.dispose=()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);desktop.removeEventListener('change',resize);};
  update();
}
export function mountOnline(root,request){
  root.innerHTML='<section class="panel online-panel"><div class="online-heading"><div><h2>Online now</h2><p>Users active in the last two minutes. Updates automatically.</p></div><span id="online-count" class="account-status" role="status">Checking…</span></div><div id="online-users"></div><p id="online-error" role="status" class="access-notice"></p></section>';
  async function update(){
    if(!root.isConnected)return;
    try{
      if(document.visibilityState==='visible'){
        const {users}=await request('/api/presence');if(!root.isConnected)return;
        root.querySelector('#online-count').textContent=users.length+' online';
        root.querySelector('#online-users').innerHTML=users.length?users.map(u=>`<article class="online-person"><span class="online-dot" aria-hidden="true"></span><div><strong>${esc(u.name)}</strong><small>@${esc(u.username)}${u.owner?' · Owner':''}</small></div><span class="online-page">${esc(u.page)}</span><time datetime="${new Date(u.lastSeen).toISOString()}">${Date.now()-u.lastSeen<60000?'Just now':'1 minute ago'}</time></article>`).join(''):'<div class="empty"><p>No users are active right now.</p></div>';
        root.querySelector('#online-error').textContent='';
      }
    }catch(error){if(root.isConnected)root.querySelector('#online-error').textContent=error.message;}
    if(root.isConnected)setTimeout(update,15000);
  }
  update();
}
