'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall}=require('../api/room-ai-v3');
const {guardUnsupportedBenefitCopy}=require('../public/fact-safety');
const {catalogueOnly,sourceIncludes}=require('../public/purchase-copy-quality');
const recorded=require('./fixtures/room-source-evidence-20261022.json');
const html=require('node:fs').readFileSync(require.resolve('../public/app.html'),'utf8');
const ui=require('node:vm').createContext({window:{UrenaviFactSafety:require('../public/fact-safety'),UrenaviPurchaseCopyQuality:require('../public/purchase-copy-quality')},RoomCopyResult:require('../public/room-copy-result')});
require('node:vm').runInContext(html.slice(html.indexOf('function roomCopyNeedsReview('),html.indexOf('function isFullyReviewedCopyState(')),ui);

const expected={
  'daiya:10001447':['publication','grounded_local_copy'],
  'daiya:10001030':['publication','grounded_local_copy'],
  'ipow:10000579':['quality','catalogue_only_copy'],
  'linofle:10000458':['purchase_reason','choice_configuration_without_use_relation'],
  'yukaiya:10001267':['quality','catalogue_only_copy'],
  'living-mahoroba:10015748':['purchase_reason','no_grounded_purchase_candidate'],
  'daiya:10001455':['publication','grounded_local_copy'],
  'ritoashop:10000039':['quality','catalogue_only_copy'],
  'brian:10001257':['quality','catalogue_only_copy'],
  'lebenwood:10004953':['identity','competing_identity']
};

test('recorded original sources expose distinct local failures without changing publication',()=>{
  assert.equal(recorded.items.length,10);
  const ready=[];
  for(const row of recorded.items){
    const item={itemCode:row.item_code,itemName:row.item_name,itemCaption:row.item_caption,catchcopy:row.catchcopy,itemPrice:row.item_price};
    const diagnostics={};
    const result=localZeroCall(item,'',diagnostics);
    assert.deepEqual(result,localZeroCall(item),'diagnostics must not change the route');
    assert.deepEqual([diagnostics.stage,diagnostics.reason],expected[row.item_code],row.item_code);
    assert.ok(diagnostics.identityCandidates);
    if(!result){assert.equal(diagnostics.status,'deferred');continue;}
    ready.push(row.item_code);
    assert.equal(diagnostics.status,'ready');
    assert.equal(result.model,'local');
    assert.equal(result.groq.totalCalls,0);
    assert.equal(result.pass2Status,'not_needed');
    assert.equal(guardUnsupportedBenefitCopy(item,result.quality.text),result.quality.text);
    assert.equal(catalogueOnly(result.quality.text),false);
    const quote=diagnostics.purchaseCandidate.quote;
    assert.equal(sourceIncludes(item.itemCaption,quote),true);
    assert.ok(result.quality.text.includes(quote));
    assert.equal(ui.roomCopyNeedsReview(result.quality.text,item,true,result),false);
    assert.equal(ui.roomCopyNeedsReview(result.quality.text,{...item,itemCaption:''},true,result),true);
    assert.equal(ui.roomCopyNeedsReview(result.quality.text+'\n便利な商品です。',item,true,result),true);
  }
  assert.deepEqual(ready,['daiya:10001447','daiya:10001030','daiya:10001455']);
});

test('purpose-qualified identity and complete causal evidence survive into the same rendered post',()=>{
  const row=recorded.items.find(x=>x.item_code==='daiya:10001455');
  const item={itemName:row.item_name,itemCaption:row.item_caption};
  const diagnostics={},result=localZeroCall(item,'',diagnostics);
  assert.equal(result.productType.specific,'シャツ用洗濯ネット');
  assert.match(result.quality.text,/シャツをクルクル巻いて洗うことで/);
  assert.match(result.quality.text,/アイロンがけの負担が減ります/);
  assert.equal(sourceIncludes(item.itemCaption,diagnostics.purchaseCandidate.quote),true);
  // Removing the source relationship must not preserve the completed benefit.
  assert.equal(localZeroCall({...item,itemCaption:''}),null);
});
