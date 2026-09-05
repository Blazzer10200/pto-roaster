import {validateBackup} from './model.js';
import {validateAccess} from './access-model.js';
import {createDevApi} from './dev-api.mjs';
import {unseal} from './security-crypto.mjs';
// Restore only into a fresh database; never overwrite the running workspace.
export function restoreSnapshot(document,{file=':memory:'}={}){
  if(document?.format!=='pto-full-backup'||document.version!==1)throw Error('Unsupported backup.');
  const {tables}=document,key=Buffer.from(document.key||'','base64');if(key.length!==32)throw Error('Invalid backup key.');
  const names=['users','config','workspace','audit','account_security','recovery_codes','security_policy'];
  if(!tables||names.some(name=>!Array.isArray(tables[name])))throw Error('Incomplete backup.');
  if(tables.users.filter(u=>u.owner===1).length!==1)throw Error('Backup must contain one Owner.');
  if(tables.config.length!==1||tables.workspace.length!==1||tables.security_policy.length!==1)throw Error('Invalid backup state.');
  const config=validateAccess(JSON.parse(tables.config[0].document));validateBackup(JSON.parse(tables.workspace[0].document));
  for(const user of tables.users){if(!/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(user.password)||!['approved','pending','denied'].includes(user.approval)||!Array.isArray(JSON.parse(user.roles))||JSON.parse(user.roles).some(id=>!config.roles.some(role=>role.id===id)))throw Error('Invalid account in backup.');}
  for(const record of tables.account_security)if(record.secret)unseal(JSON.parse(record.secret),key);
  const api=createDevApi({file,key});
  try{
    if(api.db.prepare('SELECT count(*) AS count FROM users').get().count)throw Error('Restore requires a new empty database.');
    api.db.exec('BEGIN IMMEDIATE');
    for(const name of names){
      // Only fresh default rows are replaced. Input cannot supply SQL identifiers.
      const columns=api.db.prepare('PRAGMA table_info('+name+')').all().map(c=>c.name);
      for(const record of tables[name]){
        if(Object.keys(record).some(field=>!columns.includes(field)))throw Error('Unsupported backup fields.');
        const fields=columns.filter(c=>Object.hasOwn(record,c));
        api.db.prepare('INSERT OR REPLACE INTO '+name+'('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')').run(...fields.map(c=>record[c]));
      }
    }
    api.db.exec('COMMIT');return api;
  }catch(error){if(api.db.isTransaction)api.db.exec('ROLLBACK');api.close();throw error;}
}
