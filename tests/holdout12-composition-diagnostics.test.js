'use strict';
const test=require('node:test');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const {repeatedLiteralIdentity}=require('../lib/repeated-literal-identity');
const {evidenceBackedLeadingIdentity,scoreCandidate,tokens,operatorSupports}=require('../lib/local-semantic-composer');
const {resolveLiteralIdentity,localZeroCall}=require('../api/room-ai-v3');
const {safeTitleFacts}=require('../lib/local-generic-reasoner');

const items=[
  {id:'h12-03',itemName:'センサー式ゴミ箱 自動開閉 充電式 15L ダストボックス ふた付き キッチン リビング',itemCaption:'',itemPrice:0},
  {id:'h12-04',itemName:'マグネットスパイスラック 冷蔵庫 横 収納ラック 調味料ラック スチール 壁面収納 キッチン',itemCaption:'',itemPrice:0},
  {id:'h12-07',itemName:'ペットグルーミング掃除機 犬 猫 抜け毛 ブラシ バリカン 5点セット 収納付き',itemCaption:'',itemPrice:0},
  {id:'h12-10',itemName:'電動ミルクフォーマー 泡立て器 充電式 USB Type-C 3段階調節 ハンドミキサー',itemCaption:'',itemPrice:0}
];

function identity(local){return local?.canonicalIdentity||local?.raw?.productType?.value||null;}

test('diagnose remaining holdout12 composition misses without changing production logic',()=>{
  const rows=items.map(item=>{
    const parts=tokens(item.itemName);
    const facts=safeTitleFacts(item.itemName);
    const operators=operatorSupports(item.itemName);
    const candidates=parts.slice(0,5).map((value,index)=>{
      const row=scoreCandidate({value,index,parts,title:item.itemName,caption:item.itemCaption,facts,operators});
      return row?{value:row.value,total:row.total,nounShape:row.nounShape,featurePenalty:row.featurePenalty,lexical:row.lexical}:null;
    });
    const rule=resolveLocalUnderstanding({itemName:item.itemName,itemCaption:item.itemCaption});
    const literal=resolveLiteralIdentity(item);
    const repeated=repeatedLiteralIdentity(item);
    const semantic=evidenceBackedLeadingIdentity(item);
    const final=localZeroCall(item);
    return {
      id:item.id,
      rule:identity(rule),literal:identity(literal),repeated:identity(repeated),semantic:identity(semantic),final:final?.productType?.specific||null,
      facts:facts.map(x=>x.quote),operators,candidates
    };
  });
  console.log('HOLDOUT12_COMPOSITION_DIAGNOSTICS '+JSON.stringify(rows));
});
