'use strict';
const assert=require('node:assert/strict');
const benefit=require('../public/benefit-grounding.js');
const {validateAiExtraction}=require('../lib/room-ai.js');

global.window={};
require('../public/pain-copy.js');
require('../public/room-copy-quality.js');
const ruleApi=global.window.UrenaviPainCopy;

let failures=0;
function run(name,fn){
  try{fn();console.log('PASS',name);}
  catch(e){failures++;console.error('FAIL',name,e.stack||e.message);}
}

const blocked=[
  {name:'waterproof-to-reassurance',evidence:'防水',text:'防水なので雨の日でも安心です。'},
  {name:'smartphone-to-effort',evidence:'スマホ対応',text:'停車時の手間が減ります。'},
  {name:'storage-to-tidy',evidence:'収納付き',text:'収納付きなので部屋が片付きます。'},
  {name:'breathable-to-comfort',evidence:'通気性',text:'通気性があり快適に使えます。'}
];
for(const tc of blocked){
  run('blocks '+tc.name,()=>{
    const r=benefit.validateBenefitCandidate({text:tc.text,evidence:tc.evidence,sources:[tc.evidence]});
    assert.equal(r.valid,false);
    assert.ok(r.reasons.some(x=>x.startsWith('semantic_expansion:')||x.startsWith('unsupported_phrase:')));
  });
}

for(const ev of ['防水','スマホ対応','収納付き','通気性']){
  run('allows evidence-only selection '+ev,()=>{
    const r=benefit.makeGroundedSelectionLine({label:ev,evidence:ev,sources:['商品 '+ev+' 仕様']});
    assert.equal(r.valid,true,JSON.stringify(r));
    assert.match(r.text,new RegExp(ev));
  });
}

const categories=[
  ['storage','収納ボックス','折りたたみ'],
  ['cleaning','電動モップ','コードレス'],
  ['pet','犬用ベッド','洗える'],
  ['beauty','美顔ローラー','充電式'],
  ['kitchen','フライパン','IH対応'],
  ['appliance','電気ケトル','1.0L'],
  ['fashion','Tシャツ','綿100%'],
  ['motorcycle','バイクグローブ','スマホ対応'],
  ['food','レトルトカレー','200g'],
  ['daily-goods','ティッシュペーパー','200組'],
  ['furniture','ダイニングチェア','木製'],
  ['outdoor','キャンプチェア','折りたたみ'],
  ['pc','USB-Cハブ','HDMI対応'],
  ['car','車用スマホホルダー','マグネット式'],
  ['baby','ベビーカー','折りたたみ'],
  ['laundry','洗濯ネット','ファスナー付き'],
  ['charging','モバイルバッテリー','10000mAh']
];
for(const [domain,type,feature] of categories){
  run('cross-category grounded '+domain,()=>{
    const itemName=type+' '+feature;
    const v=validateAiExtraction({
      productType:{value:type,source:'itemName',evidence:type},
      features:[{text:feature,source:'itemName',evidence:feature}],
      confidence:'high'
    },{itemName,itemCaption:''},{imageAvailable:false});
    assert.equal(v.productType.valid,true,JSON.stringify(v.productType));
    assert.equal(v.features[0].valid,true,JSON.stringify(v.features[0]));
    const b=benefit.makeGroundedSelectionLine({label:feature,evidence:feature,sources:[itemName]});
    assert.equal(b.valid,true,JSON.stringify(b));
  });
}

const accidents=[
  {id:'bike-glove',keyword:'バイクグローブ',itemName:'バイク グローブ 本革 スマホ対応',check:a=>(a.conflicts||[]).some(x=>x.usage==='motorcycle_glove')&&!(a.category==='cleaning'&&a.outputMode==='full')},
  {id:'baseball-glove',keyword:'野球グローブ',itemName:'野球 グローブ 軟式 右投げ',check:a=>(a.conflicts||[]).some(x=>x.usage==='baseball_glove')&&!(a.category==='cleaning'&&a.outputMode==='full')},
  {id:'storage-bench',keyword:'収納ベンチ',itemName:'収納ベンチ 2人掛け 収納ボックス',check:a=>a.outputMode==='fallback'},
  {id:'mop-holder',keyword:'モップハンガー',itemName:'モップハンガー コンパクト 6本掛',check:a=>a.category==='storage'&&a.usage==='cleaning_tool_holder'},
  {id:'bos',keyword:'うんち袋',itemName:'うんちが臭わない袋 BOS ネコ用 SS 200枚入',check:a=>a.outputMode==='fallback'},
  {id:'drive-bed',keyword:'ドライブベッド',itemName:'ドライブベッド 犬 車 後部座席 洗える',check:a=>a.category==='pet'&&a.usage==='drive_bed'},
  {id:'electric-mop',keyword:'電動モップ',itemName:'電動モップ コードレス 網戸対応 充電式',check:a=>a.category==='cleaning'&&a.usage==='mop'&&!a.ambiguous}
];
for(const tc of accidents){
  run('accident regression '+tc.id,()=>{
    const a=ruleApi.analyzeRoomProduct({itemName:tc.itemName,itemPrice:1000},tc.keyword);
    assert.equal(Boolean(tc.check(a)),true,JSON.stringify(a));
    const copy=ruleApi.makeRoomCopy({itemName:tc.itemName,itemPrice:1000},tc.keyword,{variant:0});
    assert.doesNotMatch(copy,/停車時の手間|雨の日でも安心|部屋が片付|快適に使え/);
  });
}

if(failures){console.error('Benefit grounding failures:',failures);process.exit(1);}
console.log('Benefit grounding passed:',blocked.length,'blocked counterexamples +',categories.length,'cross-category cases +',accidents.length,'accident regressions');
