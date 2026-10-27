'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
function setup(){
  const elements=Object.fromEntries(['debugCopyBtn','debugBatchBtn','debugPreparedCopyBtn','debugJson','debugJsonMeta'].map(id=>[id,{value:'stale',textContent:'',disabled:false}]));
  let copies=0,lastCopied='old clipboard';
  const ctx={document:{getElementById:id=>elements[id]},debugExportAllowed:true,lastSearchKeyword:'',lastSearchItems:[],k:{value:''},navigator:{clipboard:{writeText:async text=>{copies++;lastCopied=text;}}},setTimeout:fn=>fn(),console:{error(){},warn(){}},Date,
    sb:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}},authDeadline:x=>x,sessionTooOld:()=>false,$:()=>({value:'standard'}),DEBUG_BATCH_KEYWORDS:['first','second'],debugSearchOne:async keyword=>[{itemName:keyword}],buildDebugValidationRowsFor:items=>items.map(item=>({item})),activeAiProgress:()=>({pending:0}),buildDebugValidationRows:()=>[]};
  vm.createContext(ctx);
  for(const [startText,endText] of [['async function copyBatchDebugValidation(){','\nasync function copyDebugValidation(){'],['async function copyDebugValidation(){',"\ndocument.getElementById('debugCopyBtn')"],['async function copyPreparedDebugValidation(){',"\ndocument.getElementById('debugPreparedCopyBtn')"]]){
    const start=html.indexOf(startText),end=html.indexOf(endText,start);
    assert.ok(start>=0&&end>start);vm.runInContext(html.slice(start,end),ctx);
  }
  return {ctx,elements,copies:()=>copies,lastCopied:()=>lastCopied};
}
test('an empty normal search never overwrites the clipboard with an empty successful export',async()=>{
  const x=setup();await x.ctx.copyDebugValidation();
  assert.equal(x.copies(),0);assert.equal(x.lastCopied(),'old clipboard');assert.equal(x.elements.debugJson.value,'');
  assert.equal(x.elements.debugPreparedCopyBtn.disabled,true);assert.match(x.elements.debugJsonMeta.textContent,/空のデータはコピーしていません/);
});
test('batch creates fresh results without an asynchronous clipboard attempt, then explicit copy writes those results',async()=>{
  const x=setup();await x.ctx.copyBatchDebugValidation();
  const payload=JSON.parse(x.elements.debugJson.value);
  assert.equal(payload.batch,true);assert.equal(payload.searches.length,2);assert.equal(x.copies(),0);
  assert.equal(x.elements.debugPreparedCopyBtn.disabled,false);assert.match(x.elements.debugJsonMeta.textContent,/まだコピーはされていません/);
  await x.ctx.copyPreparedDebugValidation();
  assert.equal(x.copies(),1);assert.equal(x.lastCopied(),x.elements.debugJson.value);assert.equal(x.elements.debugPreparedCopyBtn.textContent,'コピーしました');
});
test('clipboard denial preserves visible new results, reports failure, and never reports old contents as copied',async()=>{
  const x=setup();await x.ctx.copyBatchDebugValidation();const json=x.elements.debugJson.value;
  x.ctx.navigator.clipboard.writeText=async()=>{throw Error('NotAllowedError');};
  await x.ctx.copyPreparedDebugValidation();
  assert.equal(x.elements.debugJson.value,json);assert.equal(x.elements.debugPreparedCopyBtn.textContent,'コピーできませんでした');
  assert.match(x.elements.debugJsonMeta.textContent,/以前コピーした内容は今回の結果ではありません/);
  x.ctx.debugExportAllowed=false;await x.ctx.copyPreparedDebugValidation();assert.equal(x.copies(),0);
});
