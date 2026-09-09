import {auditDocument} from './audit-details.js';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {createSecurity,securitySchema} from './security-store.mjs';
import {freshData,validateBackup} from './model.js';
import {onlineUsers,memberPresence} from './presence.js';
import {profileOf,profileFields,uniqueProfile,updatedProfile,attachMember,memberRequest,assertLinkedMembers} from './member-profile.js';
import {changeVersions} from './change-versions.js';
import {hubRequest} from './hub-model.js';
import {financeRequest} from './finance-api.js';
import {preserveNavigationPermissions,enableMemberBands,enableFinanceRoles} from './access-model.js';
import {initialAccess,validateAccess,permissionsFor,permits,visibleData,mergeAuthorizedData,accessPages,accessLevels} from './access-model.js';
const scrypt=promisify(scryptCallback),digest=value=>createHash('sha256').update(value).digest('hex');
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const publicUser=user=>({id:user.id,...profileOf(user),owner:!!user.owner,accessRevision:user.accessRevision||0,disabled:!!user.disabled,approval:user.approval,requestedAt:user.requested_at,reviewedAt:user.reviewed_at,roleIds:JSON.parse(user.roles),mfaVerified:!!user.mfa_verified,remembered:!!user.session_remember});
async function hashPassword(password,salt=randomBytes(16).toString('hex')){return salt+':'+Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})).toString('hex');}
async function verifyPassword(password,stored){const [salt,hash]=stored.split(':');const result=await hashPassword(password,salt);return timingSafeEqual(Buffer.from(result.split(':')[1],'hex'),Buffer.from(hash,'hex'));}
const validatePassword=value=>{if(typeof value!=='string'||value.length<12||value.length>128)throw Error('Use a password between 12 and 128 characters.');};
function accountFields(body,required=true){
  const name=typeof body.name==='string'?body.name.trim():'';
  const legacyEmail=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const username=typeof body.username==='string'?body.username.trim().toLowerCase():legacyEmail.split('@')[0];
  if(!name||name.length>60||!username||!/^[a-z0-9_.-]{3,32}$/.test(username))throw Error('Enter your in-character name and a username of 3–32 letters, numbers, dots, underscores, or hyphens.');
  return {...profileFields({...body,name,username},{required}),email:legacyEmail||crypto.randomUUID()+'@pto.invalid'};
}
export function createDevApi({file=':memory:',seed=freshData(),key,now=Date.now,backupStatus=()=>({enabled:false}),cookieName='pto_session'}={}){
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(cookieName))throw Error('Invalid development session cookie name.');
  if(!key&&file!==':memory:')throw Error('A persistent encryption key is required for this database.');
  key=key||randomBytes(32);
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,owner INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,roles TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON users(owner) WHERE owner=1;
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS presence(session_hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,last_seen INTEGER NOT NULL,page TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,user_id TEXT NOT NULL,action TEXT NOT NULL,document TEXT);`);
  // Additive local migration preserves all existing accounts and passwords.
  const columns=new Set(db.prepare('PRAGMA table_info(users)').all().map(column=>column.name));
  for(const [name,type] of Object.entries({username:'TEXT',approval:"TEXT NOT NULL DEFAULT 'approved'",requested_at:'TEXT',reviewed_at:'TEXT',reviewed_by:'TEXT',stateId:"TEXT NOT NULL DEFAULT ''",phone:"TEXT NOT NULL DEFAULT ''",profileRevision:'INTEGER NOT NULL DEFAULT 0',accessRevision:'INTEGER NOT NULL DEFAULT 0'}))if(!columns.has(name))db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  for(const row of db.prepare('SELECT id,email FROM users WHERE username IS NULL').all()){
    let username=row.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,24);if(username.length<3)username='user';
    if(db.prepare('SELECT id FROM users WHERE username=?').get(username))username+='-'+row.id.slice(0,6);
    db.prepare('UPDATE users SET username=? WHERE id=?').run(username,row.id);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_username ON users(username COLLATE NOCASE)');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS unique_state_id ON users(stateId) WHERE stateId<>''");
  db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(JSON.stringify(initialAccess()));
  const existingConfig=JSON.parse(db.prepare('SELECT document FROM config WHERE id=1').get().document);
  if(enableMemberBands(existingConfig))db.prepare('UPDATE config SET document=? WHERE id=1').run(JSON.stringify(existingConfig));
  if(enableFinanceRoles(existingConfig))db.prepare('UPDATE config SET document=? WHERE id=1').run(JSON.stringify(existingConfig));
  if(!existingConfig.categories.some(category=>category.pages.includes('requests'))){
    const category=existingConfig.categories.find(c=>c.pages.includes('access'))||existingConfig.categories[0];category.pages.push('requests');
    // Existing custom roles do not gain review permission merely through inheritance.
    for(const role of existingConfig.roles)role.pages.requests=role.id==='admin'?'manage':'none';
    existingConfig.revision++;db.prepare('UPDATE config SET document=? WHERE id=1').run(JSON.stringify(existingConfig));
  }
  db.prepare('INSERT OR IGNORE INTO workspace VALUES(1,0,?)').run(JSON.stringify(validateBackup(seed)));
  securitySchema(db);
  const config=()=>JSON.parse(db.prepare('SELECT document FROM config WHERE id=1').get().document);
  const rawLedger=()=>{const row=db.prepare('SELECT * FROM workspace WHERE id=1').get();return {data:validateBackup(JSON.parse(row.document)),revision:row.revision};};
  const allUsers=()=>db.prepare('SELECT * FROM users').all();
  const writeProfile=u=>db.prepare('UPDATE users SET name=?,username=?,stateId=?,phone=?,profileRevision=? WHERE id=?').run(u.name,u.username,u.stateId,u.phone,u.profileRevision,u.id);
  const writeMembers=(data,revision)=>db.prepare('UPDATE workspace SET document=?,revision=? WHERE id=1').run(JSON.stringify(data),revision+1);
  const audit=(id,action,document=null)=>db.prepare('INSERT INTO audit(at,user_id,action,document) VALUES(?,?,?,?)').run(new Date().toISOString(),id,action,auditDocument(db.prepare('SELECT name FROM users WHERE id=?').get(id)?.name,document));
  const cookieToken=request=>(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  const auth=request=>{
    const session=db.prepare('SELECT users.*,sessions.mfa_verified,sessions.remember AS session_remember FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>? AND users.disabled=0').get(digest(cookieToken(request)),now());
    return session?publicUser(session):null;
  };
const sessionData=user=>{const access=config(),permissions=permissionsFor(user,access);return {authenticated:true,user,security:security.state(user),roles:access.roles.filter(role=>user.roleIds.includes(role.id)).map(({id,name,color})=>({id,name,color})),permissions,categories:user.approval==='approved'?access.categories:[],pendingRequests:permits(permissions,'requests')?db.prepare("SELECT count(*) AS count FROM users WHERE approval='pending'").get().count:0,versions:changeVersions({user,permissions,users:allUsers(),workspaceRevision:db.prepare('SELECT revision FROM workspace WHERE id=1').get().revision,accessRevision:access.revision,auditRevision:db.prepare('SELECT COALESCE(MAX(id),0) AS revision FROM audit').get().revision}),development:true};};
  const newSession=(user,verified=false,remember=!!user.remembered)=>{
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());
    const token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO sessions(hash,user_id,expires,mfa_verified,remember) VALUES(?,?,?,?,?)').run(digest(token),user.id,now()+(remember?2592000000:43200000),Number(verified),Number(remember));
    return json(sessionData({...user,mfaVerified:verified,remembered:remember}),200,{'Set-Cookie':`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/${remember?'; Max-Age=2592000':''}`});
  };
  const snapshot=()=>({format:'pto-full-backup',version:1,createdAt:new Date().toISOString(),key:key.toString('base64'),tables:Object.fromEntries(['users','config','workspace','audit','account_security','recovery_codes','security_policy'].map(table=>[table,db.prepare('SELECT * FROM '+table).all().map(row=>table==='account_security'?{...row,pending:null,pending_until:null}:row)]))});
  const security=createSecurity({db,key,auth,publicUser,newSession,config,audit,digest,verifyPassword,hashPassword,validatePassword,json,snapshot,now,backupStatus});
  const assertRoles=roleIds=>{if(!Array.isArray(roleIds)||new Set(roleIds).size!==roleIds.length||roleIds.some(id=>!config().roles.some(r=>r.id===id)))throw Error('Choose valid roles.');};
  async function handle(request,{remoteAddress='local'}={}){
    const url=new URL(request.url),route=url.pathname,method=request.method;
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return json({error:'Development API is local only.'},403);
    if(!['GET','HEAD'].includes(method)&&(request.headers.get('origin')!==url.origin||request.headers.get('x-bandbook-request')!=='1'))return json({error:'Use the development website to make this change.'},403);
    let body={};
    if(!['GET','HEAD'].includes(method)){
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Expected JSON.'},415);
      const raw=await request.text();if(Buffer.byteLength(raw)>950000)return json({error:'Request too large.'},413);
      try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'Invalid request.'},400);}
    }
    let user=auth(request);
    if(route==='/api/session'&&method==='GET')return user?json(sessionData(user)):json({authenticated:false,setupRequired:!db.prepare('SELECT id FROM users LIMIT 1').get(),development:true});
    try{
      const securityResponse=await security.handle(request,body,user,remoteAddress);
      if(securityResponse)return securityResponse;
      user=auth(request);
      if(route==='/api/auth/setup'&&method==='POST'){
        if(db.prepare('SELECT id FROM users LIMIT 1').get())return json({error:'The Owner account is already set up.'},409);
        security.limit('setup:'+remoteAddress,5);const fields=accountFields(body,false);validatePassword(body.password);const password=await security.work(()=>hashPassword(body.password));
        db.exec('BEGIN IMMEDIATE');
        try{
          if(db.prepare('SELECT id FROM users LIMIT 1').get()){db.exec('ROLLBACK');return json({error:'The Owner account is already set up.'},409);}
          const id=crypto.randomUUID();db.prepare("INSERT INTO users(id,name,email,username,password,stateId,phone,owner,roles,approval) VALUES(?,?,?,?,?,?,?,1,?,'approved')").run(id,fields.name,fields.email,fields.username,password,fields.stateId,fields.phone,'[]');audit(id,'Owner account created');db.exec('COMMIT');
          return newSession(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)),false,body.remember===true);
        }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
      }
      if(route==='/api/auth/register'&&method==='POST'){
        if(!db.prepare('SELECT id FROM users WHERE owner=1').get())return json({error:'The Owner must finish website setup first.'},409);
        security.limit('register:'+remoteAddress,10);
        const fields=accountFields(body);validatePassword(body.password);
        if(db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(fields.username))return json({error:'That username is already taken.'},409);
        uniqueProfile(allUsers(),fields);
        const password=await security.work(()=>hashPassword(body.password)),id=crypto.randomUUID();
        uniqueProfile(allUsers(),fields);
        db.prepare("INSERT INTO users(id,name,email,username,password,stateId,phone,roles,approval,requested_at) VALUES(?,?,?,?,?,?,?,?,'pending',?)").run(id,fields.name,fields.email,fields.username,password,fields.stateId,fields.phone,'[]',new Date().toISOString());
        audit(id,'Account approval requested');return newSession(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)),false,body.remember===true);
      }
      if(route==='/api/auth/login'&&method==='POST'){
        const login=typeof (body.username??body.email)==='string'?(body.username??body.email).trim().toLowerCase():'';
        const row=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=?').get(login,login);
        const bucket='login:'+(row?.id||login);security.limit('ip:'+remoteAddress,120);security.limit(bucket);
        const valid=typeof body.password==='string'&&body.password.length<=128&&await security.work(()=>verifyPassword(body.password,row?.password||'00000000000000000000000000000000:'+ '00'.repeat(64)));
        const current=row&&db.prepare('SELECT * FROM users WHERE id=?').get(row.id);
        if(!valid||!current||current.disabled||current.password!==row.password){if(current)audit(current.id,'Failed sign-in');return json({error:'Username or password is incorrect, or the account is disabled.'},401);}
        security.clear(bucket);if(security.enabled(current.id))return security.challenge(current,body.remember===true);
        audit(current.id,'Signed in');return newSession(publicUser(current),false,body.remember===true);
      }
      if(!user)return json({error:'Sign in to continue.'},401);
      const permissions=permissionsFor(user,config());
      if(route==='/api/auth/logout'&&method==='POST'){
        db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(cookieToken(request)));return json({ok:true},200,{'Set-Cookie':cookieName+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
      }
      if(route==='/api/auth/password'&&method==='POST'){
        validatePassword(body.password);await security.reauthenticate(request,body,user);const previous=db.prepare('SELECT password FROM users WHERE id=?').get(user.id).password;
        const password=await security.work(()=>hashPassword(body.password));if(!auth(request)||db.prepare('SELECT password FROM users WHERE id=?').get(user.id).password!==previous)return json({error:'Your session changed. Sign in again.'},401);
        db.prepare('UPDATE users SET password=? WHERE id=?').run(password,user.id);security.revoke(user.id);audit(user.id,'Password changed');return newSession(user,security.enabled(user.id));
      }
      if(user.approval!=='approved')return json({error:user.approval==='denied'?'Your account request was declined.':'Your account is awaiting approval.'},403);
      if(route.startsWith('/api/hub')){const current=rawLedger(),proposal=hubRequest({route,method,body,...current,permissions,actor:user,users:allUsers(),config:config(),now:now()});if(proposal){if(proposal.nextData){db.exec('BEGIN IMMEDIATE');try{writeMembers(proposal.nextData,current.revision);audit(user.id,proposal.action);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}return json(proposal.payload);}}
      if(route.startsWith('/api/finance')){
        const current=rawLedger(),proposal=financeRequest({route,method,body,data:current.data,revision:current.revision,permissions,actor:user,users:allUsers(),now:now()});
        if(proposal){if(proposal.nextData){db.exec('BEGIN IMMEDIATE');try{writeMembers(validateBackup(proposal.nextData),current.revision);audit(user.id,proposal.action);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}return json(proposal.payload);}
      }
      if(route.startsWith('/api/profiles')||route.startsWith('/api/members')||(route.startsWith('/api/users/')&&method==='DELETE')){
        const current=rawLedger(),proposal=memberRequest({route,method,body,users:allUsers(),...current,permissions,actor:user});
        if(proposal){
          if(proposal.action){db.exec('BEGIN IMMEDIATE');try{if(proposal.user)writeProfile(proposal.user);if(proposal.deletedUser){for(const table of ['sessions','login_challenges','recovery_codes','account_security'])db.prepare('DELETE FROM '+table+' WHERE user_id=?').run(proposal.deletedUser);db.prepare('DELETE FROM users WHERE id=?').run(proposal.deletedUser);}if(proposal.nextData)writeMembers(proposal.nextData,current.revision);audit(user.id,proposal.action);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
          return json(proposal.payload);
        }
      }
      if(route==='/api/presence/members'&&method==='GET'){
        if(!permits(permissions,'roster'))return json({error:'Roster access required.'},403);
        const sessions=db.prepare('SELECT sessions.user_id,sessions.expires,presence.last_seen,presence.page FROM presence JOIN sessions ON sessions.hash=presence.session_hash').all();
        return json(memberPresence(sessions,allUsers(),rawLedger().data,now()));
      }
      if(route==='/api/presence'){
        if(method==='GET'){
          if(!permits(permissions,'access','manage'))return json({error:'Account administration permission required.'},403);
          const sessions=db.prepare('SELECT sessions.user_id,sessions.expires,presence.last_seen,presence.page FROM presence JOIN sessions ON sessions.hash=presence.session_hash').all();
          return json({users:onlineUsers(sessions,db.prepare('SELECT * FROM users').all(),now())});
        }
        if(method==='POST'){
          security.limit('presence:'+user.id,60);
          if(!accessPages.some(p=>p.id===body.page)||!permits(permissions,body.page))return json({error:'Choose an accessible page.'},403);
          db.prepare('INSERT INTO presence VALUES(?,?,?) ON CONFLICT(session_hash) DO UPDATE SET last_seen=excluded.last_seen,page=excluded.page').run(digest(cookieToken(request)),now(),body.page);
          return json({ok:true});
        }
      }
      if(route==='/api/requests'&&method==='GET'){
        if(!permits(permissions,'requests'))return json({error:'Join request access required.'},403);
        const assignableRoles=config().roles.filter(role=>{const grants=permissionsFor({roleIds:[role.id]},config());return accessPages.every(page=>accessLevels.indexOf(grants[page.id])<=accessLevels.indexOf(permissions[page.id]));});
        const current=rawLedger();return json({requests:db.prepare("SELECT * FROM users WHERE approval IN ('pending','denied') ORDER BY requested_at").all().map(publicUser),roles:assignableRoles,ranks:current.data.ranks,revision:current.revision,unlinkedMembers:permits(permissions,'roster','manage')?current.data.members.filter(m=>!m.userId).map(({id,name,rank})=>({id,name,rank})):[]});
      }
      if(route.startsWith('/api/requests/')&&method==='POST'){
        if(!permits(permissions,'requests','manage'))return json({error:'Join request management permission required.'},403);
        const target=db.prepare('SELECT * FROM users WHERE id=?').get(route.slice('/api/requests/'.length));
        if(!target||target.owner)return json({error:'Request not found.'},404);
        if(body.decision==='reopen'){
          if(target.approval!=='denied')return json({error:'Only declined requests can be reopened. Refresh the queue.'},409);
          db.prepare("UPDATE users SET approval='pending',roles='[]',requested_at=?,reviewed_at=NULL,reviewed_by=NULL WHERE id=?").run(new Date().toISOString(),target.id);
          audit(user.id,'Account request reopened: '+target.name);return json({ok:true});
        }
        if(!['approved','denied'].includes(body.decision))throw Error('Choose approve or decline.');
        if(target.approval!=='pending')return json({error:'This request was already reviewed. Refresh the queue.'},409);
        const roleIds=body.decision==='approved'?body.roleIds:[];assertRoles(roleIds);
        if(body.decision==='approved'){
          if(!roleIds.length)throw Error('Assign at least one role before approving.');
          const grants=permissionsFor({roleIds},config());
          if(accessPages.some(page=>accessLevels.indexOf(grants[page.id])>accessLevels.indexOf(permissions[page.id])))return json({error:'You can only grant permissions within your own access.'},403);
        }
        const current=rawLedger();let profile,nextData;
        if(body.decision==='approved'){
          if(!permits(permissions,'roster','manage'))return json({error:'Roster management is also required to approve and add a member.'},403);
          profile=updatedProfile(allUsers(),target,body.profile,user,{review:!permits(permissions,'access','manage')});
          nextData=attachMember(current.data,allUsers(),{...profile,approval:'approved'},body,current.revision);
        }
        db.exec('BEGIN IMMEDIATE');try{
          if(profile)writeProfile(profile);if(nextData)writeMembers(nextData,current.revision);
          db.prepare('UPDATE users SET approval=?,roles=?,reviewed_at=?,reviewed_by=? WHERE id=?').run(body.decision,JSON.stringify(roleIds),new Date().toISOString(),user.id,target.id);
          audit(user.id,'Account request '+body.decision+': '+target.name,JSON.stringify({targetId:target.id,roleIds}));db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}return json({ok:true});
      }
      if(route==='/api/access'){
        if(!permits(permissions,'access',method==='GET'?'view':'manage'))return json({error:'Only access managers can manage roles and accounts.'},403);
        if(method==='GET')return json({...config(),users:db.prepare('SELECT * FROM users ORDER BY owner DESC,name').all().map(publicUser)});
        if(method==='PUT'){
          const next=preserveNavigationPermissions(config(),validateAccess(body));if(next.revision!==config().revision)return json({error:'Access settings changed. Reload before saving.'},409);
          for(const row of db.prepare('SELECT roles FROM users').all())if(JSON.parse(row.roles).some(id=>!next.roles.some(r=>r.id===id)))throw Error('Reassign users before removing an assigned role.');
          const previousConfig=config();const clean={revision:next.revision+1,categories:next.categories,roles:next.roles,financeAccessVersion:1,financeRolesVersion:1};db.prepare('UPDATE config SET document=? WHERE id=1').run(JSON.stringify(clean));audit(user.id,'Roles and categories updated',JSON.stringify({before:previousConfig,after:clean}));return json(clean);
        }
      }
      if(route==='/api/users'&&method==='POST'){
        if(!permits(permissions,'access','manage'))return json({error:'Access manager permission required.'},403);
        const fields=accountFields(body);validatePassword(body.password);assertRoles(body.roleIds);
        uniqueProfile(allUsers(),fields);
        if(db.prepare('SELECT id FROM users WHERE email=?').get(fields.email))throw Error('An account already uses that email.');
        const password=await security.work(()=>hashPassword(body.password)),id=crypto.randomUUID();
        // Re-check after password hashing in case this manager was revoked.
        const fresh=auth(request);if(!fresh||security.state(fresh).enrollmentRequired||!permits(permissionsFor(fresh,config()),'access','manage'))return json({error:'Your access changed. Sign in again.'},403);
        assertRoles(body.roleIds);uniqueProfile(allUsers(),fields);db.prepare("INSERT INTO users(id,name,email,username,password,stateId,phone,roles,approval) VALUES(?,?,?,?,?,?,?,?,'approved')").run(id,fields.name,fields.email,fields.username,password,fields.stateId,fields.phone,JSON.stringify(body.roleIds));audit(user.id,'Account created: '+id);return json({ok:true},201);
      }
      if(route.startsWith('/api/users/')&&method==='PUT'){
        if(!permits(permissions,'access','manage'))return json({error:'Access manager permission required.'},403);
        const target=db.prepare('SELECT * FROM users WHERE id=?').get(route.slice('/api/users/'.length));
        if(!target)return json({error:'Account not found.'},404);
        if(target.owner)throw Error('The Owner account and its access are protected.');
        if(target.approval!=='approved')throw Error('Review this account in Join requests first.');
        if(target.id===user.id&&body.disabled)throw Error('You cannot disable your own account.');
        assertRoles(body.roleIds);if(typeof body.disabled!=='boolean')throw Error('Invalid account status.');
        if(body.accessRevision!==(target.accessRevision||0))return json({error:'Access changed since you opened this person. Reload their current access before saving.'},409);
        if(JSON.stringify([...body.roleIds].sort())===JSON.stringify(JSON.parse(target.roles).sort())&&body.disabled===!!target.disabled)return json({ok:true,unchanged:true});
        db.prepare('UPDATE users SET roles=?,disabled=?,accessRevision=accessRevision+1 WHERE id=?').run(JSON.stringify(body.roleIds),Number(body.disabled),target.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);audit(user.id,'Account access updated: '+target.name,JSON.stringify({targetId:target.id,previousRoles:JSON.parse(target.roles),previousDisabled:!!target.disabled,roleIds:body.roleIds,disabled:body.disabled}));return json({ok:true});
      }
      if(route==='/api/ledger'){
        const current=rawLedger();
        if(method==='GET')return json({...current,data:visibleData(current.data,permissions)});
        if(method==='PUT'){
          if(!['roster','bands','ledger','settings'].some(page=>permits(permissions,page,'manage')))return json({error:'Your roles have view access only.'},403);
          if(!Number.isSafeInteger(body.revision)||body.revision!==current.revision)return json({error:'Records changed. Reload before saving.',conflict:true},409);
          const incoming=validateBackup(body.data);let next;
          try{next=validateBackup(mergeAuthorizedData(current.data,incoming,permissions));assertLinkedMembers(current.data,next,allUsers());}catch(error){return json({error:error.message},403);}
          db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE workspace SET document=?,revision=? WHERE id=1').run(JSON.stringify(next),current.revision+1);audit(user.id,'Workspace updated',JSON.stringify(current.data));db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
          return json({data:visibleData(next,permissions),revision:current.revision+1});
        }
      }
      return json({error:'Not found.'},404);
    }catch(error){return json({error:error.message?.startsWith('UNIQUE constraint')?'That account already exists.':error.message||'Could not complete the request.'},error.status||400);}
  }
  return {handle,close:()=>db.close(),db,snapshot};
}
