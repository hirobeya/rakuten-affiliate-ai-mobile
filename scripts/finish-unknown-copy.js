'use strict';
const fs=require('fs');

function block(file,start,end,repl){
  let s=fs.readFileSync(file,'utf8');
  const a=s.indexOf(start),b=s.indexOf(end,a+start.length);
  if(a<0||b<0) throw new Error(`marker missing in ${file}`);
  fs.writeFileSync(file,s.slice(0,a)+repl+s.slice(b));
}
function once(file,from,to){
  let s=fs.readFileSync(file,'utf8');
  if(!s.includes(from)) throw new Error(`target missing in ${file}`);
  fs.writeFileSync(file,s.replace(from,to));
}

const quality=`  function evidenceValueLead(identity,facts=[]){
    const id=String(identity||'').trim(),j=(facts||[]).join(' ');
    if(/フィルター交換不要/.test(j)) return id+'を、交換の手間まで考えて選びたいなら。';
    if(/最大\\s*\\d+(?:[.,]\\d+)?\\s*時間/.test(j)) return id+'を、充電の頻度まで考えて選びたいなら。';
    if(/温度|保温|℃|°C/.test(j)) return id+'を、温度設定や保温まで見て選びたいなら。';
    if(/重量|\\d+(?:[.,]\\d+)?\\s*(?:g|kg)/i.test(j)) return id+'を、持ち運ぶときの重さまで比べて選びたいなら。';
    if(/容量|大容量|\\d+(?:[.,]\\d+)?\\s*(?:L|ml|mL)/.test(j)) return id+'を、容量までしっかり比べて選びたいなら。';
    if(/幅|奥行|高さ|長さ|サイズ|\\d+(?:[.,]\\d+)?\\s*(?:cm|mm)/.test(j)) return id+'を、置き場所やサイズ感まで確認して選びたいなら。';
    if(/Bluetooth|USB|Type-C|HDMI|マルチポイント|PSE|JIS|Ra\\d+/i.test(j)) return id+'を、接続方法や対応仕様まで確認して選びたいなら。';
    return id+'を、使い方に合う仕様まで見て選びたいなら。';
  }

  function evidenceValueLine(fact){
    const x=String(fact||'').trim();
    if(!x) return '';
    if(/フィルター交換不要/.test(x)) return '「'+x+'」と確認できます。交換用フィルターを用意する手間を減らしたい人には注目したいポイントです。';
    if(/最大\\s*\\d+(?:[.,]\\d+)?\\s*時間/.test(x)) return '「'+x+'」と確認できます。充電する回数をできるだけ減らして使いたいときに比べたい仕様です。';
    if(/\\d+\\s*段階.*温度|温度.*\\d+\\s*段階/.test(x)) return '「'+x+'」と確認できます。用途に合わせて温度を選びたい人が見ておきたい仕様です。';
    if(/\\d+(?:[.,]\\d+)?\\s*時間.*保温|保温.*\\d+(?:[.,]\\d+)?\\s*時間/.test(x)) return '「'+x+'」と確認できます。保温時間を比べて選びたいときの材料になります。';
    if(/マルチポイント接続/.test(x)) return '「'+x+'」と確認できます。複数端末を使う人が接続方法を比べるときの確認ポイントです。';
    if(/Bluetooth\\s*\\d/i.test(x)) return '「'+x+'」と確認できます。手持ちの機器との接続仕様を確認して選びたいときの比較材料になります。';
    if(/重量|\\d+(?:[.,]\\d+)?\\s*(?:g|kg)/i.test(x)) return '「'+x+'」と確認できます。持ち運ぶときの重さを比べて選びたい人に分かりやすい情報です。';
    if(/幅|奥行|高さ|長さ|サイズ|\\d+(?:[.,]\\d+)?\\s*(?:cm|mm)/.test(x)) return '「'+x+'」と確認できます。置き場所や収納場所に収まるか、購入前に比べやすい情報です。';
    if(/容量|大容量|\\d+(?:[.,]\\d+)?\\s*(?:L|ml|mL)/.test(x)) return '「'+x+'」と確認できます。必要な容量に合うかを比べて選びたいときの目安になります。';
    if(/ステンレス|ポリカーボネート|グラスファイバー|綿|コットン|素材/i.test(x)) return '「'+x+'」と確認できます。素材まで見て選びたい人が比較しやすいポイントです。';
    if(/クランプ式/.test(x)) return '「'+x+'」と確認できます。設置方法を重視する人が購入前に見ておきたいポイントです。';
    if(/USB|Type-C|HDMI|PSE|JIS|Ra\\d+/i.test(x)) return '「'+x+'」と確認できます。対応規格や仕様を確認してから選びたいときの比較材料になります。';
    return '「'+x+'」と確認できます。商品を比べるときに見ておきたい具体的な仕様です。';
  }

  function buildValidatedProductPost(item,identity,evidenceFacts=[]){
    const id=String(identity||'').normalize('NFKC').replace(/\\s+/g,' ').trim();
    const source=aiCopySource(item);
    if(!id||id.length>32||!source.includes(id)||AI_COPY_EVIDENCE_RISK_RE.test(id)) return '';
    const facts=validatedAiCopyEvidence(item,evidenceFacts),price=Number(item?.itemPrice);
    const lines=[evidenceValueLead(id,facts)];
    if(facts.length){
      for(const fact of facts.slice(0,2)) lines.push('',evidenceValueLine(fact));
      lines.push('','確認できるポイント👇');
      for(const fact of facts.slice(0,3)) lines.push('✓ '+fact);
    }else lines.push('',id+'として商品名・説明に記載されています。商品ページの詳細とあわせて、自分の条件に合うか確認できます。');
    if(Number.isFinite(price)&&price>0) lines.push('','価格：'+fmt(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\\n').slice(0,500);
  }

`;
block('public/room-copy-quality.js','  function buildValidatedProductPost(item,identity,evidenceFacts=[]){','  function buildGroundedBenefitPost(item,facts=[]){',quality);

