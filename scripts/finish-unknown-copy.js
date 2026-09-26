'use strict';
const fs=require('fs');

function replaceBlock(file,startMarker,endMarker,replacement){
  let s=fs.readFileSync(file,'utf8');
  const a=s.indexOf(startMarker);
  if(a<0) throw new Error(file+': start marker not found: '+startMarker);
  const b=s.indexOf(endMarker,a+startMarker.length);
  if(b<0) throw new Error(file+': end marker not found: '+endMarker);
  s=s.slice(0,a)+replacement+s.slice(b);
  fs.writeFileSync(file,s);
}
function replaceOnce(file,from,to){
  let s=fs.readFileSync(file,'utf8');
  if(!s.includes(from)) throw new Error(file+': exact replacement target not found');
  s=s.replace(from,to);
  fs.writeFileSync(file,s);
}

const qualityBlock=`  function evidenceValueLead(identity,facts=[]){
    const id=String(identity||'').trim();
    const joined=(facts||[]).join(' ');
    if(/フィルター交換不要/.test(joined)) return id+'を、交換やお手入れの手間まで考えて選びたいなら。';
    if(/最大\\s*\\d+(?:[.,]\\d+)?\\s*時間(?:再生|使用|稼働)?/.test(joined)) return id+'を、充電の頻度まで考えて選びたいなら。';
    if(/(?:温度|保温|℃|°C|段階温度)/i.test(joined)) return id+'を、温度設定や保温の使い方まで見て選びたいなら。';
    if(/重量|\\d+(?:[.,]\\d+)?\\s*(?:g|kg)\\b/i.test(joined)) return id+'を、持ち運ぶときの重さまで比べて選びたいなら。';
    if(/(?:容量|大容量|\\d+(?:[.,]\\d+)?\\s*(?:L|ml|mL)\\b)/.test(joined)) return id+'を、容量までしっかり比べて選びたいなら。';
    if(/(?:幅|奥行|高さ|長さ|サイズ|\\d+(?:[.,]\\d+)?\\s*(?:cm|mm)\\b)/.test(joined)) return id+'を、置き場所やサイズ感まで確認して選びたいなら。';
    if(/Bluetooth|USB|Type-C|HDMI|マルチポイント|PSE|JIS|Ra\\d+/i.test(joined)) return id+'を、接続方法や対応仕様まで確認して選びたいなら。';
    return id+'を、使い方に合う仕様まで見て選びたいなら。';
  }

  function evidenceValueLine(fact){
    const x=String(fact||'').trim();
    if(!x) return '';
    if(/フィルター交換不要/.test(x)) return '「'+x+'」と確認できます。交換用フィルターを用意する手間を減らしたい人には注目したいポイントです。';
    if(/最大\\s*\\d+(?:[.,]\\d+)?\\s*時間(?:再生|使用|稼働)?/.test(x)) return '「'+x+'」と確認できます。充電する回数をできるだけ減らして使いたいときに比べたい仕様です。';
    if(/(?:\\d+\\s*段階.*温度|温度.*\\d+\\s*段階)/.test(x)) return '「'+x+'」と確認できます。用途に合わせて温度を選びたい人が見ておきたい仕様です。';
    if(/\\d+(?:[.,]\\d+)?\\s*時間.*保温|保温.*\\d+(?:[.,]\\d+)?\\s*時間/.test(x)) return '「'+x+'」と確認できます。使うタイミングまで少し時間が空くとき、保温時間を比べる材料になります。';
    if(/マルチポイント接続/.test(x)) return '「'+x+'」と確認できます。複数の端末を使い分ける人が接続方法を比べるときの確認ポイントです。';
    if(/Bluetooth\\s*\\d/i.test(x)) return '「'+x+'」と確認できます。手持ちの機器との接続仕様を確認して選びたいときの比較材料になります。';
    if(/重量|\\d+(?:[.,]\\d+)?\\s*(?:g|kg)\\b/i.test(x)) return '「'+x+'」と確認できます。持ち運ぶときの重さを比べて選びたい人に分かりやすい情報です。';
    if(/(?:幅|奥行|高さ|長さ|サイズ).*\\d|\\d+(?:[.,]\\d+)?\\s*(?:cm|mm)\\b/.test(x)) return '「'+x+'」と確認できます。置き場所や収納場所に収まるか、購入前に比べやすい情報です。';
    if(/(?:容量|大容量).*\\d|\\d+(?:[.,]\\d+)?\\s*(?:L|ml|mL)\\b/.test(x)) return '「'+x+'」と確認できます。必要な容量に合うかを比べて選びたいときの目安になります。';
    if(/(?:ステンレス|ポリカーボネート|グラスファイバー|綿|コットン|素材)/i.test(x)) return '「'+x+'」と確認できます。素材まで見て選びたい人が比較しやすいポイントです。';
    if(/クランプ式/.test(x)) return '「'+x+'」と確認できます。設置方法を重視する人が購入前に見ておきたいポイントです。';
    if(/(?:USB|Type-C|HDMI|PSE|JIS|Ra\\d+)/i.test(x)) return '「'+x+'」と確認できます。対応規格や仕様を確認してから選びたいときの比較材料になります。';
    return '「'+x+'」と確認できます。商品を比べるときに見ておきたい具体的な仕様です。';
  }

  function buildValidatedProductPost(item,identity,evidenceFacts=[]){
    const id=String(identity||'').normalize('NFKC').replace(/\\s+/g,' ').trim();
    const source=aiCopySource(item);
    if(!id||id.length>32||!source.includes(id)||AI_COPY_EVIDENCE_RISK_RE.test(id)) return '';
    const facts=validatedAiCopyEvidence(item,evidenceFacts);
    const price=Number(item?.itemPrice);
    const lines=[evidenceValueLead(id,facts)];
    if(facts.length){
      for(const fact of facts.slice(0,2)) lines.push('',evidenceValueLine(fact));
      lines.push('','確認できるポイント👇');
      for(const fact of facts.slice(0,3)) lines.push('✓ '+fact);
    }else{
      lines.push('',id+'として商品名・説明に記載されています。価格や商品ページの詳細を見比べながら、自分の条件に合うか確認できます。');
    }
    if(Number.isFinite(price)&&price>0) lines.push('','価格：'+fmt(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\\n').slice(0,500);
  }

`;
replaceBlock('public/room-copy-quality.js','  function buildValidatedProductPost(item,identity,evidenceFacts=[]){','  function buildGroundedBenefitPost(item,facts=[]){',qualityBlock);

