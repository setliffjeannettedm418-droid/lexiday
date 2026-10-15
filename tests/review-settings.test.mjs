import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost/'});
for(const name of ['window','document','HTMLElement','HTMLInputElement','Element','Node','Event'])globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const {default:ReviewSettings}=await import('../src/screens/ReviewSettings.tsx');
const click=async button=>act(async()=>button.click());
const type=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
async function mount(beforeSave){
 let state={words:[{id:'a'}],records:{a:{mastery:3}},attempts:[{id:'kept'}],days:[],settings:{appearance:'paper',theme:'dark'}};
 let saves=0;const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
 const render=()=>root.render(createElement(ReviewSettings,{state,save:async fn=>{saves++;await beforeSave?.();state=fn(state);render();}}));
 await act(async()=>render());
 return{element,get state(){return state},get saves(){return saves},replace(next){state=next},button(label){return [...element.querySelectorAll('button')].find(b=>b.textContent===label)},async close(){await act(async()=>root.unmount());element.remove()}};
}
test('review settings validates calendar offsets, accepts Chinese separators and preserves learning state',async()=>{
 const ui=await mount();const initial=structuredClone(ui.state);
 try{
  for(const invalid of ['', '0,2', '1,1', '7,2', '1.5,4', '1,366']){
   await type(ui.element.querySelector('input'),invalid);await click(ui.button('保存复习节点'));
   assert.equal(ui.saves,0);assert.match(ui.element.querySelector('[role=status]').textContent,/递增且不重复/);
  }
  await type(ui.element.querySelector('input'),'1，3、10');await click(ui.button('保存复习节点'));
  assert.deepEqual(ui.state,{...initial,settings:{...initial.settings,reviewDays:[1,3,10]}});
  await click(ui.button('恢复默认'));assert.deepEqual(ui.state.settings.reviewDays,[1,2,4,7,15,30]);
 }finally{await ui.close()}
});
test('review settings failed save can retry and pending saves cannot erase newer learning data',async()=>{
 let failed=true,release;const ui=await mount(async()=>{if(failed)throw Error('storage');await new Promise(resolve=>{release=resolve})});
 try{
  await type(ui.element.querySelector('input'),'1,3,8');await click(ui.button('保存复习节点'));
  assert.equal(ui.state.settings.reviewDays,undefined);assert.match(ui.element.querySelector('[role=status]').textContent,/保存失败/);
  failed=false;await click(ui.button('保存复习节点'));assert(ui.element.querySelector('input').disabled);
  await click(ui.button('恢复默认'));assert.equal(ui.saves,2);
  ui.replace({...ui.state,attempts:[...ui.state.attempts,{id:'new-answer'}]});
  await act(async()=>release());assert.deepEqual(ui.state.settings.reviewDays,[1,3,8]);assert.equal(ui.state.attempts.length,2);
 }finally{await ui.close()}
});
test.after(()=>dom.window.close());
