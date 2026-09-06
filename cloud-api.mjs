import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {promisify} from 'node:util';
import {applyOwnerPasswordReset} from './owner-password-reset.mjs';
import {onlineUsers} from './presence.js';
import QRCode from 'qrcode/lib/core/qrcode.js';
import QRCodeSVG from 'qrcode/lib/renderer/svg-tag.js';
import {validateBackup} from './model.js';
import {validateAccess,permissionsFor,permits,visibleData,mergeAuthorizedData,accessPages,accessLevels} from './access-model.js';
import {newTotpSecret,matchingStep,seal,unseal,encryptBackup} from './security-crypto.mjs';

const scrypt=promisify(scryptCallback),digest=value=>createHash('sha256').update(value).digest('hex');
export const githubOrigin='https://blazzer10200.github.io';
export const allowedOrigin=request=>[new URL(request.url).origin,githubOrigin].includes(request.headers.get('origin'));
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});
const publicUser=u=>({id:u.id,name:u.name,username:u.username,owner:!!u.owner,disabled:!!u.disabled,approval:u.approval,requestedAt:u.requested_at,reviewedAt:u.reviewed_at,roleIds:JSON.parse(u.roles),mfaVerified:!!u.mfa_verified});
const passwordValid=p=>{if(typeof p!=='string'||p.length<12||p.length>128)fail('Use a password between 12 and 128 characters.');};
// Bound expensive hashing across requests in this isolate (scrypt uses ~32 MiB).
let cryptoJobs=0;
async function hashPassword(password,salt=randomBytes(16).toString('hex')){
  if(cryptoJobs>=1)fail('Sign-in is busy. Try again in a moment.',429);
  cryptoJobs++;try{return salt+':'+Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})).toString('hex');}finally{cryptoJobs--;}
}
async function verify(password,stored){if(typeof password!=='string'||password.length>128)return false;const result=await hashPassword(password,stored.split(':')[0]);return timingSafeEqual(Buffer.from(result),Buffer.from(stored));}
const fields=body=>{const name=typeof body.name==='string'?body.name.trim():'',username=typeof body.username==='string'?body.username.trim().toLowerCase():'';if(!name||name.length>60||!/^[a-z0-9_.-]{3,32}$/.test(username))fail('Enter your in-character name and a username of 3–32 letters, numbers, dots, underscores, or hyphens.');return {name,username};};
const tokenOf=request=>request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]||(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pto_session='))?.slice(12)||'';
const backupTables=['users','config','workspace','audit','account_security','recovery_codes','security_policy'];

export function stateFromSnapshot(document,key){
  if(document?.format!=='pto-full-backup'||document.version!==1||document.key!==key.toString('base64'))fail('Invalid migration backup.');
  const t=document.tables;if(!t||backupTables.some(n=>!Array.isArray(t[n])))fail('Incomplete migration backup.');
  if(t.users.filter(u=>u.owner===1).length!==1||t.config.length!==1||t.workspace.length!==1||t.security_policy.length!==1)fail('Invalid migration state.');
  const config=validateAccess(JSON.parse(t.config[0].document)),workspace={...t.workspace[0],document:JSON.stringify(validateBackup(JSON.parse(t.workspace[0].document)))};
  const ids=new Set();for(const u of t.users){if(ids.has(u.id)||!/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(u.password)||!['approved','pending','denied'].includes(u.approval)||JSON.parse(u.roles).some(id=>!config.roles.some(r=>r.id===id)))fail('Invalid migration account.');ids.add(u.id);}
  for(const r of t.account_security)if(r.secret)unseal(JSON.parse(r.secret),key);
  return {users:t.users,config,workspace,security:t.account_security.map(r=>({...r,pending:null,pending_until:null})),recovery:t.recovery_codes,policy:!!t.security_policy[0].require_admin_mfa,sessions:[],challenges:[]};
}
async function boundedBody(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('Expected JSON.',415);
  const reader=request.body?.getReader();if(!reader)fail('Missing request.');let length=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>950000){await reader.cancel();fail('Request too large.',413);}chunks.push(value);}
  try{const body=JSON.parse(Buffer.concat(chunks).toString());if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{fail('Invalid request.');}
}

