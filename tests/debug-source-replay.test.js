'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {corpusGenres}=require('../lib/evaluation-corpus');

test('actual debug export preserves long generation sources and excludes unrelated private state',()=>{
  const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
  const start=html.indexOf('function debugFallbackReason(');
  const end=html.indexOf('\nfunction buildDebugValidationRows()',start);
  assert.ok(start>=0&&end>start);
  const ctx={debugExportAllowed:true,UrenaviPainCopy:{analyzeRoomProduct:()=>({})},resolvedPost:()=>'',resolveAiGate:()=>({}),mediaTemplateFor:()=>'',window:{},firstImageUrl:()=>'',aiGatesFullOutput:true};
  vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
  const item={itemCode:'synthetic:1',itemName:'収納ボックス',itemCaption:'説明。'.repeat(150)+'カバーのみ洗えます。',catchcopy:'折りたたみ可能',itemPrice:3000,access_token:'must-not-export',customerEmail:'must-not-export'};
  const rows=JSON.parse(JSON.stringify(ctx.buildDebugValidationRowsFor([item],'収納')));
  assert.deepEqual(rows[0].item,{itemCode:item.itemCode,itemName:item.itemName,itemCaption:item.itemCaption,catchcopy:item.catchcopy,itemPrice:item.itemPrice});
  assert.equal(rows[0].itemCaptionPreview.length,300);
  assert.ok(!JSON.stringify(rows).includes('must-not-export'));
  const groups=corpusGenres({batch:true,searches:[{searchKeyword:'収納',error:null,items:rows}]});
  assert.equal(groups[0].name,'収納');
  assert.deepEqual(groups[0].items[0],rows[0].item);
  assert.ok(groups[0].items[0].itemCaption.endsWith('カバーのみ洗えます。'));
  ctx.debugExportAllowed=false;
  assert.equal(ctx.buildDebugValidationRowsFor([item],'収納').length,0);
});
test('replay refuses incomplete or failed batch exports rather than pretending they contain full evidence',()=>{
  for(const search of [{error:'rate limit',items:[]},{items:[{itemName:'収納ボックス',itemCaptionPreview:'短い説明'}]},{items:null}]){
    assert.throws(()=>corpusGenres({batch:true,searches:[search]}),/failed search|Invalid evaluation|missing full product source/);
  }
});
