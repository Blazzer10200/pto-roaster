const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accountMenu(session){
  const user=session.user,initials=user.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('');
  const roles=user.owner?'Owner':(session.roles||[]).map(role=>role.name).join(' · ')||'Member';
  return `<details class="account-menu"><summary aria-label="Your account menu"><span class="account-avatar" aria-hidden="true">${esc(initials)}</span><span class="account-identity"><strong>${esc(user.name)}</strong><small>${esc(roles)}</small></span><span class="account-chevron" aria-hidden="true">⌄</span></summary><div class="account-popover"><div class="account-meta"><strong>${esc(user.name)}</strong><span>@${esc(user.username)}</span><small>${esc(roles)}</small></div><button type="button" data-action="account">Account settings <span aria-hidden="true">↗</span></button><button type="button" data-action="logout">Sign out <span aria-hidden="true">→</span></button></div></details>`;
}
// Native disclosure behavior supports keyboard activation; dismiss without trapping focus.
export function dismissAccountMenu(event){
  const menu=document.querySelector('.account-menu[open]');if(!menu)return;
  if(event.type==='keydown'&&event.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}
  if(event.type==='click'&&(!menu.contains(event.target)||event.target.closest('[data-action]')))menu.open=false;
  if(event.type==='focusin'&&!menu.contains(event.target))menu.open=false;
}
