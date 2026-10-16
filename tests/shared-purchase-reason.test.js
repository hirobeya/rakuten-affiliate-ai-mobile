'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const copy=require('../public/structured-room-copy'),safety=require('../public/fact-safety'),{localZeroCall}=require('../api/room-ai-v3');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
function context(){
 const window={};const c=vm.createContext({window,Intl});
 for(const name of ['structured-room-copy','fact-safety','pain-copy','room-copy-quality'])vm.runInContext(fs.readFileSync(require.resolve('../public/'+name+'.js'),'utf8'),c);
 c.UrenaviPainCopy=window.UrenaviPainCopy;c.groundedAnalysis=item=>window.UrenaviPainCopy.analyzeRoomProduct(item);c.usePurchasePlan=true;
 for(const [from,to] of [['function localCopyAssessment(','function neutralRulePost('],['function roomCopyNeedsReview(','function isFullyReviewedCopyState('],['function aiTargetDecision(item){','function activeAiProgress(']]){const a=html.indexOf(from),b=html.indexOf(to,a);assert.ok(a>0&&b>a);vm.runInContext(html.slice(a,b),c);}
 return c;
}
test('bare sleeve, season, material, size, washable and charging labels cannot bypass the real browser gate',()=>{
 const app=context();
 for(const itemName of ['シャツ 長袖','シャツ 半袖','シャツ 春夏','シャツ 秋冬','財布 本革','洗濯ネット 洗える','掃除機 充電式','収納ボックス 50×30×30cm','折りたたみ傘 折りたたみ']){
  const item={itemName},a=copy.assess(item);assert.ok(a.result.text,itemName+' should keep a factual draft');
  assert.equal(a.ready,false,itemName);assert.equal(app.roomCopyNeedsReview(a.result.text,item),true,itemName);assert.equal(app.aiTargetDecision(item).callAi,true,itemName);
 }
 for(const itemName of ['シャツ 長袖','財布 本革','洗濯ネット 洗える','掃除機 充電式'])assert.equal(localZeroCall({itemName}),null,itemName);
});
test('independent supported purchase reasons survive alongside weak supplemental material facts',()=>{
 const item={itemName:'モップハンガー 壁掛け 粘着式 ステンレス'},a=copy.assess(item),local=localZeroCall(item),app=context();
 assert.equal(a.ready,true);assert.match(a.result.text,/粘着式で壁に取り付ける/);assert.match(a.result.text,/ステンレス/);
 assert.doesNotMatch(a.result.text,/素材にステンレスを選びたい/);
 assert.ok(local);assert.equal(local.quality.text,a.result.text);assert.equal(app.roomCopyNeedsReview(a.result.text,item),false);assert.equal(app.aiTargetDecision(item).callAi,false);
});
test('multiple supported reasons without a scene render independently and do not fall through to unnecessary AI',()=>{
 const item={itemName:'HDMIケーブル USB-C対応 個包装'},a=copy.assess(item),app=context();
 assert.equal(a.result.understanding.scene,'');assert.equal(a.ready,true);
 const lines=a.result.text.split('\n');
 assert.ok(lines.includes('USB-C対応の接続先を使う場面に。'));assert.ok(lines.includes('1つずつ包装されています。'));
 assert.equal(app.roomCopyNeedsReview(a.result.text,item),false);assert.equal(app.aiTargetDecision(item).callAi,false);
 assert.equal(safety.guardUnsupportedBenefitCopy(item,a.result.text),a.result.text);
 const negated={itemName:'HDMIケーブル USB-C対応 ではありません 個包装'};
 assert.doesNotMatch(copy.compose(negated).text,/USB-C対応の接続先/);
});
test('every publication reason uses real source facts and the same strength rule across the fixed corpus',()=>{
 let total=0,ready=0;
 for(const file of fs.readdirSync(__dirname+'/fixtures').filter(f=>/^rakuten-large-genres-20260925-.*json$/.test(f)))for(const genre of require('./fixtures/'+file).genres||[])for(const item of genre.items||[]){
  total++;const a=copy.assess(item);if(!a.ready)continue;ready++;
  const lines=new Set(a.result.text.split('\n').map(s=>s.trim()));
  const selected=a.result.values.filter(v=>lines.has(v.text));assert.ok(selected.length,item.itemName);
  assert.ok(selected.every(v=>copy.valueHasStrongReason(v,a.result.facts,a.result.understanding.identity)),item.itemName);
  for(const v of selected)for(const ref of v.factRefs){const f=a.result.facts.find(f=>f.quote===ref);assert.ok(f);assert.ok(String(item[f.source]||'').includes(ref));}
  assert.equal(safety.guardUnsupportedBenefitCopy(item,a.result.text),a.result.text,item.itemName);
 }
 assert.equal(total,780);assert.ok(ready>0);console.log('SHARED_PURCHASE_REASON_CORPUS '+JSON.stringify({total,ready}));
});
