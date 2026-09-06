// Test-only records. This module is excluded from browser and Worker release assets.
import {defaultRanks} from './model.js';
export function sampleData() {
  const bands = [ ['Loose change', '#c2c9b5', 1], ['White band', '#e4e5e0', 100], ['Blue band', '#82aef5', 500], ['Purple band', '#ba98e4', 1000], ['Brown band', '#b28b6f', 5000] ].map(([name,color,price],i) => ({id:'band-'+i,name,color,price:price*100,active:true}));
  const data = { version:1, name:'PTO Roaster', bands, contacts:[], purchases:[],members:[],ranks:[...defaultRanks],rosterLimit:0,gangNotes:'' };
  data.contacts = [{id:'c1',name:'Marcus Reed',notes:'Usually around in the evenings.'},{id:'c2',name:'Nico Vega',notes:''},{id:'c3',name:'Alex Carter',notes:'Prefers one payment per pickup.'},{id:'c4',name:'Jordan Blake',notes:''}];
  data.members=data.contacts.map((c,i)=>({id:'member-demo-'+i,name:c.name,callsign:['PTO-01','PTO-02','PTO-03','PTO-04'][i],rank:['Leader','Enforcer','Member','Prospect'][i],status:i===2?'inactive':'active',joined:new Date().toISOString().slice(0,10),notes:i===2?'Away this week.':'Sample roster member.'}));
  data.rosterLimit=20;
  data.gangNotes='Keep your rank and availability up to date. Add meeting reminders and shared notes here.';
  const specs = [['c1',2,24,6000,0],['c2',3,18,18000,0],['c3',4,8,25000,1],['c4',1,65,6500,2],['c1',3,12,12000,3],['c2',2,40,10000,5]];
  data.purchases = specs.map(([contactId,b,q,p,days],i) => {const date=new Date();date.setDate(date.getDate()-days);date.setHours(14-i,20,0,0);return {id:'demo-'+i,contactId,date:date.toISOString(),notes:'Sample purchase — for preview only.',lines:[{...bands[b],quantity:q}],payments:[{id:'dp-'+i,amount:p*100,date:date.toISOString()}]};});
  return data;
}
