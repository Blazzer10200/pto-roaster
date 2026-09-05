import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {seal} from './security-crypto.mjs';
export async function loadLocalKey(directory){
  await mkdir(directory,{recursive:true});const file=path.join(directory,'security.key');
  try{const key=await readFile(file);if(key.length!==32)throw Error('Invalid local security key.');return key;}catch(error){if(error.code!=='ENOENT')throw error;
    // Never silently replace a missing key once protected backup files exist.
    try{await stat(path.join(directory,'backups'));throw Error('Local security.key is missing. Recover the original key before starting.');}catch(check){if(check.code!=='ENOENT')throw check;}
    const key=randomBytes(32);await writeFile(file,key,{flag:'wx',mode:0o600});return key;
  }
}
export async function dailyBackup(api,key,directory){
  await mkdir(directory,{recursive:true});const file=path.join(directory,new Date().toISOString().slice(0,10)+'.ptobak');
  const envelope={format:'pto-local-backup',...seal(Buffer.from(JSON.stringify(api.snapshot())),key)};
  try{await writeFile(file,JSON.stringify(envelope),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  return {savedAt:(await stat(file)).mtime.toISOString()};
}
