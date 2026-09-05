import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {decryptBackup,unseal} from './security-crypto.mjs';
import {restoreSnapshot} from './backup-restore.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node restore-backup.mjs backup.ptobak NEW_DIRECTORY');
const directory=path.resolve(output);
try{await stat(directory);throw Error('Choose a new directory. Existing directories are never overwritten.');}catch(error){if(error.code!=='ENOENT')throw error;}
const envelope=JSON.parse(await readFile(path.resolve(input),'utf8'));
let document;
if(envelope.format==='pto-local-backup'){
  if(!process.env.PTO_BACKUP_KEY_FILE)throw Error('Set PTO_BACKUP_KEY_FILE to the original local security.key path.');
  document=JSON.parse(unseal(envelope,await readFile(process.env.PTO_BACKUP_KEY_FILE)).toString());
}else document=await decryptBackup(envelope,process.env.PTO_BACKUP_PASSWORD);
// Validate in memory before creating files.
const checked=restoreSnapshot(document);checked.close();
await mkdir(directory);await writeFile(path.join(directory,'security.key'),Buffer.from(document.key,'base64'),{flag:'wx',mode:0o600});
const restored=restoreSnapshot(document,{file:path.join(directory,'pto-dev.sqlite')});restored.close();
console.log('Backup restored into a new directory. Sessions were not restored. Keep this directory private.');
