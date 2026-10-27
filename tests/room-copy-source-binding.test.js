'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const html=fs.readFileSync('public/app.html','utf8');
 const item={itemCode:'source:a',itemName:'収納ボックス',itemCaption:'小物を収納できます。'};
 const data={version:'room_contract_test'};
 const ctx={lastSearchItems:[item],aiGatesFullOutput:true,aiRoomResults:new Map([[0,{state:'done',data}]]),isV3PreviewResult:()=>false,RoomCopyResult:{canonical:()=>true,ready:()=> '収納ボックスの確認済み本文'},aiPhase1Post:()=> '収納ボックスの確認済み本文',window:{},usePurchasePlan:true};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function resolveAiGate('),html.indexOf('function roomCopyNeedsReview(')),ctx);
 return {ctx,item};
}
test('a verified AI result belongs to the active product, never another product at the same rank',()=>{
 const {ctx,item}=setup();
 assert.equal(ctx.resolvedPost(item,0),'収納ボックスの確認済み本文');
 for(const other of [{itemCode:'source:b',itemName:'洗濯ネット',itemCaption:'衣類を洗濯できます。'},{...item,itemCaption:'収納ボックスには食品を収納できません。'},{...item}]){
  assert.equal(ctx.resolvedPost(other,0),'');
  assert.equal(ctx.resolveAiGate(other,0).full,false);
 }
 assert.equal(ctx.resolvedPost(item,-1),'');
});
test('batch export cannot label another search with the current screen AI result',()=>{
 const {ctx,item}=setup();
 const html=fs.readFileSync('public/app.html','utf8');
 Object.assign(ctx,{debugExportAllowed:true,UrenaviPainCopy:{analyzeRoomProduct:()=>({})},firstImageUrl:()=>''});
 vm.runInContext(html.slice(html.indexOf('function debugFallbackReason('),html.indexOf('\nfunction buildDebugValidationRows()')),ctx);
 assert.equal(ctx.buildDebugValidationRowsFor([item],'収納')[0].generatedCopy,'収納ボックスの確認済み本文');
 const row=ctx.buildDebugValidationRowsFor([{itemCode:'source:b',itemName:'洗濯ネット'}],'洗濯')[0];
 assert.equal(row.generatedCopy,'');assert.equal(row.aiGate.full,false);assert.equal(row.aiState,'not_run');
});
