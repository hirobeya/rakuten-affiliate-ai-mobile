'use strict';
const test=require('node:test');
const {localZeroCall,resolveLiteralIdentity,extractLiteralSpecs}=require('../api/room-ai-v3');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const {repeatedLiteralIdentity,leadingCompoundIdentity}=require('../lib/repeated-literal-identity');
const {hasCompetingCompoundIdentity}=require('../lib/local-zero-identity-conflict');
const structured=require('../public/structured-room-copy');

const items=[
  ['h11-01','折りたたみ水切りラック','水切りラック 折りたたみ スリム シンク上 くるくる巻ける 水切りかご 水切りマット コンパクト シリコン キッチン 水切 水きり 抗菌 錆びない 52×42cm 収納 洗い物 台所用品 滑り止め 伸縮'],
  ['h11-02','卓上クリーナー','卓上クリーナー 充電式 消しゴム USB デスク掃除機 ミニクリーナー ハンディクリーナー コンパクト 消しカス リビング学習 テレワーク 吸引 デスク キーボード 掃除'],
  ['h11-03','ペット用ドライブシート','ペット用ドライブシート 犬 車 ペットドライブシート 後部座席用 犬 車 シート 防水 耐摩耗 滑り止め 折り畳み式 大容量収納ポケット付き 汚れ防止 簡単取り付け'],
  ['h11-05','電動鉛筆削り','電動鉛筆削り えんぴつシャープナー 2削り穴 電池式 自動オフ 電動 小型 安全 小学生 色鉛筆 デッサン 美術 新学期 入学入園 入学祝い プレゼント おしゃれ 子供 学校 オフィス事務用'],
  ['h11-06','毛玉取り器','毛玉クリーナー TKD-50A-W 毛玉取り テスコム 電動 コンセント コード式 毛玉取り機 毛玉取り器 5段階調整 衣類 セーター ニット 靴下 ソファ カーペット 海外OK'],
  ['h11-07','ケーブルボックス','ケーブルボックス ルーター 収納ボックス 幅40 奥行13.5 高さ37cm タップ コード 収納 配線カバー モデム ケーブル 隠す収納 整理整頓 整理収納 すっきり暮らす 山善 YAMAZEN'],
  ['h11-08','オートソープディスペンサー','ソープディスペンサー ハンドソープ オートディスペンサー自動 泡 吐出量3段階調節 充電式 防水 おしゃれ オートディスペンサー自動ディスペンサー詰め替え 300ml 壁掛け ハンドソープ 食器用洗剤キッチン洗面所などに適用'],
  ['h11-09','キッチンペーパーホルダー','キッチンペーパーホルダー 片手でカット おしゃれ 北欧 コストコ 大判対応 ペーパー立て キッチンタオルスタンド クッキングペーパー 台所 インテリア雑貨 シンプル ホワイト ブラック 白 黒 yamazaki 山崎実業 片手で切れるキッチンペーパーホルダー タワー tower']
].map(([id,category,itemName])=>({id,category,itemName,itemCaption:'',itemPrice:0}));

function identityOf(x){return String(x?.canonicalIdentity||x?.raw?.productType?.value||'')||null;}

test('diagnose holdout11 local misses after frozen first run',()=>{
  const rows=items.map(item=>{
    const rule=resolveLocalUnderstanding({itemName:item.itemName,itemCaption:item.itemCaption});
    const literal=resolveLiteralIdentity(item);
    const repeated=(!rule&&!literal)?repeatedLiteralIdentity(item):null;
    const leading=leadingCompoundIdentity(item);
    const chosen=rule||literal||repeated;
    const identity=identityOf(chosen);
    const leadingIdentity=identityOf(leading);
    const conflict=identity?hasCompetingCompoundIdentity(item.itemName,identity):false;
    const leadingConflict=leadingIdentity?hasCompetingCompoundIdentity(item.itemName,leadingIdentity):null;
    const copy=identity?structured.compose(item,{identity}):null;
    const leadingCopy=leadingIdentity?structured.compose(item,{identity:leadingIdentity}):null;
    const specs=extractLiteralSpecs(item).map(x=>x.quote);
    const result=localZeroCall(item);
    return {
      id:item.id,category:item.category,
      ruleIdentity:identityOf(rule),literalIdentity:identityOf(literal),repeatedIdentity:identityOf(repeated),chosenIdentity:identity,
      leadingIdentity,
      leadingHypothesis:leading?.identityHypothesis||null,
      leadingValidationMode:leading?.validation?.mode||null,
      leadingConflict,
      leadingStructuredStatus:leadingCopy?.status||null,
      leadingStructuredMethod:leadingCopy?.understanding?.method||null,
      leadingStructuredIdentity:leadingCopy?.understanding?.identity||null,
      leadingStructuredFacts:Array.isArray(leadingCopy?.facts)?leadingCopy.facts.map(x=>x.quote):[],
      conflict,specs,
      structuredStatus:copy?.status||null,
      structuredMethod:copy?.understanding?.method||null,
      structuredIdentity:copy?.understanding?.identity||null,
      structuredFacts:Array.isArray(copy?.facts)?copy.facts.map(x=>x.quote):[],
      zeroCall:Boolean(result),
      finalIdentity:result?.productType?.specific||null
    };
  });
  console.log('HOLDOUT11_LOCAL_MISS_DIAGNOSTICS '+JSON.stringify(rows));
});
