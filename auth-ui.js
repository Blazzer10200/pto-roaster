import {identityInputs,readIdentity,pickerMarkup,mountProfilePicker,mountProfileEditor} from './profile-ui.js';
import {mountSecurity,mountAudit,mountBackups,twoFactorScreen,recoveryScreen} from './security-ui.js';
import {apiFetch} from './api-config.js';
import {mountOnline} from './presence-ui.js';
import {accessPages,accessLevels,permits} from './access-model.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function authRequest(path,{method='GET',body}={}){
  const response=await apiFetch(path,{method,signal:AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json','X-Bandbook-Request':'1'}:{},...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json();if(!response.ok){const error=Error(payload.error||'Request failed.');error.status=response.status;throw error;}return payload;
}
export function loginScreen(session,onSuccess,mode=session.setupRequired?'setup':location.hash==='#join'?'register':'login'){
  const setup=mode==='setup',creating=mode!=='login';
  document.querySelector('#app').innerHTML=`<main class="auth-shell"><section class="auth-card"><img class="auth-logo" src="./pto-still.png" alt="PTO logo"><div class="auth-eyebrow">PTO ROASTER</div><h1>${setup?'Create your Owner account':creating?'Request to join PTO':'Welcome back'}</h1><p>${setup?'One-time setup for the protected Owner account.':creating?'Create your account and member profile. Approval adds you to the gang roster.':'Sign in to open your gang workspace.'}</p><form id="auth-form">${creating?identityInputs('auth'):'<label for="auth-username">Username</label><input id="auth-username" name="username" required maxlength="254" autocapitalize="none" spellcheck="false" autocomplete="username">'}<label for="auth-password">Password</label><input id="auth-password" name="password" type="password" required minlength="${creating?12:1}" maxlength="128" autocomplete="${creating?'new-password':'current-password'}">${creating?'<small>12+ characters. Your password stays private.</small>':''}<label class="remember-login"><input id="auth-remember" type="checkbox" checked><span>Keep me signed in on this device<small>For up to 30 days. Uncheck on a shared device.</small></span></label><div id="auth-error" class="form-error" role="alert"></div><button class="button primary" type="submit">${setup?'Create Owner account':creating?'Create account & request access':'Sign in'}</button></form>${!setup?`<div class="auth-switch"><span>${creating?'Already have an account?':'New to PTO?'}</span><button class="text-button" type="button" id="auth-switch">${creating?'Back to sign in':'Create account'}</button></div>`:''}${!creating?'<button class="text-button security-back" type="button" id="auth-recover">Trouble signing in?</button>':''}<div class="auth-footnote">${session.development?'Development workspace · Accounts are local for now':'Private gang workspace · Approval required'}</div></section></main>`;
  document.querySelector('#auth-switch')?.addEventListener('click',()=>loginScreen(session,onSuccess,creating?'login':'register'));
  document.querySelector('#auth-recover')?.addEventListener('click',()=>recoveryScreen(authRequest,()=>loginScreen(session,onSuccess)));
  const form=document.querySelector('#auth-form');form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;document.querySelector('#auth-error').textContent='';try{const result=await authRequest('/api/auth/'+(setup?'setup':creating?'register':'login'),{method:'POST',body:{name:document.querySelector('#auth-name')?.value,username:document.querySelector('#auth-username').value,stateId:document.querySelector('#auth-state-id')?.value,phone:document.querySelector('#auth-phone')?.value,password:document.querySelector('#auth-password').value,remember:document.querySelector('#auth-remember').checked}});if(result.mfaRequired){twoFactorScreen(result,onSuccess,authRequest,()=>loginScreen(session,onSuccess));return;}await onSuccess(result);}catch(error){document.querySelector('#auth-error').textContent=error.message;button.disabled=false;}};
}
export function approvalScreen(session,onSuccess){
  const denied=session.user.approval==='denied';
  document.querySelector('#app').innerHTML=`<main class="auth-shell"><section class="auth-card approval-card"><img class="auth-logo" src="./pto-still.png" alt="PTO logo"><span class="approval-badge">${denied?'Request declined':'Awaiting approval'}</span><h1>${denied?'Your request was declined':'Your request is in'}</h1><p>${denied?'Contact an Owner or authorized reviewer if you think this was a mistake.':'An Owner or authorized reviewer needs to approve your account before you can enter the website.'}</p><div class="request-identity"><strong>${esc(session.user.name)}</strong><span>@${esc(session.user.username)}</span><span>State ID: ${esc(session.user.stateId||'Not set')} · Phone: ${esc(session.user.phone||'Not set')}</span></div><div id="approval-message" class="form-error" role="status"></div><button class="button primary" id="approval-refresh">Check status</button><button class="text-button" id="approval-signout">Sign out</button></section></main>`;
  document.querySelector('#approval-refresh').onclick=async()=>{const button=document.querySelector('#approval-refresh');button.disabled=true;try{const updated=await authRequest('/api/session');if(!updated.authenticated||updated.user.approval==='approved'||updated.user.approval!==session.user.approval){await onSuccess(updated);return;}document.querySelector('#approval-message').textContent=denied?'Your request is still declined.':'Still waiting. Your request is visible to reviewers.';}catch(error){document.querySelector('#approval-message').textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}};
  document.querySelector('#approval-signout').onclick=async()=>{try{await authRequest('/api/auth/logout',{method:'POST',body:{}});await onSuccess({authenticated:false,setupRequired:false});}catch(error){document.querySelector('#approval-message').textContent=error.message;}};
}
export async function mountRequests(root,session,onUpdate){
  let queue,busy=false;
  const canReview=permits(session.permissions,'requests','manage'),canApprove=canReview&&permits(session.permissions,'roster','manage'),canEditIdentity=permits(session.permissions,'access','manage');
  root.seenVersion=session.versions?.requests;
  async function load(preserve=false){
    const fresh=await authRequest('/api/requests');if(!root.isConnected)return false;
    const drafts=new Map(),focusId=document.activeElement?.id;
    if(preserve&&queue)root.querySelectorAll('[data-review-request]').forEach(form=>{
      const id=form.dataset.reviewRequest,old=queue.requests.find(u=>u.id===id),updated=fresh.requests.find(u=>u.id===id&&u.approval==='pending');
      if(old&&updated&&old.profileRevision===updated.profileRevision)drafts.set(id,{profile:readIdentity(form,old),roles:[...form.querySelectorAll('[name=approved-role]:checked')].map(el=>el.value),link:form.querySelector('#'+CSS.escape('request-link-'+id))?.value,rank:form.querySelector('#'+CSS.escape('request-rank-'+id))?.value});
    });
    queue=fresh;render(drafts);if(focusId)root.querySelector('#'+CSS.escape(focusId))?.focus();return true;
  }
  root.refreshFromServer=async()=>busy?false:load(true);
  function render(drafts=new Map()){
    const pending=queue.requests.filter(user=>user.approval==='pending'),denied=queue.requests.filter(user=>user.approval==='denied');
    root.innerHTML=`<div class="page-heading"><div><h1>Join requests</h1><p>Approve an account and connect their gang profile in one step.</p></div><button class="button secondary" id="requests-refresh">Refresh</button></div><div id="requests-message" class="access-notice" role="status"></div>
    ${canReview&&!canApprove?'<p class="readonly-notice">Approving and adding members requires Manage on both Join requests and Roster. Ask the Owner to update your role.</p>':''}
    <div class="requests-count">${pending.length} awaiting approval</div><div class="request-list">
    ${pending.map(user=>`<article class="panel join-request"><div class="request-heading"><div><h2>${esc(user.name)}</h2><p>@${esc(user.username)}</p></div><small>${esc(new Date(user.requestedAt).toLocaleString())}</small></div>
    <form data-review-request="${esc(user.id)}">${identityInputs('request-'+user.id,{...user,...drafts.get(user.id)?.profile},{readonly:!canApprove})}
    ${canApprove?pickerMarkup('request-link-'+user.id,'Roster profile')+pickerMarkup('request-rank-'+user.id,'Gang rank'):''}
    <label>Website access</label><div class="user-role-options">${queue.roles.map(role=>`<label class="role-check"><input type="checkbox" name="approved-role" value="${esc(role.id)}" ${drafts.get(user.id)?.roles.includes(role.id)?'checked':''} ${canApprove?'':'disabled'}><span class="role-color" style="--role-color:${role.color}"></span>${esc(role.name)}</label>`).join('')||'<p>No roles are within your access. Ask the Owner to review this request.</p>'}</div>
    ${canApprove?'<p class="access-help">Linking an existing roster profile keeps its current rank, status, joined date, and notes. Gang rank does not change website permissions.</p><button class="button primary" type="submit">Approve & add to roster</button>':''}
    ${canReview?'<button class="button secondary" type="button" data-decline-request="'+esc(user.id)+'">Decline</button>':''}</form></article>`).join('')||'<section class="panel empty"><h3>All caught up.</h3><p>New account requests will appear here.</p></section>'}</div>
    ${denied.length?`<details class="declined-requests"><summary>Declined requests (${denied.length})</summary>${denied.map(user=>`<div><span>${esc(user.name)} <small>@${esc(user.username)}</small></span><small>Declined</small>${canReview?'<button class="text-button" data-reopen-request="'+esc(user.id)+'">Review again</button>':''}</div>`).join('')}</details>`:''}`;
    root.querySelector('#requests-refresh').onclick=()=>load(true).catch(showError);
    root.querySelectorAll('[data-review-request]').forEach(form=>{
      const id=form.dataset.reviewRequest;
      if(!canEditIdentity)form.querySelectorAll('[data-profile=name],[data-profile=username]').forEach(input=>input.readOnly=true);
      if(canApprove){
        const rankId='request-rank-'+id;
        mountProfilePicker(root,rankId,queue.ranks.map(rank=>({id:rank,name:rank})),drafts.get(id)?.rank||queue.ranks.at(-1));
        mountProfilePicker(root,'request-link-'+id,[{id:'new',name:'Create a new roster profile'},...queue.unlinkedMembers.map(m=>({id:m.id,name:m.name+' · '+m.rank}))],drafts.get(id)?.link||'new',value=>{
          const linked=value&&value!=='new';form.querySelector('#'+CSS.escape(rankId+'-picker')).hidden=linked;form.querySelector('label[for="'+rankId+'-search"]').hidden=linked;form.querySelector('#'+CSS.escape(rankId+'-search')).required=!linked;
        });
      }
      form.onsubmit=event=>{event.preventDefault();if(canApprove)review(id,'approved',form);};
    });
    for(const [id,draft] of drafts)if(draft.link&&draft.link!=='new'){
      root.querySelector('#'+CSS.escape('request-rank-'+id+'-picker')).hidden=true;
      root.querySelector('label[for="request-rank-'+id+'-search"]').hidden=true;
      root.querySelector('#'+CSS.escape('request-rank-'+id+'-search')).required=false;
    }
    root.querySelectorAll('[data-reopen-request]').forEach(button=>button.onclick=()=>review(button.dataset.reopenRequest,'reopen'));
    root.querySelectorAll('[data-decline-request]').forEach(button=>button.onclick=()=>review(button.dataset.declineRequest,'denied'));
  }
  function showError(error){const message=root.querySelector('#requests-message');if(message)message.textContent=error.message;}
  async function review(id,decision,form){
    if(busy||!canReview)return;const roleIds=form?[...form.querySelectorAll('[name=approved-role]:checked')].map(input=>input.value):[];
    if(decision==='approved'&&!roleIds.length){showError(Error('Select at least one website role before approving.'));return;}
    const user=queue.requests.find(u=>u.id===id),link=form?.querySelector('#'+CSS.escape('request-link-'+id))?.value;
    const body={decision,roleIds,...(form?{profile:readIdentity(form,user),joined:new Date().toLocaleDateString('en-CA'),memberId:link==='new'?'':link,rank:form.querySelector('#'+CSS.escape('request-rank-'+id)).value,revision:queue.revision}:{})};
    busy=true;root.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{await authRequest('/api/requests/'+id,{method:'POST',body});await load(true);await onUpdate(decision==='approved'?'Account approved and roster profile linked.':decision==='reopen'?'Request reopened for review.':'Request declined.');}
    catch(error){if(error.status===409){try{await load(true);showError(Error('This request or its details changed. The queue is now up to date; review the current details.'));}catch(refreshError){showError(refreshError);}}else showError(error);}finally{busy=false;root.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  try{await load();}catch(error){root.innerHTML=`<p class="notice error">${esc(error.message)}</p>`;}
}
export function accountDialog(user,openModal,onSessionChange){
  openModal(`<div class="account-profile-summary"><h2>${esc(user.name)}</h2><p>@${esc(user.username)} · State ID: ${esc(user.stateId||'Not set')}</p><p>In-game phone: ${esc(user.phone||'Not set')}</p><small>Ask an account administrator to update your member details.</small></div><div id="account-security-panel"></div>`);
  mountSecurity(document.querySelector('#account-security-panel'),{request:authRequest,user,onDone:async()=>{if(onSessionChange)await onSessionChange();document.querySelector('#modal').close();}});
}
const levelLabel=level=>({inherit:'Inherit',none:'No access',view:'View',manage:'Manage'}[level]);
const choices=(name,value,inherit=false)=>`<div class="permission-choices">${[...(inherit?['inherit']:[]),...accessLevels].map(level=>`<label><input type="radio" name="${esc(name)}" value="${level}" ${value===level?'checked':''}><span>${levelLabel(level)}</span></label>`).join('')}</div>`;
export async function mountAccess(root,session,onSessionChange,onProfileChange=async()=>{}){
  let config,tab='roles',selected='',busy=false,notice='';const canManage=permits(session.permissions,'access','manage');
  try{config=await authRequest('/api/access');selected=config.roles[0]?.id||'';}catch(error){root.innerHTML=`<p class="notice error">${esc(error.message)}</p>`;return;}
  root.seenVersions={...session.versions};
  root.refreshFromServer=async(canApply=()=>true)=>{if(busy||!root.isConnected)return false;const fresh=await authRequest('/api/access');if(!root.isConnected||!canApply())return false;config=fresh;if(!config.roles.some(r=>r.id===selected))selected=config.roles[0]?.id||'';render();return true;};
  const roleChecks=(user,field)=>config.roles.map(role=>`<label class="role-check"><input type="checkbox" name="${field}" value="${esc(role.id)}" ${user?.roleIds.includes(role.id)?'checked':''}><span style="--role-color:${role.color}" class="role-color"></span>${esc(role.name)}</label>`).join('');
  function render(){
    root.currentTab=tab;
    const role=config.roles.find(r=>r.id===selected);
    let content='';
    if(tab==='roles')content=`<div class="roles-layout"><aside class="roles-list"><div class="owner-role"><strong>Owner</strong><small>Full access · Protected</small></div>${config.roles.map(r=>`<button class="role-choice ${r.id===selected?'selected':''}" data-role-select="${esc(r.id)}"><i style="background:${r.color}"></i>${esc(r.name)}<small>${config.users.filter(u=>u.roleIds.includes(r.id)).length}</small></button>`).join('')}${canManage?'<button class="button secondary" data-access-action="add-role">+ Add role</button>':''}</aside><section class="panel role-editor">${role?`<form id="role-form"><div class="role-heading"><div><label for="role-name">Role name</label><input id="role-name" required maxlength="40" value="${esc(role.name)}"></div><div><label for="role-color">Color</label><input id="role-color" type="color" value="${role.color}"></div></div><p class="access-help">Bands View lets members submit and see their own deposits. Ledger View shows gang finances; Ledger Manage confirms payouts and weekly bills. Manage on Roles & access controls accounts and role rules. Category permissions apply unless a page overrides them.</p>${config.categories.map(category=>`<section class="permission-category"><div class="permission-row category-default"><div><strong>${esc(category.name)}</strong><small>Category default</small></div>${choices('category-'+category.id,role.categories[category.id]||'none')}</div>${category.pages.map(id=>`<div class="permission-row"><span>${accessPages.find(p=>p.id===id).name}</span>${choices('page-'+id,role.pages[id]||'inherit',true)}</div>`).join('')}</section>`).join('')}${canManage?'<div class="access-actions"><button class="button primary">Save role</button><button type="button" class="text-button" data-access-action="remove-role">Remove role</button></div>':''}</form>`:'<div class="empty"><h3>Add a role to get started.</h3></div>'}</section></div>`;
    if(tab==='people')content=`<div class="accounts-layout"><section class="panel account-list">${config.users.filter(user=>user.approval==='approved').map(user=>`<article class="access-person"><div><strong>${esc(user.name)}</strong><small>@${esc(user.username)} · State ID: ${esc(user.stateId||'Not set')}</small><small>Phone: ${esc(user.phone||'Not set')}</small></div><span class="account-status">${user.owner?'Owner':user.disabled?'Disabled':'Enabled'}</span>
    ${canManage&&(!user.owner||session.user.id===user.id)?'<details class="account-profile"><summary>Edit profile</summary><div data-profile-editor="'+esc(user.id)+'"></div></details>':''}
    ${user.owner?'<p class="muted">Full access. This account cannot be disabled or demoted.</p>':`<form data-user-form="${esc(user.id)}"><div class="user-role-options">${roleChecks(user,'roles')}</div><label class="role-check"><input type="checkbox" name="disabled" ${user.disabled?'checked':''}> Account disabled</label>${canManage?'<button class="button secondary">Save access</button>':''}</form>`}</article>`).join('')}</section>
    ${canManage?'<section class="panel new-user-panel"><h2>Bring in a member</h2><p>Invite them from the roster so they can create their own login. Approve their join request to assign a gang rank and website access together.</p><button class="button secondary" data-page="roster">Open roster</button><p>Already have an account? Use Add existing account in the roster invitation panel.</p></section>':''}</div>`;
    if(tab==='categories')content=`<form id="categories-form" class="panel categories-editor"><h2>Navigation categories</h2><p class="access-help">Group pages like Discord channels. Moving a page changes which category permissions it inherits.</p><div class="category-names">${config.categories.map(c=>`<label>Category name<input data-category-name="${esc(c.id)}" value="${esc(c.name)}" required maxlength="40"></label>`).join('')}</div>${accessPages.map(page=>`<fieldset class="category-assignment"><legend>${page.name}</legend>${config.categories.map(c=>`<label class="role-check"><input type="radio" name="category-for-${page.id}" value="${esc(c.id)}" ${c.pages.includes(page.id)?'checked':''}>${esc(c.name)}</label>`).join('')}</fieldset>`).join('')}${canManage?'<div class="access-actions"><button class="button primary">Save categories</button><button type="button" class="button secondary" data-access-action="add-category">+ Add category</button></div>':''}</form>`;
    if(tab==='activity')content='<div id="activity-panel"></div>';
    if(tab==='online')content='<div id="online-panel"></div>';
    if(tab==='backups')content='<div id="full-backup-panel"></div>';
    root.innerHTML=`<div class="page-heading"><div><h1>Roles & access</h1><p>Decide who can see and manage each part of PTO.</p></div></div><div class="tabs access-tabs">${['roles','people','categories',...(canManage?['online','activity']:[]),...(session.user.owner?['backups']:[])].map(id=>`<button data-access-tab="${id}" class="${id===tab?'selected':''}">${id[0].toUpperCase()+id.slice(1)}</button>`).join('')}</div><p class="access-notice" role="status">${esc(notice)}</p>${content}${['roles','people','categories'].includes(tab)?'<p class="access-footnote">Multiple roles combine their allowed permissions. Owner always has full access. Website roles are separate from roster ranks.</p>':''}`;
    root.querySelectorAll('[data-profile-editor]').forEach(panel=>{const user=config.users.find(u=>u.id===panel.dataset.profileEditor);mountProfileEditor(panel,user,{request:authRequest,onSaved:async()=>{notice='Profile saved. Account and roster details are up to date.';await onProfileChange();config=await authRequest('/api/access');render();}});});
    if(tab==='activity')mountAudit(root.querySelector('#activity-panel'),authRequest);
    if(tab==='online')mountOnline(root.querySelector('#online-panel'),authRequest);
    if(tab==='backups')mountBackups(root.querySelector('#full-backup-panel'),authRequest);
    if(!canManage)root.querySelectorAll('input,textarea').forEach(input=>input.disabled=true);
    root.querySelector('#role-form')?.addEventListener('submit',event=>{event.preventDefault();if(!canManage)return;const form=event.currentTarget;const updated={...role,name:form.querySelector('#role-name').value.trim(),color:form.querySelector('#role-color').value,categories:Object.fromEntries(config.categories.map(c=>[c.id,form.querySelector(`[name="category-${c.id}"]:checked`).value])),pages:Object.fromEntries(accessPages.map(p=>[p.id,form.querySelector(`[name="page-${p.id}"]:checked`).value]))};saveConfig({...config,roles:config.roles.map(r=>r.id===role.id?updated:r)});});
    root.querySelector('#categories-form')?.addEventListener('submit',event=>{event.preventDefault();if(!canManage)return;const form=event.currentTarget;saveConfig({...config,categories:config.categories.map(c=>({...c,name:form.querySelector(`[data-category-name="${c.id}"]`).value.trim(),pages:accessPages.filter(p=>form.querySelector(`[name="category-for-${p.id}"]:checked`).value===c.id).map(p=>p.id)}))});});
    root.querySelectorAll('[data-user-form]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();if(!canManage)return;run(async()=>{await authRequest('/api/users/'+form.dataset.userForm,{method:'PUT',body:{roleIds:[...form.querySelectorAll('[name=roles]:checked')].map(input=>input.value),disabled:form.querySelector('[name=disabled]').checked}});notice='Access saved. Existing sessions for that account were signed out.';await onSessionChange();config=await authRequest('/api/access');render();});}));
  }
  async function run(action){if(busy)return;busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(error){notice=error.message;render();}finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  function saveConfig(next){run(async()=>{const saved=await authRequest('/api/access',{method:'PUT',body:next});config={...saved,users:config.users};notice='Permissions saved.';await onSessionChange();render();});}
  root.onclick=event=>{const button=event.target.closest('button');if(!button||busy)return;if(button.dataset.accessTab){tab=button.dataset.accessTab;notice='';render();}if(button.dataset.roleSelect){selected=button.dataset.roleSelect;notice='';render();}if(!canManage)return;switch(button.dataset.accessAction){case 'add-role':{const role={id:crypto.randomUUID(),name:'New role',color:'#78b7ff',categories:{},pages:{}};config.roles.push(role);selected=role.id;render();break;}case 'remove-role':saveConfig({...config,roles:config.roles.filter(role=>role.id!==selected)});selected='';break;case 'add-category':config.categories.push({id:crypto.randomUUID(),name:'New category',pages:[]});render();break;}};
  render();
}