const app=`function safeSearchIdentity(item){
  const q=String(lastSearchKeyword||'').normalize('NFKC').replace(/\\s+/g,' ').trim();
  if(!q||q.length>32||/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気)$/i.test(q)) return '';
  if(/ランキング|受賞|送料無料|クーポン|SALE|セール|半額|最安|ポイント\\d*倍|P\\d+倍/i.test(q)) return '';
  const source=compactGrounded([item?.itemName,item?.itemCaption].filter(Boolean).join(' ')),qc=compactGrounded(q);
  return qc.length>=3&&source.includes(qc)?q:'';
}

function aiPhase1Post(item,result){
  const v=result?.validation||{},insight=aiSalesInsight(item,result);
  const identity=v.productType?.valid===true?String(insight.productType||'').trim():safeSearchIdentity(item);
  if(!identity) return '';
  const combinedFacts=[...(Array.isArray(insight.features)?insight.features:[]),...(Array.isArray(insight.sellingPoints)?insight.sellingPoints:[])];
  const universalPost=window.UrenaviPainCopy?.buildValidatedProductPost?.(item,identity,combinedFacts)||'';
  if(universalPost) return universalPost;
  if(!(v?.mode==='simple'||v?.mode==='simple_partial')) return '';
  const titleTokens=window.UrenaviPainCopy?.titleFactTokens?.(item)||[];
  const facts=window.UrenaviFactSafety?.filterAllowedTitleFacts?.(titleTokens,combinedFacts)||[];
  return window.UrenaviPainCopy?.buildGroundedBenefitPost?.(item,facts)||window.UrenaviPainCopy?.buildNeutralFactPost?.(item,facts)||'';
}

`;
block('public/app.html','function aiPhase1Post(item,result){','function aiPanelMarkup(item,index){',app);

const live=`function safeKeywordIdentity(item,keyword){
  const q=normalize(keyword);
  if(!q||q.length>32||/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気)$/i.test(q)||risk(q)) return '';
  const src=normalize([item.itemName,item.itemCaption].filter(Boolean).join(' ')).replace(/[\\s\\-‐‑–—\\/／]+/g,'').toLowerCase();
  const qc=q.replace(/[\\s\\-‐‑–—\\/／]+/g,'').toLowerCase();
  return qc.length>=3&&src.includes(qc)?q:'';
}
function build(item,ai,keyword){
  const v=ai?.validation||{};
  const validatedType=(v.productType?.valid&&v.productType?.value)?String(v.productType.value).trim():'';
  const type=validatedType||safeKeywordIdentity(item,keyword),identitySource=validatedType?'validated_ai':(type?'search_keyword_grounded':'');
  const facts=[...(v.features||[]),...(v.sellingPoints||[])].filter(x=>x?.eligibleForCopyEvidence&&x?.text&&x?.evidence).map(x=>String(x.text).trim()).filter((x,i,a)=>x&&a.indexOf(x)===i);
  return {type,facts,post:window.UrenaviPainCopy?.buildValidatedProductPost?.(item,type,facts)||'',identitySource,reasons:Array.isArray(v.reasons)?v.reasons:[]};
}
function evaluate(item,ai,built){
  const v=ai?.data?.validation||{};
  const src=normalize([item.itemName,item.itemCaption].filter(Boolean).join(' '));
  const compact=s=>normalize(s).replace(/[\\s\\-‐‑–—\\/／]+/g,'').toLowerCase();
  const typeGrounded=!!built.type&&compact(src).includes(compact(built.type));
  const factsGrounded=built.facts.every(x=>src.includes(normalize(x))),nonblank=!!built.post.trim();
  const internalLeak=/eligibleFor|validation|unknowns|reason|debug|productType|sellingPoints|fallbackReason/i.test(built.post),risky=risk(built.post);
  const productTypeValid=v.productType?.valid===true||built.identitySource==='search_keyword_grounded';
  return {aiMode:v.mode||'',productTypeValid,typeGrounded,factsGrounded,nonblank,internalLeak,risky,identitySource:built.identitySource,reasons:built.reasons,pass:ai.ok&&productTypeValid&&typeGrounded&&factsGrounded&&nonblank&&!internalLeak&&!risky};
}
`;
block('public/live-unknown-10.html','function build(item,ai){','function render(rows){',live);
once('public/live-unknown-10.html','const built=build(item,ai.data);const ev=evaluate(item,ai,built);','const built=build(item,ai.data,keyword);const ev=evaluate(item,ai,built);');
once('public/live-unknown-10.html',"rows.push({keyword,itemName:String(item.itemName||''),itemCode:String(item.itemCode||''),itemPrice:Number(item.itemPrice)||0,aiStatus:ai.status,validationMode:ai.data?.validation?.mode||'',productType:built.type,facts:built.facts,post:built.post,eval:ev});","rows.push({keyword,itemName:String(item.itemName||''),itemCode:String(item.itemCode||''),itemPrice:Number(item.itemPrice)||0,aiStatus:ai.status,validationMode:ai.data?.validation?.mode||'',validationReasons:built.reasons,identitySource:built.identitySource,productType:built.type,facts:built.facts,post:built.post,eval:ev});");
once('public/live-unknown-10.html','本番ウレナビにログインしてから、このページをSafariで開き直してください。','本番ウレナビにログインした同じブラウザで、このページを開き直してください。');
once('public/live-unknown-10.html','本番ウレナビにログインしてからSafariで開いてください。','本番ウレナビにログインした同じブラウザで開いてください。');