export async function handleCloudApi(request,env){
  const {pathname:route,searchParams}=new URL(request.url),method=request.method;
  if(!env.DB||!env.PTO_SECURITY_KEY)return json({error:'The website is not configured yet.'},503);
  const db=env.DB,key=Buffer.from(env.PTO_SECURITY_KEY,'base64');if(key.length!==32)return json({error:'The website is not configured yet.'},503);
  const first=(sql,...args)=>db.prepare(sql).bind(...args).first(),all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
  const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
  try{
    await applyOwnerPasswordReset(db,env.PTO_OWNER_PASSWORD_RESET);
    const origin=request.headers.get('origin');
    if(origin&&!allowedOrigin(request))fail('Use PTO Roaster to make this request.',403);
    if(!['GET','HEAD'].includes(method)&&(!allowedOrigin(request)||request.headers.get('x-bandbook-request')!=='1'))fail('Use PTO Roaster to make this change.',403);
    const body=['GET','HEAD'].includes(method)?{}:await boundedBody(request);
    const now=Date.now(),source=request.headers.get('cf-connecting-ip')||'unknown',limited=new Set();
    async function limit(bucket,max=8){
      if(limited.has(bucket))return;limited.add(bucket);
      const r=await first('INSERT INTO pto_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count',digest(bucket),now+600000,now,now);
      if(r.count>max)fail('Too many attempts. Wait a few minutes before trying again.',429);
    }
    if(method!=='GET'&&route!=='/api/presence')await limit('ip:'+source,120);
    if(route==='/api/operator/migrate'&&method==='POST'){
      // Deployment-only capability: secret-authenticated and permanently closed after first import.
      const supplied=digest(request.headers.get('x-pto-migration')||'');
      if(!env.PTO_MIGRATION_TOKEN||!timingSafeEqual(Buffer.from(supplied),Buffer.from(digest(env.PTO_MIGRATION_TOKEN))))fail('Not found.',404);
      if(await first('SELECT id FROM pto_state WHERE id=1'))fail('Migration is already complete.',409);
      const state=stateFromSnapshot(body,key),writeId=crypto.randomUUID(),document=JSON.stringify(state);if(Buffer.byteLength(document)>1400000)fail('Migration is too large.',413);
      const rows=[stmt('INSERT INTO pto_state(id,revision,document,write_id,updated_at) VALUES(1,0,?,?,?)',document,writeId,new Date(now).toISOString())];
      for(const e of body.tables.audit)rows.push(stmt('INSERT INTO pto_events(at,user_id,action,document) VALUES(?,?,?,?)',e.at,e.user_id,e.action,e.document));
      rows.push(stmt('INSERT INTO pto_events(at,user_id,action) VALUES(?,?,?)',new Date(now).toISOString(),'operator','Local accounts and workspace migrated'));
      await db.batch(rows);return json({ok:true,accounts:state.users.length});
    }
    // A single compare-and-swap protects the complete account/permission state. D1 batches
    // commit state, audit entries and the daily encrypted snapshot atomically. A conflicting
    // request is rerun against current state; no response/token is released before commit.
    for(let attempt=0;attempt<3;attempt++){
      const row=await first('SELECT * FROM pto_state WHERE id=1');
      if(!row)return route==='/api/session'?json({authenticated:false,setupRequired:false,development:false}):json({error:'The website is being prepared. Please try again shortly.'},503);
      const s=JSON.parse(row.document),before=row.document,events=[];let responseToken=null;
      const audit=(id,action,document=null)=>events.push({at:new Date(now).toISOString(),user_id:id,action,document});
      const findUser=login=>s.users.find(u=>u.username.toLowerCase()===login||u.email===login);
      const auth=()=>{const session=s.sessions.find(x=>x.hash===digest(tokenOf(request))&&x.expires>now),u=session&&s.users.find(u=>u.id===session.user_id&&!u.disabled);return u?{...u,mfa_verified:session.mfa_verified}:null;};
      let user=auth();const securityRow=id=>s.security.find(r=>r.user_id===id),enabled=id=>!!securityRow(id)?.secret;
      const permissions=u=>permissionsFor(publicUser(u),s.config);
      const status=u=>{const admin=u.approval==='approved'&&(!!u.owner||permits(permissions(u),'access','manage'));return {mfaEnabled:enabled(u.id),recoveryCodes:s.recovery.filter(r=>r.user_id===u.id).length,admin,requireAdminMfa:s.policy,enrollmentRequired:s.policy&&admin&&!enabled(u.id)};};
      const sessionData=u=>({authenticated:true,user:publicUser(u),security:status(u),roles:s.config.roles.filter(r=>JSON.parse(u.roles).includes(r.id)).map(({id,name,color})=>({id,name,color})),permissions:permissions(u),categories:u.approval==='approved'?s.config.categories:[],pendingRequests:permits(permissions(u),'requests')?s.users.filter(u=>u.approval==='pending').length:0,development:false});
      const revoke=id=>{s.sessions=s.sessions.filter(r=>r.user_id!==id);s.challenges=s.challenges.filter(r=>r.user_id!==id);};
      const newSession=(u,verified=false)=>{responseToken=randomBytes(32).toString('base64url');s.sessions=s.sessions.filter(r=>r.expires>now);if(s.sessions.filter(r=>r.user_id===u.id).length>=20)s.sessions.splice(s.sessions.findIndex(r=>r.user_id===u.id),1);s.sessions.push({hash:digest(responseToken),user_id:u.id,expires:now+43200000,mfa_verified:Number(verified)});return sessionData({...u,mfa_verified:Number(verified)});};
      const consumeTotp=(id,code,pending=false)=>{const r=securityRow(id);if(!r||!(pending?r.pending:r.secret)||(pending&&r.pending_until<now))return false;const secret=unseal(JSON.parse(pending?r.pending:r.secret),key).toString(),step=matchingStep(secret,code,pending?-1:r.last_step,now);if(step===null)return false;r.last_step=step;return step;};
      const codeHash=(id,code)=>digest(id+':'+String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,''));
      const newCodes=id=>{const codes=Array.from({length:8},()=>randomBytes(12).toString('hex').toUpperCase().match(/.{1,6}/g).join('-'));s.recovery=s.recovery.filter(r=>r.user_id!==id);s.recovery.push(...codes.map(code=>({user_id:id,hash:codeHash(id,code)})));return codes;};
      async function reauthenticate(){await limit('confirm:'+user.id);if(!await verify(body.currentPassword,user.password))fail('Current password is incorrect.');if(enabled(user.id)&&consumeTotp(user.id,body.code)===false)fail('Enter a fresh six-digit authenticator code.');}
      const assertRoles=ids=>{if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!s.config.roles.some(r=>r.id===id)))fail('Choose valid roles.');};
      const grantsWithin=ids=>{const grants=permissionsFor({roleIds:ids},s.config);return accessPages.every(p=>accessLevels.indexOf(grants[p.id])<=accessLevels.indexOf(permissions(user)[p.id]));};
      const addUser=(f,password,roles,approval)=>{if(s.users.length>=500)fail('The account limit has been reached. Contact the Owner.');if(findUser(f.username))fail('That username is already taken.',409);const u={id:crypto.randomUUID(),...f,email:crypto.randomUUID()+'@pto.invalid',password,owner:0,disabled:0,roles:JSON.stringify(roles),approval,requested_at:new Date(now).toISOString(),reviewed_at:null,reviewed_by:null};s.users.push(u);return u;};
      async function snapshot(){return {format:'pto-full-backup',version:1,createdAt:new Date(now).toISOString(),key:key.toString('base64'),tables:{users:s.users,config:[{id:1,document:JSON.stringify(s.config)}],workspace:[s.workspace],audit:[...await all('SELECT * FROM pto_events ORDER BY id'),...events.map((e,i)=>({...e,id:1000000000+i}))],account_security:s.security.map(r=>({...r,pending:null,pending_until:null})),recovery_codes:s.recovery,security_policy:[{id:1,require_admin_mfa:Number(s.policy)}]}};}
      async function routeRequest(){
        if(route==='/api/session'&&method==='GET')return json(user?sessionData(user):{authenticated:false,setupRequired:false,development:false});
        if(route==='/api/auth/setup')fail('The Owner account is already set up.',409);
        if(route==='/api/auth/register'&&method==='POST'){
          await limit('register:'+source,10);const f=fields(body);passwordValid(body.password);if(findUser(f.username))fail('That username is already taken.',409);
          const u=addUser(f,await hashPassword(body.password),[],'pending');audit(u.id,'Account approval requested');return json(newSession(u));
        }
        if(route==='/api/auth/login'&&method==='POST'){
          const login=String(body.username??body.email??'').trim().toLowerCase(),u=findUser(login);await limit('login:'+(u?.id||login));
          if(!await verify(body.password,u?.password||'0'.repeat(32)+':'+'00'.repeat(64))||!u||u.disabled){if(u)audit(u.id,'Failed sign-in');fail('Username or password is incorrect, or the account is disabled.',401);}
          if(enabled(u.id)){const challenge=randomBytes(32).toString('base64url');s.challenges=s.challenges.filter(r=>r.expires>now&&r.user_id!==u.id);s.challenges.push({hash:digest(challenge),user_id:u.id,expires:now+300000,password_version:u.password});return json({mfaRequired:true,challenge});}
          audit(u.id,'Signed in');return json(newSession(u));
        }
        if(route==='/api/auth/mfa'&&method==='POST'){
          const challenge=s.challenges.find(r=>r.hash===digest(String(body.challenge||''))&&r.expires>now),u=challenge&&s.users.find(u=>u.id===challenge.user_id);
          if(!u||u.disabled||u.password!==challenge.password_version)fail('This sign-in expired. Start again.',401);await limit('factor:'+u.id);
          if(!enabled(u.id)||consumeTotp(u.id,body.code)===false)fail('That code is invalid or already used. Try a fresh code.',401);
          s.challenges=s.challenges.filter(r=>r.hash!==challenge.hash);audit(u.id,'Signed in with two-factor');return json(newSession(u,true));
        }
        if(route==='/api/auth/recover'&&method==='POST'){
          const login=String(body.username||'').trim().toLowerCase(),u=findUser(login);await limit('recovery:'+(u?.id||login));passwordValid(body.password);
          if(!u||u.disabled||!s.recovery.some(r=>r.user_id===u.id&&r.hash===codeHash(u.id,body.recoveryCode)))fail('The username and recovery code could not be verified.',401);
          u.password=await hashPassword(body.password);s.recovery=s.recovery.filter(r=>r.user_id!==u.id);s.security=s.security.filter(r=>r.user_id!==u.id);revoke(u.id);audit(u.id,'Account recovered; password reset and all sessions revoked');return json({ok:true});
        }
        if(!user)fail('Sign in to continue.',401);
        if(route==='/api/auth/logout'&&method==='POST'){s.sessions=s.sessions.filter(r=>r.hash!==digest(tokenOf(request)));responseToken='';return json({ok:true});}
        if(route==='/api/auth/password'&&method==='POST'){
          passwordValid(body.password);await reauthenticate();const u=s.users.find(u=>u.id===user.id);u.password=await hashPassword(body.password);revoke(u.id);audit(u.id,'Password changed');return json(newSession(u,enabled(u.id)));
        }
        if(route==='/api/security'&&method==='GET')return json({...status(user),sessions:s.sessions.filter(r=>r.user_id===user.id&&r.expires>now).length});
        if(route==='/api/security/setup'&&method==='POST'){
          await reauthenticate();if(enabled(user.id))fail('Two-factor is already enabled.');const secret=newTotpSecret(),r=securityRow(user.id)||{user_id:user.id,secret:null,last_step:-1};if(!securityRow(user.id))s.security.push(r);r.pending=JSON.stringify(seal(Buffer.from(secret),key));r.pending_until=now+600000;
          const uri=`otpauth://totp/${encodeURIComponent('PTO Roaster:'+user.username)}?secret=${secret}&issuer=PTO%20Roaster&algorithm=SHA1&digits=6&period=30`;
          const qr='data:image/svg+xml;base64,'+Buffer.from(QRCodeSVG.render(QRCode.create(uri,{errorCorrectionLevel:'M'}),{width:220,margin:2})).toString('base64');
          return json({secret,qr});
        }
        if(route==='/api/security/confirm'&&method==='POST'){
          await limit('factor:'+user.id);if(consumeTotp(user.id,body.code,true)===false)fail('That code did not match. Check your authenticator or restart setup.');
          const r=securityRow(user.id);r.secret=r.pending;r.pending=null;r.pending_until=null;const recoveryCodes=newCodes(user.id);revoke(user.id);audit(user.id,'Two-factor enabled');return json({session:newSession(user,true),recoveryCodes});
        }
        if(route==='/api/security/recovery-codes'&&method==='POST'){await reauthenticate();const recoveryCodes=newCodes(user.id);audit(user.id,'Recovery codes regenerated');return json({recoveryCodes});}
        if(route==='/api/security/revoke'&&method==='POST'){await reauthenticate();revoke(user.id);audit(user.id,'Other sessions signed out');return json(newSession(user,enabled(user.id)));}
        if(route==='/api/security/policy'&&method==='POST'){
          if(!user.owner)fail('Only the Owner can change this requirement.',403);if(body.requireAdminMfa!==true)fail('The admin requirement cannot be turned off here.');await reauthenticate();if(!enabled(user.id)||!status(user).recoveryCodes)fail('Set up your authenticator and recovery codes first.');s.policy=true;audit(user.id,'Two-factor now required for administrators');return json({ok:true});
        }
        if(status(user).enrollmentRequired)return json({error:'Set up two-factor authentication to continue.',enrollmentRequired:true},403);
        if(enabled(user.id)&&!user.mfa_verified)return json({error:'Sign in again with your authenticator.',reauthenticate:true},401);
        if(user.approval!=='approved')fail(user.approval==='denied'?'Your account request was declined.':'Your account is awaiting approval.',403);
        const perms=permissions(user),requirePage=(p,l='view')=>{if(!permits(perms,p,l))fail('Your role does not have permission for this page.',403);};
        if(route==='/api/presence'){
          if(method==='GET'){requirePage('access','manage');return json({users:onlineUsers(s.sessions,s.users,now)});}
          if(method==='POST'){
            await limit('presence:'+user.id,60);
            if(!accessPages.some(p=>p.id===body.page)||!permits(perms,body.page))fail('Choose an accessible page.',403);
            const current=s.sessions.find(r=>r.hash===digest(tokenOf(request)));current.last_seen=now;current.page=body.page;return json({ok:true});
          }
        }
        if(route==='/api/security/backup-status'&&method==='GET'){if(!user.owner)fail('Only the Owner can view full backup status.',403);const r=await first('SELECT day FROM pto_backups ORDER BY day DESC LIMIT 1');return json({enabled:true,savedAt:r?.day?new Date(r.day).toISOString():null,hosted:true});}
        if(route==='/api/security/backup'&&method==='POST'){if(!user.owner)fail('Only the Owner can export a full security backup.',403);await reauthenticate();audit(user.id,'Encrypted full backup downloaded');return json(await encryptBackup(await snapshot(),body.passphrase));}
        if(route==='/api/audit'&&method==='GET'){
          requirePage('access','manage');const rows=await all('SELECT id,at,user_id,action FROM pto_events WHERE id<? ORDER BY id DESC LIMIT 51',Number(searchParams.get('before'))||Number.MAX_SAFE_INTEGER);return json({events:rows.slice(0,50).map(e=>({...e,actor:s.users.find(u=>u.id===e.user_id)?.name||'Site operator'})),next:rows.length>50?rows[49].id:null});
        }
        if(route==='/api/requests'&&method==='GET'){requirePage('requests');return json({requests:s.users.filter(u=>['pending','denied'].includes(u.approval)).map(publicUser),roles:s.config.roles.filter(r=>grantsWithin([r.id]))});}
        if(route.startsWith('/api/requests/')&&method==='POST'){
          requirePage('requests','manage');const target=s.users.find(u=>u.id===route.slice(14));if(!target||target.owner)fail('Request not found.',404);if(target.approval!=='pending')fail('This request was already reviewed. Refresh the queue.',409);if(!['approved','denied'].includes(body.decision))fail('Choose approve or decline.');const ids=body.decision==='approved'?body.roleIds:[];assertRoles(ids);if(body.decision==='approved'&&(!ids.length||!grantsWithin(ids)))fail('Assign at least one role within your own access.',403);
          Object.assign(target,{approval:body.decision,roles:JSON.stringify(ids),reviewed_at:new Date(now).toISOString(),reviewed_by:user.id});audit(user.id,'Account request '+body.decision+': '+target.name);return json({ok:true});
        }
        if(route==='/api/access'){
          requirePage('access',method==='GET'?'view':'manage');if(method==='GET')return json({...s.config,users:s.users.map(publicUser)});
          if(method==='PUT'){const next=validateAccess(body);if(next.revision!==s.config.revision)fail('Access settings changed. Reload before saving.',409);for(const u of s.users)if(JSON.parse(u.roles).some(id=>!next.roles.some(r=>r.id===id)))fail('Reassign users before removing an assigned role.');s.config={...next,revision:next.revision+1};audit(user.id,'Roles and categories updated');return json(s.config);}
        }
        if(route==='/api/users'&&method==='POST'){requirePage('access','manage');const f=fields(body);passwordValid(body.password);assertRoles(body.roleIds);const u=addUser(f,await hashPassword(body.password),body.roleIds,'approved');audit(user.id,'Account created: '+u.name);return json({ok:true},201);}
        if(route.startsWith('/api/users/')&&method==='PUT'){
          requirePage('access','manage');const target=s.users.find(u=>u.id===route.slice(11));if(!target)fail('Account not found.',404);if(target.owner)fail('The Owner account and its access are protected.');if(target.approval!=='approved')fail('Review this account in Join requests first.');if(target.id===user.id&&body.disabled)fail('You cannot disable your own account.');assertRoles(body.roleIds);if(typeof body.disabled!=='boolean')fail('Invalid account status.');target.roles=JSON.stringify(body.roleIds);target.disabled=Number(body.disabled);revoke(target.id);audit(user.id,'Account access updated: '+target.name);return json({ok:true});
        }
        if(route==='/api/ledger'){
          const current=validateBackup(JSON.parse(s.workspace.document));if(method==='GET')return json({data:visibleData(current,perms),revision:s.workspace.revision});
          if(method==='PUT'){if(!['roster','bands','ledger','settings'].some(p=>permits(perms,p,'manage')))fail('Your roles have view access only.',403);if(!Number.isSafeInteger(body.revision)||body.revision!==s.workspace.revision)return json({error:'Records changed. Reload before saving.',conflict:true},409);let next;try{next=validateBackup(mergeAuthorizedData(current,validateBackup(body.data),perms));}catch(e){fail(e.message,403);}s.workspace={id:1,revision:s.workspace.revision+1,document:JSON.stringify(next)};audit(user.id,'Workspace updated',JSON.stringify(current));return json({data:visibleData(next,perms),revision:s.workspace.revision});}
        }
        fail('Not found.',404);
      }
      let response;try{response=await routeRequest();}catch(error){if(!error.status&&!(error instanceof Error))throw error;response=json({error:error.status?error.message:'The request could not be completed.'},error.status||400);}
      const document=JSON.stringify(s);
      if(document!==before||events.length){
        if(Buffer.byteLength(document)>1400000)fail('The workspace is full. Contact the site operator before adding more records.',413);
        const writeId=crypto.randomUUID(),revision=row.revision+1,date=new Date(now).toISOString(),day=date.slice(0,10);
        const statements=[stmt('UPDATE pto_state SET document=?,revision=?,write_id=?,updated_at=? WHERE id=1 AND revision=?',document,revision,writeId,date,row.revision)];
        for(const e of events)statements.push(stmt('INSERT INTO pto_events(at,user_id,action,document) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM pto_state WHERE id=1 AND write_id=?)',e.at,e.user_id,e.action,e.document,writeId));
        if(!await first('SELECT day FROM pto_backups WHERE day=? LIMIT 1',day)){
          const encrypted=JSON.stringify(seal(Buffer.from(JSON.stringify(await snapshot())),key));
          for(let i=0;i<encrypted.length;i+=500000)statements.push(stmt('INSERT OR IGNORE INTO pto_backups(day,part,document) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM pto_state WHERE id=1 AND write_id=?)',day,i/500000,encrypted.slice(i,i+500000),writeId));
        }
        const result=await db.batch(statements);if(!result[0].meta.changes)continue;
      }
      if(responseToken!==null){response.headers.set('Set-Cookie',`pto_session=${responseToken}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${responseToken?43200:0}`);if(request.headers.get('origin')===githubOrigin)response.headers.set('X-PTO-Session',responseToken||'signed-out');}
      return response;
    }
    return json({error:'Another update finished first. Please try again.'},409);
  }catch(error){return json({error:error.status?error.message:'The website is temporarily unavailable. Try again shortly.'},error.status||503);}
}
