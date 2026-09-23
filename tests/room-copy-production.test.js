'use strict';
const fs=require('fs');
const path=require('path');

global.window={};
require(path.join(__dirname,'..','public','pain-copy.js'));
require(path.join(__dirname,'..','public','room-copy-quality.js'));

const api=global.window.UrenaviPainCopy;
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','regression-products.json'),'utf8'));
let failures=0;
const fail=(id,msg)=>{failures++;console.error('FAIL',id,'-',msg);};
const pass=(id,msg)=>console.log('PASS',id,'-',msg);

function balanced(id,text){
  for(const [o,c] of [['【','】'],['〖','〗'],['（','）'],['(',')'],['「','」'],['『','』'],['[',']'],['［','］']]){
    let d=0;
    for(const ch of String(text||'')){
      if(ch===o)d++;
      else if(ch===c){d--;if(d<0){fail(id,'unmatched '+c);break;}}
    }
    if(d!==0) fail(id,'unbalanced '+o+c+': '+text);
  }
  if(((String(text||'').match(/★/g)||[]).length%2)!==0) fail(id,'isolated ★');
}

for(const tc of fixture.cases){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0,catchcopy:'',itemCaption:'',genrePath:'',genreName:''};
  const a=api.analyzeRoomProduct(item,tc.searchKeyword||'');
  const copy=api.makeRoomCopy(item,tc.searchKeyword||'',{variant:0});
  const e=tc.expect||{};
  if(a.category!==e.category) fail(tc.id,'category '+a.category+' != '+e.category);
  if(a.usage!==e.usage) fail(tc.id,'usage '+a.usage+' != '+e.usage);
  if(Boolean(a.ambiguous)!==Boolean(e.ambiguous)) fail(tc.id,'ambiguous mismatch');
  if(a.outputMode!==e.outputMode) fail(tc.id,'outputMode '+a.outputMode+' != '+e.outputMode);
  for(const x of e.expectedFeatures||[]) if(!(a.facts||[]).includes(x)) fail(tc.id,'missing feature '+x+' got '+JSON.stringify(a.facts));
  for(const x of e.forbiddenFeatures||[]) if((a.facts||[]).includes(x)) fail(tc.id,'forbidden feature '+x);
  for(const x of e.forbiddenWords||[]) if(copy.includes(x)) fail(tc.id,'forbidden word '+x);
  if(copy.includes('価格：0円')) fail(tc.id,'zero price leaked');
  if(!copy.includes('※アフィリエイト広告を利用しています')) fail(tc.id,'disclosure missing');
  balanced(tc.id,copy);
}
if(failures===0) pass('fixed-cases',fixture.cases.length+' fixed cases');

// Required production safety cases.
const required=[
  {
    id:'bike-glove',keyword:'バイクグローブ',
    item:{itemName:'バイク グローブ 秋 夏 革 本革 バイク用 グローブ ツーリング スマホ対応',itemPrice:2980},
    check:(a,c)=>a.outputMode==='fallback'&&(a.conflicts||[]).some(x=>x.usage==='motorcycle_glove')&&!/掃除用手袋|手袋タイプの掃除/.test(c)
  },
  {
    id:'baseball-glove',keyword:'野球グローブ',
    item:{itemName:'野球 グローブ 軟式 大人 右投げ オールラウンド用 キャッチボール',itemPrice:5980},
    check:(a,c)=>a.outputMode==='fallback'&&(a.conflicts||[]).some(x=>x.usage==='baseball_glove')&&!/掃除用手袋|手袋タイプの掃除/.test(c)
  },
  {
    id:'cleaning-glove',keyword:'掃除用手袋',
    item:{itemName:'お掃除手袋 マイクロファイバー 掃除 手袋 2枚セット',itemPrice:980},
    check:(a,c)=>a.category==='cleaning'&&a.usage==='glove'&&a.outputMode==='full'&&/掃除用手袋/.test(c)
  },
  {
    id:'storage-bench',keyword:'収納ベンチ',
    item:{itemName:'【P10倍 9/24 9:59迄】 収納ベンチ 2人掛け 幅120 奥行37 高さ40cm ベンチ ソファ 収納ボックス',itemPrice:0},
    check:(a,c)=>a.outputMode==='fallback'&&!/P10倍|9\/24|9:59|価格：0円/.test(c)&&/収納/.test(c)
  },
  {
    id:'bos',keyword:'うんち袋',
    item:{itemName:'【20箱セット】 クリロン化成 うんちが臭わない袋 BOS ネコ用 箱型 SSサイズ 200枚入 ボス うんち袋',itemPrice:26980},
    check:(a,c)=>a.outputMode==='fallback'&&/BOS/.test(c)&&/うんち袋/.test(c)&&!/臭わない|防臭|うんちが\s+袋/.test(c)
  },
  {
    id:'mop-holder',keyword:'モップハンガー',
    item:{itemName:'モップハンガー RC型 コンパクト 6本掛【tmcp2212】',itemPrice:26566},
    check:(a,c)=>a.category==='storage'&&a.usage==='cleaning_tool_holder'&&a.outputMode==='fallback'&&!/モップで掃除/.test(c)
  },
  {
    id:'drive-bed',keyword:'ドライブベッド',
    item:{itemName:'ドライブベッド ドライブボックス 犬 車 シート ペット 洗える 後部座席 小型犬 中型犬',itemPrice:5980},
    check:(a,c)=>a.category==='pet'&&a.usage==='drive_bed'&&!/快眠|安眠|体圧分散/.test(c)
  },
  {
    id:'electric-mop-window',keyword:'電動モップ',
    item:{itemName:'電動モップ 回転モップクリーナー 網戸対応 コードレス 充電式',itemPrice:7980},
    check:(a,c)=>a.category==='cleaning'&&a.usage==='mop'&&!a.ambiguous&&!/網戸掃除用品/.test(c)
  },
  {
    id:'storage-same-family',keyword:'収納ボックス',
    item:{itemName:'収納ボックス 収納ケース 折りたたみ 3個セット',itemPrice:1980},
    check:(a,c)=>a.category==='storage'&&['storage_box','storage_case'].includes(a.usage)&&!a.ambiguous&&a.outputMode==='full'
  }
];

