import {sampleData} from './test-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialAccess,permissionsFor,visibleData,mergeAuthorizedData,validateAccess} from './access-model.js';
import {freshData} from './model.js';
test('category defaults, page overrides, multiple roles, and Owner precedence',()=>{
  const config=initialAccess();config.roles.push({id:'treasurer',name:'Treasurer',color:'#78b7ff',categories:{treasury:'manage'},pages:{bands:'view',access:'none'}});
  const user={roleIds:['member','treasurer']};
  assert.deepEqual(permissionsFor(user,config),{roster:'view',bands:'view',ledger:'manage',settings:'none',access:'none',requests:'none'});
  assert.equal(permissionsFor({...user,owner:true},config).access,'manage');assert.equal(permissionsFor({...user,owner:true,disabled:true},config).access,'none');
  config.roles[0].pages.roster='none';assert.equal(permissionsFor({roleIds:['admin','member']},config).roster,'view');
});
test('categories must contain every page exactly once and levels fail closed',()=>{
  const config=initialAccess();config.categories[0].pages.push('ledger');assert.throws(()=>validateAccess(config));
  const other=initialAccess();other.roles[0].pages.roster='god';assert.throws(()=>validateAccess(other));
});
test('hidden ledger and unknown fields never reach a roster-only viewer',()=>{
  const data=sampleData();data.unexpectedSecret='hidden';const config=initialAccess();config.roles.find(r=>r.id==='member').pages.bands='none';const permissions=permissionsFor({roleIds:['member']},config);
  const visible=visibleData(data,permissions);assert.equal(visible.purchases.length,0);assert.equal(visible.contacts.length,0);assert.equal(visible.bands.length,0);assert.equal(visible.members.length,4);assert.equal(visible.unexpectedSecret,undefined);
  assert.throws(()=>mergeAuthorizedData(data,{...visible,members:[]},permissions));
});
test('bands managers can append without reading or overwriting hidden history',()=>{
  const current=sampleData(),permissions={bands:'manage'},visible=visibleData(current,permissions);
  const entry={...current.purchases[0],id:'new-entry'};
  const next=mergeAuthorizedData(current,{...visible,purchases:[entry]},permissions);
  assert.equal(next.purchases.length,current.purchases.length+1);assert.deepEqual(next.members,current.members);assert.deepEqual(next.contacts,current.contacts);
  assert.throws(()=>mergeAuthorizedData(current,{...visible,purchases:[current.purchases[0]]},permissions));
});
