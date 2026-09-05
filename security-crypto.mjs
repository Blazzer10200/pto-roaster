import {randomBytes,createHmac,createCipheriv,createDecipheriv,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {Buffer} from 'node:buffer';
const scrypt=promisify(scryptCallback),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,result='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)result+=alphabet[(value<<(5-bits))&31];return result;}
function decode32(secret){let bits=0,value=0;const bytes=[];for(const char of secret){const digit=alphabet.indexOf(char);if(digit<0)throw Error('Invalid authenticator key.');value=(value<<5)|digit;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(bytes);}
export const newTotpSecret=()=>base32(randomBytes(20));
export function totp(secret,time=Date.now(),digits=6){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const mac=createHmac('sha1',decode32(secret)).update(counter).digest(),offset=mac[mac.length-1]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');}
export function matchingStep(secret,code,last=-1,time=Date.now()){
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
  const current=Math.floor(time/30000);
  for(const step of [current,current-1,current+1])if(step>last&&step>=0&&timingSafeEqual(Buffer.from(totp(secret,step*30000)),Buffer.from(code)))return step;
  return null;
}
export function seal(plaintext,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('PTO-v1'));const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};}
export function unseal(envelope,key){if(envelope?.v!==1)throw Error('Unsupported encrypted file.');const iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');if(iv.length!==12||tag.length!==16)throw Error('Invalid encrypted file.');const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from('PTO-v1'));decipher.setAuthTag(tag);return Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);}
export async function encryptBackup(document,passphrase){if(typeof passphrase!=='string'||passphrase.length<15||passphrase.length>128)throw Error('Use a backup passphrase of 15–128 characters.');const salt=randomBytes(16),key=await scrypt(passphrase,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});return {format:'pto-encrypted-backup',version:1,kdf:'scrypt-32768-8-3',salt:salt.toString('base64'),...seal(Buffer.from(JSON.stringify(document)),key)};}
export async function decryptBackup(envelope,passphrase){if(envelope?.format!=='pto-encrypted-backup'||envelope.version!==1||envelope.kdf!=='scrypt-32768-8-3'||typeof passphrase!=='string'||passphrase.length>128)throw Error('Invalid backup.');const salt=Buffer.from(envelope.salt,'base64');if(salt.length!==16)throw Error('Invalid backup.');try{const key=await scrypt(passphrase,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});return JSON.parse(unseal(envelope,key).toString());}catch{throw Error('Incorrect backup passphrase or damaged file.');}}
