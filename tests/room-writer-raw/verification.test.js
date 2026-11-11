'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../../lib/room-writer-raw/verify'),S=require('../../lib/room-writer-raw/source');
const {item,draft,claim,evidence}=require('./helpers.cjs');
const has=(v,rule)=>v.failures.some(f=>f.rule===rule);
test('correct model-specific paraphrases remain pending independent review, never publication',()=>{const p=S.prepare(item()),d=draft(),v=V.inspect(p,d);assert.equal(v.ok,true,JSON.stringify(v.failures));assert.equal(v.status,'needs_independent_review');assert.equal(v.publication,false);assert.equal(v.copyable,false);});
test('unrelated qualifier in the same quote does not veto a different asserted clause',()=>{
 const i={...item(),itemCaption:'通気孔なし。ベルクロで手首を固定できます。'},d=draft(i);d.post.sentences=[claim('手首はベルクロで固定できます。',i.itemCaption),claim('手首の固定を調整したい場合に。','ベルクロで手首を固定できます。',{kind:'scene'})];
 const v=V.inspect(S.prepare(i),d);assert.equal(has(v,'related_qualifier_lost'),false);assert.equal(v.ok,true,JSON.stringify(v.failures));
});
test('scope, quantity, degree and negation errors reject across synthetic product categories',()=>{
 const categories=['収納ケース','充電器','デスクライト','カメラ','交換フィルター','水筒','椅子','モニター','ケトル','洗濯ネット'];let positives=0,negatives=0;
 for(const [n,name]of categories.entries()){
  const i=item('synthetic:'+n,name),p=S.prepare(i),good=draft(i);if(V.inspect(p,good).ok)positives++;
  const mutations=[
   d=>{d.post.sentences[0]=claim('引き出しの仕切りは約3cm間隔で調整できます。','上位モデル:引き出しの仕切りは約3cm間隔で調整できます。');},
   d=>{d.post.sentences[0]=claim('上位モデルは仕切りを約30cm間隔で調整できます。','上位モデル:引き出しの仕切りは約3cm間隔で調整できます。',{scope:'上位モデル'});},
   d=>{d.post.sentences[0]=claim('上位モデルは仕切りを3cm間隔で調整できます。','上位モデル:引き出しの仕切りは約3cm間隔で調整できます。',{scope:'上位モデル'});}
  ];for(const mutate of mutations){const d=structuredClone(good);mutate(d);if(!V.inspect(p,d).ok)negatives++;}
 }
 assert.equal(positives,10);assert.equal(negatives,30);
});
test('degree strengthening is rejected with synonyms, not only the recorded product string',()=>{
 for(const [source,text] of [['風が入りにくい構造です。','風の侵入を防ぎます。'],['水が漏れにくい構造です。','水漏れを完全に防ぎます。'],['揺れを抑える構造です。','揺れを確実に防ぎます。']]){
  const i={...item(),itemCaption:source},d=draft(i);d.post.sentences=[claim(text,source),claim('構造を選びたい場合に。',source,{kind:'scene'})];assert.equal(has(V.inspect(S.prepare(i),d),'degree_strengthened'),true);
 }
});
test('body parts, accessory exclusions, dated counts and inferred unit are checked',()=>{
 const i={...item(),itemCaption:'親指と人差し指はタッチ対応です。交換フィルターのみ。電源は別売です。レビュー700件以上（2026年9月時点）。'},d=draft(i);
 const cases=[['part_scope_broadened',claim('指先はタッチ対応です。','親指と人差し指はタッチ対応です。')],['related_qualifier_lost',claim('交換フィルターです。','交換フィルターのみ。')],['related_qualifier_lost',claim('電源が付属します。','電源は別売です。')],['as_of_date_lost',claim('レビュー700件以上です。','レビュー700件以上')]];
 for(const [rule,c]of cases){const bad=structuredClone(d);bad.post.sentences=[c,claim('仕様を選びたい場合に。',i.itemCaption,{kind:'scene'})];assert.equal(has(V.inspect(S.prepare(i),bad),rule),true,rule);}
 d.product.unit='1個';assert.equal(has(V.inspect(S.prepare(i),d),'selling_unit_not_established'),true);
});
test('note and tags are checked just like body, including invented quotes',()=>{
 const p=S.prepare(item());
 for(const group of ['sentences','notes','tags'])for(const [text,rule] of [[group==='tags'?'#抗菌':'抗菌です。','risk_term_not_supported'],[group==='tags'?'#信頼の証':'信頼の証です。','unsupported_assertion_or_promotion']]){
  const d=draft();d.post[group].push(claim(text,'本体は木製です。'));assert.equal(has(V.inspect(p,d),rule),true,group+rule);
 }
 const d=draft();d.post.notes.push(claim('木製です。','存在しない原文'));assert.equal(has(V.inspect(p,d),'invented_quote'),true);
});
test('notes/tags retain as-of dates and the rendered full post includes ad and line breaks in 500 limit',()=>{
 const i={...item(),itemCaption:item().itemCaption+'レビュー700件以上（2026年9月時点）。'};
 for(const group of ['notes','tags']){const d=draft(i);d.post[group].push(claim(group==='tags'?'#レビュー700件以上':'レビュー700件以上です。','レビュー700件以上'));assert.equal(has(V.inspect(S.prepare(i),d),'as_of_date_lost'),true);}
 const d=draft();d.post.sentences=Array.from({length:4},()=>claim('木製'.repeat(100),'本体は木製です。'));const v=V.inspect(S.prepare(item()),d);assert.equal(has(v,'display_over_500_characters'),true);assert.ok(v.text.endsWith(V.DISCLOSURE));assert.equal(v.characterCount,[...v.text].length);
});
test('immutable S3 live failure is separately adapted as a regression, not sent again',()=>{
 const original=require('../../docs/measurements/s3-20261111/initial-probe.json'),old=original.posts[0].draft;
 const facts=require('../../lib/room-writer/source-pack').pack(original.sourceItem).facts,map=new Map(facts.map(f=>[f.id,f]));
 const convert=c=>({...c,kind:c.kind==='S'?'scene':'fact',scope:null,basis:c.basis.map(id=>({field:map.get(id).field,quote:map.get(id).text}))});
 const d={product:{name:old.product.type,unit:old.product.unit,basis:[{field:'itemCaption',quote:map.get('f01').text}]},hold:old.hold,post:{sentences:[convert(old.post.hook),...old.post.body.map(convert)],notes:[claim(old.post.note,'レビュー700件以上(2026年9月時点)、累計販売5,000セット突破の人気商品。')],tags:old.tags.map(t=>claim('#'+t,t))}};
 const v=V.inspect(S.prepare(original.sourceItem),d);
 for(const rule of ['model_scope_not_explicit','degree_strengthened','part_scope_broadened','as_of_date_lost','unsupported_assertion_or_promotion','selling_unit_not_established'])assert.equal(has(v,rule),true,rule+JSON.stringify(v.failures));
 assert.equal(v.publication,false);assert.equal(v.copyable,false);
});
test('semantic ambiguity is explicitly unresolved; missing human coverage cannot approve',async()=>{
 const p=S.prepare(item()),d=draft(),packet=V.reviewPacket(p,d);
 const noReviewer=await V.review(p,d,null);assert.equal(noReviewer.semanticApproved,false);
 const machine=await V.review(p,d,{kind:'ai',id:'generator',evaluate:()=>{throw Error('must not run');}});assert.equal(machine.semanticApproved,false);
 const receipt={sourceHash:packet.sourceHash,draftHash:packet.draftHash,displayHash:packet.displayHash,coverage:packet.coverage,axes:Object.fromEntries(packet.axes.map(k=>[k,true])),relationships:Object.fromEntries(packet.relationships.map(k=>[k,true])),reason:'Synthetic reviewer stub only; no live human quality assertion.',reviewerId:'test-human'};
 const r=await V.review(p,d,{kind:'human',id:'test-human',evaluate:async()=>receipt});assert.equal(r.semanticApproved,true);assert.equal(r.publication,false);
 for(const change of [{displayHash:'wrong'},{coverage:packet.coverage.slice(1)},{axes:{...receipt.axes,grounded:false}},{relationships:{...receipt.relationships,model_scope:false}}]){const r=await V.review(p,d,{kind:'human',id:'test-human',evaluate:async()=>({...receipt,...change})});assert.equal(r.semanticApproved,false);}
});
test('different model grammars and actual attribute families preserve scope and degree',()=>{
 const cases=[
  ['USB充電器','標準モデル:最大20Wの出力です。上位モデル:最大65Wの出力です。','上位モデル:最大65Wの出力です。','上位モデルは最大65W出力です。','標準モデルは最大65W出力です。','上位モデル'],
  ['デスクライト','白色タイプ:光量は約300lmです。暖色タイプ:光量は約200lmです。','暖色タイプ:光量は約200lmです。','暖色タイプは光量が約200lmです。','全タイプで光量は200lmです。','暖色タイプ'],
  ['収納ケース','Sサイズ:高さは約10cmです。Lサイズ:高さは約20cmです。','Lサイズ:高さは約20cmです。','Lサイズの高さは約20cmです。','高さは20cmです。','Lサイズ'],
  ['ポンプ','A型:屋外は非対応です。B型:屋外のみ対応します。','A型:屋外は非対応です。','A型は屋外非対応です。','A型は屋外対応です。','A型']
 ];
 for(const [name,caption,quote,good,bad,scope]of cases){const i={...item(),itemName:name,itemCaption:caption},d=draft(i);d.post.sentences=[claim(good,quote,{scope}),claim('仕様を確認したい場合に。',quote,{kind:'scene',scope})];
  // A scene also needs the explicit scope in visible text.
  d.post.sentences[1].text=scope+'の仕様を確認したい場合に。';
  assert.equal(V.inspect(S.prepare(i),d).ok,true,name+JSON.stringify(V.inspect(S.prepare(i),d).failures));d.post.sentences[0].text=bad;assert.equal(V.inspect(S.prepare(i),d).ok,false,name);
 }
});
