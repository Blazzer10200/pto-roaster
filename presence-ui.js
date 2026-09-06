const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