const appBlock=`function safeSearchIdentity(item){
  const q=String(lastSearchKeyword||'').normalize('NFKC').replace(/\\s+/g,' ').trim();
  if(!q||q.length>32) return '';
  if(/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気)$/i.test(q)) return '';
  if(/(?:ランキング|受賞|送料無料|クーポン|SALE|セール|半額|最安|ポイント\\d*倍|P\\d+倍)/i.test(q)) return '';
  const source=compactGrounded([item?.itemName,item?.itemCaption].filter(Boolean).join(' '));
  const qc=compactGrounded(q);
  return qc.length>=3&&source.includes(qc)?q:'';
}

function aiPhase1Post(item,result){
  const v=result?.validation||{};
  const insight=aiSalesInsight(item,result);
  const identity=v.productType?.valid===true
    ?String(insight.productType||'').trim()
    :safeSearchIdentity(item);
  if(!identity) return '';

  const combinedFacts=[
    ...(Array.isArray(insight.features)?insight.features:[]),
    ...(Array.isArray(insight.sellingPoints)?insight.sellingPoints:[])
  ];
  const universalPost=window.UrenaviPainCopy?.buildValidatedProductPost?.(item,identity,combinedFacts)||'';
  if(universalPost) return universalPost;
  if(!(v?.mode==='simple'||v?.mode==='simple_partial')) return '';
  const titleTokens=window.UrenaviPainCopy?.titleFactTokens?.(item)||[];
  const facts=window.UrenaviFactSafety?.filterAllowedTitleFacts?.(titleTokens,combinedFacts)||[];
  return window.UrenaviPainCopy?.buildGroundedBenefitPost?.(item,facts)
    ||window.UrenaviPainCopy?.buildNeutralFactPost?.(item,facts)
    ||'';
}

`;
replaceBlock('public/app.html','function aiPhase1Post(item,result){','function aiPanelMarkup(item,index){',appBlock);

