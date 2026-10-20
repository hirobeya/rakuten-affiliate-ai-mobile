'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {localZeroCall}=require('../api/room-ai-v3'),safety=require('../public/fact-safety');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
const ui=vm.createContext({window:{UrenaviFactSafety:safety},localCopyAssessment:()=>({ready:false})});
vm.runInContext(html.slice(html.indexOf('function roomCopyNeedsReview('),html.indexOf('function isFullyReviewedCopyState(')),ui);
test('source-quoted protection wording reaches the unchanged final browser safety gate',()=>{
 for(const feature of ['型崩れ防止','形崩れ防止','絡まり防止','色移り防止','毛玉防止','シワ防止']){
  const item={itemName:'洗濯ネット '+feature,itemCaption:'',itemPrice:1000};
  const result=localZeroCall(item);
  assert.equal(result?.quality?.status,'ready',feature);
  const text=result.quality.text;
  assert.ok(text.includes('「'+feature+'」表記の洗濯ネットです。'));
  assert.deepEqual(safety.unsupportedBenefitTerms(text,item),[],feature);
  assert.equal(safety.guardUnsupportedBenefitCopy(item,text),text,feature);
  assert.equal(ui.roomCopyNeedsReview(text,item,true,result),false,feature);
 }
});
test('unsupported outcomes and negated protection still fail their original guards',()=>{
 const item={itemName:'洗濯ネット 型崩れ防止',itemCaption:''};
 const unsafe='大切な衣類を守るために。\n絶対に型崩れしない洗濯ネットです。';
 assert.equal(ui.roomCopyNeedsReview(unsafe,item,true),true);
 for(const suffix of ['ではありません','不可','非対応']){
  const result=localZeroCall({itemName:'洗濯ネット 型崩れ防止 '+suffix,itemCaption:''});
  assert.equal(result,null,suffix);
 }
 assert.equal(localZeroCall({itemName:'洗濯ネット 洗える',itemCaption:''}),null);
});
