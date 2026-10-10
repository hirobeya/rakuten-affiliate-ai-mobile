'use strict';

const test=require('node:test');
const {localZeroCall,resolveLiteralIdentity,extractLiteralSpecs}=require('../api/room-ai-v3');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const {repeatedLiteralIdentity}=require('../lib/repeated-literal-identity');
const structured=require('../public/structured-room-copy');

const items=[
 ['bc768','タニタ 体組成計 体重計 スマホ連動 BC-768 パールホワイト メタリックブラック 体脂肪率 内臓脂肪レベル',7980],
 ['s5','TIMEMORE公式 CHESTNUT S5 手挽きコーヒーミル 手動 コーヒーグラインダー 高精度48mm12星刃',25800],
 ['doorstopper','マーナ公式 踏むだけで固定 立ったまま解除できる ドアストッパー 玄関 強力 マグネット ゴム 足 扉 止め ドア止め',5500],
 ['shoe-dryer','靴乾燥機 アイリスオーヤマ シューズドライヤー 小型 オゾン脱臭 除菌 靴 乾燥機 シューズ乾燥機 2足同時乾燥',4780],
 ['compression','sakuraku pshhto BOX 衣類用 衣類圧縮袋 スティック型対応 圧縮袋一体型BOX',5800],
 ['bath-chair','山崎実業 マグネット風呂イス タワー SH25 座面高さ25cm tower 風呂椅子 マグネット',4620],
 ['oralb','ブラウン オーラルB iO2 電動歯ブラシ コスパモデル ホワイト 電動歯みがき',10978],
 ['delonghi','デロンギ マグニフィカ スタート 全自動コーヒーマシン ECAM22020B コーヒーメーカー ミル付き',97800],
 ['omron','オムロン 公式 体重計 体組成計 KRD-203 カラダスキャン ホワイト ダークブルー',3680]
].map(([id,itemName,itemPrice])=>({id,itemCode:'diag6:'+id,itemName,itemCaption:'',itemPrice,imageUrl:''}));

test('classify sixth untouched holdout local misses without tuning',()=>{
 const rows=items.map(item=>{
   const rule=resolveLocalUnderstanding({itemName:item.itemName,itemCaption:''});
   const literal=resolveLiteralIdentity(item);
   const repeated=(!rule&&!literal)?repeatedLiteralIdentity(item):null;
   const identity=rule?.raw?.productType?.value||literal?.canonicalIdentity||literal?.raw?.productType?.value||repeated?.canonicalIdentity||repeated?.raw?.productType?.value||'';
   const copy=structured.compose({...item,itemCaption:''},identity?{identity}:{});
   const specs=extractLiteralSpecs(item);
   const zero=localZeroCall(item);
   return {
     id:item.id,
     zeroCall:Boolean(zero),
     ruleIdentity:rule?.raw?.productType?.value||null,
     literalIdentity:literal?.canonicalIdentity||literal?.raw?.productType?.value||null,
     repeatedIdentity:repeated?.canonicalIdentity||repeated?.raw?.productType?.value||null,
     chosenIdentity:identity||null,
     specs:specs.map(x=>x.quote),
     structuredStatus:copy?.status||null,
     structuredMethod:copy?.understanding?.method||null,
     structuredIdentity:copy?.understanding?.identity||null,
     structuredFacts:Array.isArray(copy?.facts)?copy.facts.map(x=>x.quote||x.text||String(x)):[]
   };
 });
 console.log('HOLDOUT6_LOCAL_MISS_DIAGNOSTICS '+JSON.stringify(rows));
});
