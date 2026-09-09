import {sampleData} from './test-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {freshData,validateBackup,rosterCounts} from './model.js';
import {rosterPage,rosterRows,memberForm} from './roster.js';

test('legacy backups gain an empty roster without converting band contacts into members',()=>{
  const old=sampleData();delete old.members;delete old.ranks;delete old.rosterLimit;delete old.gangNotes;
  const next=validateBackup(old);
  assert.equal(next.members.length,0);assert.deepEqual(next.contacts,old.contacts);assert.deepEqual(next.purchases,old.purchases);
  assert.equal(next.ranks.length,5);assert.equal(next.rosterLimit,0);
});
test('archiving keeps member details and frees a roster slot; restoring counts them again',()=>{
  const data=sampleData();const member=data.members[0];
  member.status='archived';const counts=rosterCounts(data.members,4);
  assert.deepEqual(counts,{total:3,active:2,inactive:1,archived:1,open:1});
  const restored=validateBackup(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.members[0].name,member.name);assert.equal(restored.members[0].notes,member.notes);
  restored.members[0].status='active';assert.equal(rosterCounts(restored.members,4).total,4);
});
test('roster validation rejects bad statuses, duplicate IDs, limits, and rank lists',()=>{
  for(const modify of [d=>d.members[0].status='online',d=>d.members[0].id=d.contacts[0].id,d=>d.rosterLimit=-1,d=>d.ranks=[],d=>d.ranks=['Leader','Leader'],d=>d.members[0].name=' ']){
    const data=sampleData();modify(data);assert.throws(()=>validateBackup(data));
  }
});
test('roster filters search State IDs and render user text without interpreting HTML',()=>{
  const data=sampleData();data.members[0].stateId='01234';data.members[0].name='<img src=x onerror=alert(1)>';
  const rows=rosterRows(data,'01234');assert.match(rows,/&lt;img/);assert.doesNotMatch(rows,/<img src=x/);assert.doesNotMatch(rows,/Nico Vega/);
  data.members[0].status='archived';assert.doesNotMatch(rosterRows(data,'01234'),/data-edit-member/);
  assert.match(rosterRows(data,'01234','archived'),/data-edit-member/);
  assert.match(rosterPage(data),/<h1>Roster<\/h1>/);assert.doesNotMatch(memberForm(data,data.members[0]),/<img src=x/);
});
