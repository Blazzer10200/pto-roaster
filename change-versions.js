import {createHash} from 'node:crypto';
import {permits} from './access-model.js';
import {profileOf} from './member-profile.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Expose change markers only for pages this account may view; never hash credentials.
export function changeVersions({user,permissions,users,workspaceRevision,accessRevision,auditRevision}){
  if(user.approval!=='approved')return {};
  const identities=users.map(u=>({id:u.id,...profileOf(u),approval:u.approval,disabled:!!u.disabled,roles:u.roles,requestedAt:u.requested_at,reviewedAt:u.reviewed_at})).sort((a,b)=>a.id.localeCompare(b.id));
  return {
    workspace:['roster','bands','ledger','settings'].some(p=>permits(permissions,p))?workspaceRevision:null,
    access:permits(permissions,'access')?accessRevision:null,
    accounts:permits(permissions,'access')?hash(identities):null,
    requests:permits(permissions,'requests')?hash([accessRevision,identities.filter(u=>['pending','denied'].includes(u.approval)),workspaceRevision]):null,
    audit:permits(permissions,'access','manage')?auditRevision:null,
  };
}