const liveBlock=`function safeKeywordIdentity(item,keyword){
  const q=normalize(keyword);
  if(!q||q.length>32||/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気)$/i.test(q)) return '';
  if(risk(q)) return '';
  const src=normalize([item.itemName,item.itemCaption].filter(Boolean).join(' ')).replace(/[\\s\\-‐‑–—\\/／]+/g,'').toLowerCase();
  const qc=q.replace(/[\\s\\-‐‑–—\\/／]+/g,'').toLowerCase();
  return qc.length>=3&&src.includes(qc)?q:'';
}
function build(item,ai,keyword){
  const v=ai?.validation||{};
  const validatedType=(v.productType?.valid&&v.productType?.value)?String(v.productType.value).trim():'';
  const type=validatedType||safeKeywordIdentity(item,keyword);
  const identitySource=validatedType?'validated_ai':(type?'search_keyword_grounded':'');
  const facts=[...(v.features||[]),...(v.sellingPoints||[])].filter(x=>x?.eligibleForCopyEvidence&&x?.text&&x?.evidence).map(x=>String(x.text).trim()).filter((x,i,a)=>x&&a.indexOf(x)===i);
  const post=window.UrenaviPainCopy?.buildValidatedProductPost?.(item,type,facts)||'';
  return {type,facts,post,identitySource,reasons:Array.isArray(v.reasons)?v.reasons:[]};
}
function evaluate(item,ai,built){
  const v=ai?.data?.validation||{};
  const src=normalize([item.itemName,item.itemCaption].filter(Boolean).join(' '));
  const typeGrounded=!!built.type&&src.replace(/[\\s\\-‐‑–—\\/／]+/g,'').toLowerCase().includes(normalize(built.type).replace(/[\\s\\-‐‑–—\\/／]+/g,'').toLowerCase());
  const factsGrounded=built.facts.every(x=>src.includes(normalize(x)));
  const nonblank=!!built.post.trim();
  const internalLeak=/eligibleFor|validation|unknowns|reason|debug|productType|sellingPoints|fallbackReason/i.test(built.post);
  const risky=risk(built.post);
  const productTypeValid=v.productType?.valid===true||built.identitySource==='search_keyword_grounded';
  return {aiMode:v.mode||'',productTypeValid,typeGrounded,factsGrounded,nonblank,internalLeak,risky,identitySource:built.identitySource,reasons:built.reasons,pass:ai.ok&&productTypeValid&&typeGrounded&&factsGrounded&&nonblank&&!internalLeak&&!risky};
}
`;
replaceBlock('public/live-unknown-10.html','function build(item,ai){','function render(rows){',liveBlock);
replaceOnce('public/live-unknown-10.html','const built=build(item,ai.data);const ev=evaluate(item,ai,built);','const built=build(item,ai.data,keyword);const ev=evaluate(item,ai,built);');
replaceOnce('public/live-unknown-10.html',"rows.push({keyword,itemName:String(item.itemName||''),itemCode:String(item.itemCode||''),itemPrice:Number(item.itemPrice)||0,aiStatus:ai.status,validationMode:ai.data?.validation?.mode||'',productType:built.type,facts:built.facts,post:built.post,eval:ev});","rows.push({keyword,itemName:String(item.itemName||''),itemCode:String(item.itemCode||''),itemPrice:Number(item.itemPrice)||0,aiStatus:ai.status,validationMode:ai.data?.validation?.mode||'',validationReasons:built.reasons,identitySource:built.identitySource,productType:built.type,facts:built.facts,post:built.post,eval:ev});");
replaceOnce('public/live-unknown-10.html','本番ウレナビにログインしてから、このページをSafariで開き直してください。','本番ウレナビにログインした同じブラウザで、このページを開き直してください。');
replaceOnce('public/live-unknown-10.html','本番ウレナビにログインしてからSafariで開いてください。','本番ウレナビにログインした同じブラウザで開いてください。');

