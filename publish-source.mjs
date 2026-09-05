// Reads a short-lived Sites credential from non-echoing stdin. Nothing is saved.
import { spawnSync } from 'node:child_process';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
console.log('Ready for temporary source authorization.');
let buffer='';
process.stdin.on('data',chunk=>{
  buffer+=chunk;
  if(!buffer.includes('\n'))return;
  process.stdin.pause();
  if(process.stdin.isTTY)process.stdin.setRawMode(false);
  try {
    const credential=JSON.parse(buffer.trim());buffer='';
    if(credential.auth_mode!=='http_extra_header'||!credential.remote_url.startsWith('https://git.chatgpt-team.site/'))throw Error('Unexpected source destination.');
    const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.extraHeader',GIT_CONFIG_VALUE_0:'Authorization: Bearer '+credential.token,GIT_TERMINAL_PROMPT:'0'};
    const result=spawnSync('git',['push',credential.remote_url,'HEAD:refs/heads/'+credential.branch],{env,encoding:'utf8',windowsHide:true});
    if(result.status!==0){console.error((result.stderr||'Push failed.').replaceAll(credential.token,'[redacted]'));process.exitCode=1;}
    else console.log('Source published successfully.');
  } catch(error){console.error(error.message);process.exitCode=1;}
  process.stdin.destroy();
});