for(const tc of required){
  const a=api.analyzeRoomProduct(tc.item,tc.keyword);
  const copy=api.makeRoomCopy(tc.item,tc.keyword,{variant:0});
  if(!tc.check(a,copy)) fail(tc.id,JSON.stringify({category:a.category,usage:a.usage,ambiguous:a.ambiguous,outputMode:a.outputMode,conflicts:a.conflicts,copy}));
  else pass(tc.id,copy.replace(/\n/g,' | '));
  balanced(tc.id,copy);
}

for(const raw of [
  'P10倍 9/24 9:59迄 セール価格 テラモト モップハンガー',
  'クーポン利用で最安2380円 楽天1位26冠 モバイルバッテリー'
]){
  const clean=api.stripPromotionalText(raw);
  if(/P10倍|9\/24|9:59|セール価格|クーポン|最安|楽天1位|26冠/.test(clean)) fail('promo-strip',raw+' => '+clean);
}
const bosRisk=api.detectLegalRisk('うんちが臭わない袋 BOS 防臭');
if(!bosRisk.claimRisk) fail('claim-risk','BOS claim risk not detected');


// Final production regressions from live bike-glove verification.
{
  const raw='【リピーター続出】 バイク グローブ 秋 夏 革 本革';
  const cleaned=api.stripPromotionalText(raw);
  if(/リピーター続出/.test(cleaned)) fail('promo-repeaters','promo remains: '+cleaned);
}
{
  const item={
    itemName:'【楽天1位】バイクグローブ バイク レザーグローブ メッシュ 春夏用 メンズ レディース おすすめ 防寒 冬用 最強 本革 レザー ツーリング プレゼント 薄手 コスパ 防水 メッシュ オールシーズン 雨 大きいサイズ 手袋 指 スマホ操作',
    itemPrice:2880
  };
  const a=api.analyzeRoomProduct(item,'バイクグローブ');
  const copy=api.makeRoomCopy(item,'バイクグローブ');
  if(!(a.conflicts||[]).some(x=>x.usage==='motorcycle_glove')) fail('bike-claim-conflict','motorcycle conflict missing');
  if(/掃除用手袋|手袋タイプの掃除/.test(copy)) fail('bike-claim-conflict','wrong cleaning label: '+copy);
}
{
  const html=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
  if(html.includes('AI確認中です。確認が完了するまで')) fail('ai-pending-copy','internal AI pending text leaked');
  if(!html.includes('return aiSafeFallbackPost(item);')) fail('ai-pending-copy','safe pending fallback missing');
  if(!html.includes('.tab[data-i=')) fail('ai-rerender','item-card rerender fallback missing');
}

if(failures){console.error('ROOM production regression failures:',failures);process.exit(1);}
console.log('ROOM production regression passed: '+fixture.cases.length+' fixed cases + '+required.length+' required safety cases');