const liveTest=`const fs=require('fs');
const html=fs.readFileSync('public/live-unknown-10.html','utf8');
const must=['電気シェーバー','エアフライヤー','折りたたみ傘','電気ケトル','ネックピロー','ワイヤレスイヤホン','フードプロセッサー','デスクライト','キャリーケース','加湿器','/api/search','/api/room-ai','buildValidatedProductPost','owner限定','safeKeywordIdentity','search_keyword_grounded','ai?.data?.validation','validationReasons'];
for(const s of must){if(!html.includes(s))throw new Error('missing '+s);}
if((html.match(/KEYWORDS=\\[/g)||[]).length!==1)throw new Error('keyword list missing');
if(html.includes('このページをSafariで'))throw new Error('browser-specific login guidance remains');
console.log('live unknown 10 page test: PASS');
`;
fs.writeFileSync('tests/live-unknown-10-page.test.js',liveTest);

const finishTest=`'use strict';
const assert=require('node:assert/strict');
global.window={};
require('../public/pain-copy.js');
global.window.UrenaviFactSafety=require('../public/fact-safety.js');
require('../public/room-copy-quality.js');
const api=global.window.UrenaviPainCopy;
const cases=[
  {name:'earbuds',item:{itemName:'完全ワイヤレスイヤホン Bluetooth 5.3 最大60時間再生',itemCaption:'完全ワイヤレスイヤホン Bluetooth 5.3 最大60時間再生',itemPrice:7990},id:'完全ワイヤレスイヤホン',facts:['Bluetooth 5.3','最大60時間再生'],want:/充電する回数|接続仕様/},
  {name:'humidifier',item:{itemName:'加湿器 3.2リットル大容量 フィルター交換不要',itemCaption:'加湿器 3.2リットル大容量 フィルター交換不要',itemPrice:55000},id:'加湿器',facts:['3.2リットル大容量','フィルター交換不要'],want:/交換用フィルター/},
  {name:'kettle',item:{itemName:'電気ケトル 1.0L 7段階温度調節 4時間保温',itemCaption:'電気ケトル 1.0L 7段階温度調節 4時間保温',itemPrice:4980},id:'電気ケトル',facts:['7段階温度調節','4時間保温'],want:/温度を選びたい|保温時間/},
  {name:'unknown safe literal',item:{itemName:'架空ツールX 重量 260g 幅 30cm',itemCaption:'架空ツールX 重量 260g 幅 30cm',itemPrice:1700},id:'架空ツールX',facts:['重量 260g','幅 30cm'],want:/持ち運ぶときの重さ|置き場所/}
];
for(const tc of cases){
  const post=api.buildValidatedProductPost(tc.item,tc.id,tc.facts);
  assert.ok(post,tc.name+' blank');
  assert.match(post,tc.want,tc.name+' lacks grounded value');
  assert.doesNotMatch(post,/商品説明では「/);
  assert.doesNotMatch(post,/絶対|必ず|確実に|ランキング|受賞/);
}
const rejected=api.buildValidatedProductPost({itemName:'別の商品',itemCaption:'重量 100g',itemPrice:1000},'存在しない商品',['重量 100g']);
assert.equal(rejected,'');
console.log('unknown universal finish: PASS');
`;
fs.writeFileSync('tests/unknown-universal-finish.test.js',finishTest);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(!String(pkg.scripts['test:copy']).includes('unknown-universal-finish.test.js')) pkg.scripts['test:copy']+=' && node tests/unknown-universal-finish.test.js';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\\n');

console.log('finish unknown copy patch applied');
