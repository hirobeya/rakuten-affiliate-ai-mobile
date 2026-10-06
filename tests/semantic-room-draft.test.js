'use strict';
const assert=require('node:assert/strict');
const {normalizePass1Raw,MODEL_PASS1_SCHEMA,SEMANTIC_WRITER_PROMPT}=require('../lib/super-urenavi-v3-groq');
const {validateUnderstanding}=require('../lib/super-urenavi-v3-understanding');
const {buildVerificationInput,applyVerification,draftSentences,PASS2_SYSTEM_PROMPT}=require('../lib/super-urenavi-v3-verifier');
const {composePurchaseCopy}=require('../lib/grounded-purchase-copy');
const cases=[
 ['バイクグローブ','親指と人差し指にタッチ対応素材','停車中に地図を確認したいときに。','親指と人差し指にタッチ対応素材を使ったバイクグローブ。停車中は手袋を着けたままスマホを操作できます。'],
 ['掃除用グローブ','マイクロファイバーで窓を拭く','窓の汚れを拭き取りたいときに。','手にはめて窓を拭く掃除用グローブ。マイクロファイバーで手の動きに沿って拭けます。'],
 ['野球グローブ','右投げ用','右投げの捕球練習に。','右投げ用の野球グローブ。投げる手に合わせて選べます。'],
 ['収納ベンチ','座面下に収納スペース','座る場所に収納も欲しいなら。','収納ベンチは座面下に収納スペース付き。座る場所と物をしまう場所をまとめられます。'],
 ['モップハンガー','モップの柄を挟んで壁に掛ける','モップを床に置きたくないときに。','柄を挟んで壁に掛けるモップハンガー。使った後の置き場所を壁に作れます。'],
 ['空調服用バッテリー','AB型番のファン専用','AB型番のファンの電源を選ぶなら。','空調服用バッテリーはAB型番のファン専用。対応するファンにつないで使います。'],
 ['ペット毛取りグローブ','手にはめてペットの抜け毛を取る','ペットの毛のお手入れに。','ペット毛取りグローブは手にはめて抜け毛を取るタイプ。手を動かしながらお手入れできます。'],
 ['BOS袋','使用済みおむつを入れる袋','使用済みおむつをまとめたいときに。','BOS袋は使用済みおむつを入れる袋。おむつ処理の袋として使えます。'],
 ['美顔ローラー','顔の上を転がして使用','顔に当てて転がすお手入れに。','顔の上を転がして使う美顔ローラー。ローラー式のお手入れ用品を選びたい方に。'],
 ['モバイルバッテリー','USB-C接続でスマホを充電','外出先でスマホを充電したいときに。','USB-C接続でスマホを充電できるモバイルバッテリー。外出時の充電用に持ち歩けます。'],
 ['フライパン','取っ手を取り外せる','調理後は取っ手を外して片付けたいなら。','取っ手を取り外せるフライパン。収納時は取っ手を外せます。'],
 ['収納ボックス','使わないときは折りたたみ可能','使わない収納用品は小さく片付けたいなら。','収納ボックスは折りたたみ可能。使わないときはたたんで保管できます。'],
 ['ヘアブラシ','持ち手付き','手で握って髪をとかすときに。','持ち手付きのヘアブラシ。持ち手を握って髪をとかせます。'],
 ['ペットベッド','カバーを取り外して洗える','ペットの寝床のカバーを洗いたいときに。','ペットベッドはカバーを取り外して洗える仕様。カバーだけを外してお手入れできます。'],
 ['靴下','10足セット','靴下をまとめて揃えたいなら。','靴下は10足セット。同じセットでまとめて揃えられます。'],
 ['電気ケトル','50-100度を1℃単位で温度設定','飲み物に合わせてお湯の温度を選びたいなら。','電気ケトルは50-100度を1℃単位で温度設定できます。作る飲み物に合わせて設定を変えられます。'],
 ['冷凍おにぎり','冷凍のまま電子レンジで温める','電子レンジで食事を準備したいときに。','冷凍おにぎりは冷凍のまま電子レンジで温めるタイプ。食べる分を温めて用意できます。']
];
function evaluate(item,raw,supported=true){
 const normalized=normalizePass1Raw(structuredClone(raw),item);
 const validation=validateUnderstanding(normalized,item);
 const input=buildVerificationInput(validation);
 const results=input.map(x=>({verificationIndex:x.verificationIndex,supported,keepDirectFact:true,reason:'mocked contract; not live factual approval',checks:(x.sentences||[]).map(sentence=>({sentence,supported,evidenceQuotes:x.attributes.map(a=>a.quote),reason:'mocked'}))}));
 return {normalized,validation,input,copy:composePurchaseCopy({item,analysis:{validation,verifiedAppeals:applyVerification(validation,{results})}})};
}
for(const [type,quote,scene,text] of cases){
 const item={itemName:type,itemCaption:quote};
 // Evidence need not match any model-produced attribute; server binds to source.
 const raw={productType:{specific:type,general:type},attributes:[],appeals:[{text,scene,evidenceQuotes:[quote],strength:3}]};
 const out=evaluate(item,raw);
 assert.equal(out.copy.status,'ready',type+JSON.stringify(out.copy));
 assert.equal(out.copy.text,scene.normalize('NFKC')+'\n\n'+text.normalize('NFKC')+'\n\n※アフィリエイト広告を利用しています');
 assert.equal(out.copy.ledger[0].facts[0].quote,quote.normalize('NFKC'));
 assert.equal(out.input[0].attributes[0].quote,quote.normalize('NFKC'));
 assert.equal(evaluate(item,raw,false).copy.status,'blocked');
 raw.appeals[0].evidenceQuotes.push('原文に存在しない特徴');
 assert.equal(evaluate(item,raw).copy.status,'blocked','mixed genuine/false evidence must reject entire paragraph');
}
const item={itemName:'バイクグローブ',itemCaption:'山羊革 ナックルプロテクター 親指と人差し指にタッチ対応素材'};
const raw={productType:{specific:'バイクグローブ',general:'バイク用装備'},attributes:[{quote:'ナックルプロテクター'},{quote:'山羊革'}],appeals:[{scene:'停車中に地図を確認するなら。',text:'タッチ対応素材のバイクグローブ。停車中にスマホを操作できます。',evidenceQuotes:['親指と人差し指にタッチ対応素材'],strength:3}]};
let out=evaluate(item,raw);assert.equal(out.copy.status,'ready');assert.deepEqual(out.normalized.appeals[0].attributeRefs,[2]);
for(const text of ['走行中にスマホを操作できるバイクグローブ。','停車中にスマホを操作できる最強のバイクグローブ。','停車中に500時間スマホを操作できるバイクグローブ。','停車中にスマホを操作できて疲れにくいバイクグローブ。']){
 const bad=structuredClone(raw);bad.appeals[0].text=text;assert.equal(evaluate(item,bad).copy.status,'blocked',text);
}
const negative={itemName:'グローブ',itemCaption:'非防水'};
assert.equal(evaluate(negative,{productType:{specific:'グローブ',general:'手袋'},attributes:[],appeals:[{text:'防水のグローブ。',scene:'雨の日に。',evidenceQuotes:['防水'],strength:3}]}).copy.status,'blocked');
const normalized=evaluate({itemName:'収納ボックス',itemCaption:'幅３０ｃｍ\n折りたたみ可能'},{productType:{specific:'収納ボックス',general:'収納'},attributes:[],appeals:[{scene:'片付けに。',text:'幅30cmの収納ボックス。',evidenceQuotes:['幅30cm'],strength:3}]});assert.equal(normalized.copy.status,'ready');
for(const [quote,text] of [['幅30cm','幅30mmの収納ボックス。'],['容量10000mAh','容量10000Whのモバイルバッテリー。'],['重量2kg','重量2gの収納ボックス。']]){
 const x=evaluate({itemName:'収納ボックス',itemCaption:quote},{productType:{specific:'収納ボックス',general:'収納用品'},appeals:[{scene:'収納用品を選ぶなら。',text,evidenceQuotes:[quote],strength:2}]});
 assert.equal(x.copy.status,'blocked','a mistaken verifier approval cannot change units');
 assert.deepEqual(x.copy.reasons,['unsupported_measurement']);
}
// Runtime product identity must come from grounded/local identity, not an AI-composed material+product name.
const inventedName=evaluate({itemName:'グローブ',itemCaption:'バイク用手袋 山羊革'},{productType:{specific:'山羊革グローブ',general:'バイク用手袋',quote:'バイク用手袋'},attributes:[],appeals:[{scene:'バイク用の装備を選ぶなら。',text:'山羊革のグローブ。',evidenceQuotes:['山羊革'],strength:3}]});
assert.equal(inventedName.copy.status,'blocked');
const groundedName=evaluate({itemName:'グローブ',itemCaption:'バイク用手袋 山羊革',identityHint:'グローブ'},{productType:{specific:'山羊革グローブ',general:'バイク用手袋',quote:'バイク用手袋'},attributes:[],appeals:[{scene:'バイク用の装備を選ぶなら。',text:'山羊革のグローブ。',evidenceQuotes:['山羊革'],strength:3}]});
assert.equal(groundedName.validation.productType.specific,'グローブ');
assert.equal(groundedName.copy.status,'ready');
assert.equal(MODEL_PASS1_SCHEMA.properties.appeals.maxItems,1);
// Source language is evidence data, not a published claim.
const sourceRisk={itemName:'収納ボックス',itemCaption:'安心の収納ボックス。折りたたみ可能。'};
const safeDraft={productType:{specific:'収納ボックス',general:'収納',quote:'収納ボックス'},attributes:[],appeals:[{scene:'使わないときはたたんで片付けたいなら。',text:'折りたためる収納ボックス。',evidenceQuotes:['安心の収納ボックス。折りたたみ可能。'],strength:3}]};
assert.equal(evaluate(sourceRisk,safeDraft).copy.status,'ready');
safeDraft.appeals[0].text='安心の収納ボックス。';
assert.equal(evaluate(sourceRisk,safeDraft).copy.status,'blocked');
// Whole-paragraph approval cannot bypass missing, rejected or ungrounded sentence checks.
const proof=evaluate(item,raw), expected=proof.input[0].sentences;
const checks=expected.map(sentence=>({sentence,supported:true,evidenceQuotes:[item.itemCaption.slice(item.itemCaption.indexOf('親指'))],reason:'mocked'}));
const sceneExpected=draftSentences({scene:proof.validation.appeals[0].scene});
const bodyExpected=draftSentences({text:proof.validation.appeals[0].text,noHassle:proof.validation.appeals[0].noHassle});
const withoutBody=checks.filter(c=>!bodyExpected.includes(String(c.sentence||'').trim()));
const oneBody=checks.find(c=>bodyExpected.includes(String(c.sentence||'').trim()));
const duplicateBody=oneBody?[...checks,oneBody]:checks;
for(const malformed of [[],withoutBody,duplicateBody,checks.map(c=>({...c,evidenceQuotes:['架空の根拠']}))]){
 const verifiedAppeals=applyVerification(proof.validation,{results:[{verificationIndex:0,supported:true,keepDirectFact:true,reason:'mocked',checks:malformed}]});
 assert.equal(composePurchaseCopy({item,analysis:{validation:proof.validation,verifiedAppeals}}).status,'blocked');
}
// Scene-only verification defects no longer destroy a separately grounded body.
for(const sceneChecks of [
 checks.filter(c=>!sceneExpected.includes(String(c.sentence||'').trim())),
 [...checks,...checks.filter(c=>sceneExpected.includes(String(c.sentence||'').trim()))],
 checks.map(c=>sceneExpected.includes(String(c.sentence||'').trim())?{...c,supported:false,evidenceQuotes:[]}:c)
]){
 const verifiedAppeals=applyVerification(proof.validation,{results:[{verificationIndex:0,supported:false,keepDirectFact:true,reason:'scene unsupported',checks:sceneChecks}]});
 const copy=composePurchaseCopy({item,analysis:{validation:proof.validation,verifiedAppeals}});
 assert.equal(copy.status,'ready');
 assert.equal(verifiedAppeals[0].scene,'');
 assert.match(copy.text,/を選ぶなら。/);
}
const navigation=structuredClone(raw);navigation.appeals[0].scene='休憩時に。';navigation.appeals[0].text='停止中にナビ操作ができるバイクグローブ。';
assert.equal(evaluate(item,navigation).copy.status,'blocked');
const parked=structuredClone(raw);parked.appeals[0].scene='停車してスマホを操作したいときに。';parked.appeals[0].text='タッチ対応素材で手袋をしたままスマホを操作できます。';
assert.equal(evaluate(item,parked).copy.status,'ready','an explicit parked occasion governs the complementary post');
parked.appeals[0].text='走行中にスマホを操作できます。';
assert.equal(evaluate(item,parked).copy.status,'blocked','parked introduction cannot override explicitly unsafe body');
const multilingual=evaluate({itemName:'モバイルバッテリー',itemCaption:'iPhoneとAndroidに対応'},{productType:{specific:'モバイルバッテリー',general:'充電器'},appeals:[{scene:'スマホ用の電源を選ぶときに。',text:'iPhoneとAndroidに対応するモバイルバッテリーです。',evidenceQuotes:['iPhoneとAndroidに対応'],strength:3}]});
assert.equal(multilingual.copy.status,'ready','legitimate multiple platform names cannot invalidate natural Japanese');
assert.equal(MODEL_PASS1_SCHEMA.properties.appeals.items.properties.attributeRefs,undefined);
assert.equal(MODEL_PASS1_SCHEMA.properties.attributes,undefined);
assert.equal(MODEL_PASS1_SCHEMA.properties.appeals.minItems,1);
assert.match(SEMANTIC_WRITER_PROMPT,/一度に/);assert.match(PASS2_SYSTEM_PROMPT,/条件の省略/);
console.log('semantic-room-draft: PASS (17 synthetic categories; mock verifier, not live quality approval)');
