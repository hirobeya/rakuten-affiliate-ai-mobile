'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/app.html','utf8');
const start=html.indexOf("document\n  .querySelectorAll(\n    '.cb'");
const end=html.indexOf("\n\n  const tc=",start);assert.ok(start>0&&end>start);
const setup=html.slice(start,end);
test('restored actual card copy handler records preparation only after successful ROOM clipboard write',async()=>{
 for(const mode of ['success','denied','blocked','save-failed','threads']){
  const events=[],button={dataset:{i:'0',p:mode==='threads'?'threads':'room'},disabled:false,textContent:''},item={itemCode:'a:1'};
  const context={document:{querySelectorAll:()=>({forEach:fn=>fn(button)})},ensureAiForItem:async()=>{},a:[item],post:()=> 'exact reviewed text',postReady:()=>mode!=='blocked',navigator:{clipboard:{writeText:async value=>{assert.equal(value,'exact reviewed text');events.push('copy');if(mode==='denied')throw Error('denied');}}},window:{roomOutcomePrepared:passed=>{assert.equal(passed,item);events.push('prepare');if(mode==='save-failed')throw Error('storage failure');}}};
  vm.runInNewContext(setup,context);await button.onclick();
  assert.deepEqual(events,mode==='blocked'?[]:mode==='denied'||mode==='threads'?['copy']:['copy','prepare']);
  if(mode==='blocked')assert.equal(button.disabled,true);if(mode==='denied'||mode==='save-failed')assert.equal(button.textContent,'コピーできませんでした');
 }
});
