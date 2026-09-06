import {createHash} from 'node:crypto';
// Operator-only recovery, configured through private hosting settings, never request input.
// It targets an existing Owner and exact previous password hash, and expires after one hour.
// Clearing the deployment setting disables it; a successful reset cannot be replayed.
export async function applyOwnerPasswordReset(db,setting,now=Date.now()){
  if(!setting)return;
  const reset=JSON.parse(setting),digest=value=>createHash('sha256').update(value).digest('hex');
  if(typeof reset.ownerId!=='string'||typeof reset.username!=='string'||!Number.isSafeInteger(reset.expires)||reset.expires<=now||reset.expires>now+3600000||!/^[a-f0-9]{64}$/.test(reset.previousDigest)||!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(reset.password))return;
  for(let attempt=0;attempt<3;attempt++){
    const row=await db.prepare('SELECT * FROM pto_state WHERE id=1').first();if(!row)return;
    const state=JSON.parse(row.document),owner=state.users.find(u=>u.id===reset.ownerId&&u.username===reset.username&&u.owner===1);
    if(!owner||digest(owner.password)!==reset.previousDigest)return;
    owner.password=reset.password;
    state.sessions=state.sessions.filter(s=>s.user_id!==owner.id);
    state.challenges=state.challenges.filter(s=>s.user_id!==owner.id);
    const writeId=crypto.randomUUID(),date=new Date(now).toISOString();
    const results=await db.batch([
      db.prepare('UPDATE pto_state SET document=?,revision=revision+1,write_id=?,updated_at=? WHERE id=1 AND revision=?').bind(JSON.stringify(state),writeId,date,row.revision),
      db.prepare('INSERT INTO pto_events(at,user_id,action) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM pto_state WHERE id=1 AND write_id=?)').bind(date,owner.id,'Owner password reset by site operator; previous sessions revoked',writeId),
    ]);
    if(results[0].meta.changes)return;
  }
  throw Error('Owner recovery conflicted with another update.');
}
