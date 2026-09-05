export const accessPages=[{id:'roster',name:'Roster'},{id:'bands',name:'Bands'},{id:'ledger',name:'Ledger'},{id:'settings',name:'Settings'},{id:'access',name:'Roles & access'},{id:'requests',name:'Join requests'}];
export const accessLevels=['none','view','manage'];
export function initialAccess(){return {revision:0,categories:[{id:'gang',name:'Gang',pages:['roster']},{id:'treasury',name:'Treasury',pages:['bands','ledger']},{id:'administration',name:'Administration',pages:['settings','access','requests']}],roles:[{id:'admin',name:'Admin',color:'#78b7ff',categories:{gang:'manage',treasury:'manage',administration:'manage'},pages:{}},{id:'member',name:'Member',color:'#a0a6b0',categories:{gang:'view'},pages:{}}]};}
export function permissionsFor(user,config){
  const permissions=Object.fromEntries(accessPages.map(p=>[p.id,'none']));
  if(!user||user.disabled||(user.approval&&user.approval!=='approved'))return permissions;
  if(user.owner)return Object.fromEntries(accessPages.map(p=>[p.id,'manage']));
  for(const role of config.roles.filter(r=>user.roleIds.includes(r.id)))for(const page of accessPages){
    const category=config.categories.find(c=>c.pages.includes(page.id));
    const override=role.pages[page.id];
    const level=override&&override!=='inherit'?override:role.categories[category?.id]||'none';
    if(accessLevels.indexOf(level)>accessLevels.indexOf(permissions[page.id]))permissions[page.id]=level;
  }
  return permissions;
}
export const permits=(permissions,page,level='view')=>accessLevels.indexOf(permissions?.[page])>=accessLevels.indexOf(level);
export function validateAccess(config){
  if(!config||!Number.isSafeInteger(config.revision)||config.revision<0||!Array.isArray(config.roles)||config.roles.length>40||!Array.isArray(config.categories)||!config.categories.length||config.categories.length>15)throw Error('Invalid access settings.');
  const ids=new Set(),pages=[];
  const identity=item=>{if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>40)throw Error('Use unique IDs and names of up to 40 characters.');ids.add(item.id);};
  for(const category of config.categories){identity(category);if(!Array.isArray(category.pages))throw Error('Invalid category pages.');pages.push(...category.pages);}
  if(pages.length!==accessPages.length||new Set(pages).size!==accessPages.length||pages.some(id=>!accessPages.some(p=>p.id===id)))throw Error('Every page must belong to exactly one category.');
  for(const role of config.roles){identity(role);if(!/^#[0-9a-f]{6}$/i.test(role.color)||!role.pages||!role.categories||typeof role.pages!=='object'||typeof role.categories!=='object')throw Error('Invalid role.');
    for(const [id,level] of Object.entries(role.pages))if(!pages.includes(id)||!['inherit',...accessLevels].includes(level))throw Error('Invalid page permission.');
    for(const [id,level] of Object.entries(role.categories))if(!config.categories.some(c=>c.id===id)||!accessLevels.includes(level))throw Error('Invalid category permission.');
  }
  return config;
}
export function visibleData(data,permissions){
  return {version:data.version,name:data.name,members:permits(permissions,'roster')?data.members:[],gangNotes:permits(permissions,'roster')?data.gangNotes:'',ranks:permits(permissions,'roster')||permits(permissions,'settings')?data.ranks:['Member'],rosterLimit:permits(permissions,'roster')||permits(permissions,'settings')?data.rosterLimit:0,bands:permits(permissions,'bands')||permits(permissions,'settings')?data.bands:[],contacts:permits(permissions,'ledger')?data.contacts:permits(permissions,'bands')?data.contacts.map(c=>({id:c.id,name:c.name,notes:''})):[],purchases:permits(permissions,'ledger')?data.purchases:[]};
}
export function mergeAuthorizedData(current,incoming,permissions){
  const visible=visibleData(current,permissions),next={...current};
  const changed=field=>JSON.stringify(incoming[field])!==JSON.stringify(visible[field]);
  for(const [field,page] of Object.entries({name:'settings',members:'roster',gangNotes:'roster',ranks:'settings',rosterLimit:'settings',bands:'settings'})){
    if(changed(field)){if(!permits(permissions,page,'manage'))throw Error('You cannot change '+field+'.');next[field]=incoming[field];}
  }
  for(const field of ['contacts','purchases'])if(changed(field)){
    if(permits(permissions,'ledger','manage')){next[field]=incoming[field];continue;}
    if(!permits(permissions,'bands','manage'))throw Error('You cannot change the band ledger.');
    const existing=new Map(current[field].map(item=>[item.id,item]));
    for(const old of visible[field])if(JSON.stringify(incoming[field].find(item=>item.id===old.id))!==JSON.stringify(old))throw Error('You can add new entries, but cannot change existing ledger records.');
    const added=incoming[field].filter(item=>!visible[field].some(old=>old.id===item.id));
    if(added.some(item=>existing.has(item.id)))throw Error('That ledger record already exists.');
    next[field]=[...current[field],...added];
  }
  return next;
}
