import test from 'node:test';
import assert from 'node:assert/strict';
import {revealContent} from './ui-utils.js';

test('content transitions respect reduced motion and ignore detached content',t=>{
  const previous=globalThis.matchMedia;t.after(()=>{if(previous)globalThis.matchMedia=previous;else delete globalThis.matchMedia;});
  let played=0;const element={isConnected:true,animate(){played++;},getAnimations:()=>[]};
  globalThis.matchMedia=()=>({matches:true});revealContent(element);assert.equal(played,0);
  globalThis.matchMedia=()=>({matches:false});element.isConnected=false;revealContent(element);assert.equal(played,0);
});

test('rapid content transitions replace their own animation without cancelling unrelated motion',t=>{
  const previous=globalThis.matchMedia;t.after(()=>{if(previous)globalThis.matchMedia=previous;else delete globalThis.matchMedia;});
  globalThis.matchMedia=()=>({matches:false});
  let replaced=0,unrelated=0;const animation={};
  revealContent({isConnected:true,getAnimations:()=>[{id:'pto-content-reveal',cancel(){replaced++;}},{id:'other',cancel(){unrelated++;}}],animate:()=>animation});
  assert.equal(replaced,1);assert.equal(unrelated,0);assert.equal(animation.id,'pto-content-reveal');
});