fs.writeFileSync('tests/live-unknown-10-page.test.js',`const fs=require('fs');\nconst html=fs.readFileSync('public/live-unknown-10.html','utf8');\nconst must=['電気シェーバー','エアフライヤー','折りたたみ傘','電気ケトル','ネックピロー','ワイヤレスイヤホン','フードプロセッサー','デスクライト','キャリーケース','加湿器','/api/search','/api/room-ai','buildValidatedProductPost','owner限定','safeKeywordIdentity','search_keyword_grounded','ai?.data?.validation','validationReasons'];\nfor(const s of must){if(!html.includes(s))throw new Error('missing '+s);}\nif((html.match(/KEYWORDS=\\[/g)||[]).length!==1)throw new Error('keyword list missing');\nif(html.includes('このページをSafariで'))throw new Error('browser-specific guidance remains');\nconsole.log('live unknown 10 page test: PASS');\n`);

fs.writeFileSync('tests/unknown-universal-finish.test.js',`'use strict';\nconst assert=require('node:assert/strict');\nglobal.window={};\nrequire('../public/pain-copy.js');\nglobal.window.UrenaviFactSafety=require('../public/fact-safety.js');\nrequire('../public/room-copy-quality.js');\nconst api=global.window.UrenaviPainCopy;\nconst cases=[\n['earbuds',{itemName:'完全ワイヤレスイヤホン Bluetooth 5.3 最大60時間再生',itemCaption:'完全ワイヤレスイヤホン Bluetooth 5.3 最大60時間再生',itemPrice:7990},'完全ワイヤレスイヤホン',['Bluetooth 5.3','最大60時間再生'],/充電する回数|接続仕様/],\n['humidifier',{itemName:'加湿器 3.2リットル大容量 フィルター交換不要',itemCaption:'加湿器 3.2リットル大容量 フィルター交換不要',itemPrice:55000},'加湿器',['3.2リットル大容量','フィルター交換不要'],/交換用フィルター/],\n['kettle',{itemName:'電気ケトル 1.0L 7段階温度調節 4時間保温',itemCaption:'電気ケトル 1.0L 7段階温度調節 4時間保温',itemPrice:4980},'電気ケトル',['7段階温度調節','4時間保温'],/温度を選びたい|保温時間/],\n['unknown',{itemName:'架空ツールX 重量 260g 幅 30cm',itemCaption:'架空ツールX 重量 260g 幅 30cm',itemPrice:1700},'架空ツールX',['重量 260g','幅 30cm'],/持ち運ぶときの重さ|置き場所/]\n];\nfor(const [name,item,id,facts,want] of cases){const post=api.buildValidatedProductPost(item,id,facts);assert.ok(post,name+' blank');assert.match(post,want);assert.doesNotMatch(post,/商品説明では「|絶対|必ず|確実に|ランキング|受賞/);}\nassert.equal(api.buildValidatedProductPost({itemName:'別の商品',itemCaption:'重量 100g'},'存在しない商品',['重量 100g']),'');\nconsole.log('unknown universal finish: PASS');\n`);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(!String(pkg.scripts['test:copy']).includes('unknown-universal-finish.test.js')) pkg.scripts['test:copy']+=' && node tests/unknown-universal-finish.test.js';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('finish unknown copy patch applied');
