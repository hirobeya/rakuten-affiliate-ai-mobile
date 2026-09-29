'use strict';

const DEFAULT_MODEL='qwen/qwen3.8-27b';
const MIN_DESCRIPTION_CHARS=120;
const MAX_NAME_CHARS=900;
const MAX_CATCH_CHARS=500;
const MAX_DESCRIPTION_CHARS=5000;
const MAX_OUTPUT_TOKENS=900;
const AI_TIMEOUT_MS=15000;
const PROMPT_VERSION='2026-09-30-room-post-single-pass-v3';
const SENSITIVE_GENRES=new Set(['100939','100938','551169']);

const OUTPUT_SCHEMA={
  type:'object',additionalProperties:false,
  required:['understood','product_summary','facts_used','post_text','hashtags'],
  properties:{
    understood:{type:'boolean'},
    product_summary:{type:'string',maxLength:80},
    facts_used:{type:'array',maxItems:8,items:{type:'string',maxLength:120}},
    post_text:{type:'string',maxLength:700},
    hashtags:{type:'array',maxItems:6,items:{type:'string',maxLength:40}}
  }
};

const LEGAL_PATTERNS=[
  /(?:治る|治療|効く|効き目|改善する|予防する|痩せる|脂肪が落ちる|小顔になる|若返る|リフトアップする)/i,
  /(?:絶対|必ず|完全に安全|100%安全|最安|日本一|No\.?1|ナンバーワン|業界一|世界一)/i
];
const INTERNAL_PATTERNS=[
  /(?:needs_value|invalid_product|qualityGate|validationReasons|rawAiJson|schema_version|result_status)/i,
  /(?:"understood"|"product_summary"|"facts_used"|"post_text"|"hashtags")/i,
  /(?:JSONを返|内部ステータス|警告文|システムプロンプト)/i
];
const ABSTRACT_PATTERNS=[/(?:比較ポイント|機能が魅力|確認ポイントになります|候補に入れる理由を一つずつ確認)/];
const NUMBER_UNIT_RE=/[0-9０-９]+(?:[.,．，][0-9０-９]+)?\s*(?:mm|cm|m|km|g|kg|ml|mL|L|W|V|A|Ah|mAh|Wh|Hz|kHz|MHz|GHz|GB|TB|℃|°C|%|円|枚|個|本|台|人|回|分|秒|時間|日|段|点|色|組|セット|粒|錠|包|杯|足|着)/gi;

function stripHtml(value=''){
  return String(value??'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");
}
function compact(value=''){return String(value??'').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
function removeBoilerplate(value=''){
  const lines=compact(stripHtml(value)).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  return lines.filter(line=>!/(?:送料無料|送料\s*無料|ポイント\s*\d+倍|クーポン|お買い物マラソン|スーパーSALE|楽天ランキング|ショップレビュー|店舗レビュー|営業日|発送予定|配送について|返品について|ラッピング|ギフト包装)/i.test(line)).join('\n');
}
function cut(value,max){const s=compact(value);return s.length<=max?s:s.slice(0,max);}
function prepareInput(raw={}){
  const itemName=cut(removeBoilerplate(raw.itemName||''),MAX_NAME_CHARS);
  const catchcopy=cut(removeBoilerplate(raw.catchcopy||raw.itemCatchCopy||''),MAX_CATCH_CHARS);
  const description=cut(removeBoilerplate(raw.description||raw.itemDescription||raw.itemCaption||''),MAX_DESCRIPTION_CHARS);
  const sourceText=compact([itemName,catchcopy,description].filter(Boolean).join('\n'));
  return {
    itemCode:String(raw.itemCode||'').trim().slice(0,300),itemName,catchcopy,description,sourceText,
    itemPrice:Number(raw.itemPrice)||0,reviewAverage:Number(raw.reviewAverage)||0,reviewCount:Number(raw.reviewCount)||0,
    genreId:String(raw.genreId||'').trim(),imageUrl:String(raw.imageUrl||'').trim()
  };
}
function effectiveTextLength(input){return compact(input?.description||'').replace(/\s/g,'').length;}
function sensitiveGenre(genreId=''){
  const env=String(process.env.URENAVI_SENSITIVE_GENRE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return SENSITIVE_GENRES.has(String(genreId))||env.includes(String(genreId));
}
function systemPrompt(input,{withImage=false}={}){
  const sensitive=sensitiveGenre(input.genreId)?'この商品は医療・美容・健康に近い可能性があります。医薬品的な効能、治療、予防、身体変化を断定せず、入力で確認できる事実と一般的な使用場面だけで書いてください。':'';
  return `あなたは楽天ROOMで、そのまま投稿できる自然な日本語を書く編集者です。回答は指定JSONだけ。1回で完成させてください。\n\n【商品理解】\n- 商品名・キャッチコピー・説明文を普通に読んで、何の商品か分かれば understood=true。分からない時だけ false。\n- product_summary は商品種別だけを書く。例:「電気ケトル」「バイク用グローブ」「収納ベンチ」。数値・性能・効果・形容詞を入れない。\n\n【絶対に守る事実境界】\n- 数値、仕様、性能、材質の性質、対応範囲、効果を創作・補完しない。\n- facts_used は、商品名・キャッチコピー・説明文に実際に存在する短い文字列をそのまま抜き出す。言い換えない。\n- post_text の商品事実は facts_used で支えられる内容だけにする。\n- 入力に書かれていない「性能の結果」を推測しない。仕様を読んで常識的に思えても書かない。\n- 禁止例: 材質→柔らかい/丈夫/高級、重量→疲れにくい/持ち運びやすい、防水等級→水洗い可/濡れた手で使える/風呂・シャワー可、刃数→深剃り/肌に優しい、温度設定→味が良くなる/安定する、USB充電→PCやモバイルバッテリーで充電できる。入力に同じ意味が明記されている場合だけ可。\n- メンズ/レディース表記から「男女兼用」、箱型から「見た目がすっきり」、価格から「安い・手頃・コスパが良い」、レビューから「人気・高評価」へ変換しない。\n- itemPrice、reviewAverage、reviewCount は商品理解の補助にしてよいが、post_text に価格・レビュー数値や価格評価を書かない。\n\n【許される便益は一段だけ】\n- 便益は、入力に明記された機能をそのまま使う行動へつなぐ時だけ書ける。物理性能・品質・効果の推測は禁止。\n- OK:「スマホ対応」→「スマホを確認したい時、グローブを外す手間を減らせる」。機能名から直接つながる操作だから。\n- OK:「200枚入り」→「毎日使う消耗品を、買い足す回数を減らしたい人に」。数量から直接つながる補充頻度だから。\n- OK:「折りたたみ式」→「使わない時にたたんでおきたい場面に」。機構から直接つながる動作だから。\n- NG:「92g」→「疲れにくい」。体感性能の推測。\n- NG:「IPX4」→「水洗いできる」。規格の解釈を追加。\n- NG:「1℃単位」→「味が安定する」。結果・効果の推測。\n- NG:「6枚刃」→「よく剃れる」。性能の推測。\n- 入力にない季節、天候、場所、対象者、贈答用途、他の機器、専門用途を勝手に追加しない。\n- 迷った便益は書かず、確認できる事実と直接の使用場面だけで自然な文章にする。\n\n【文章】\n- 1文目で必ず何の商品か分かる具体的な名詞を入れる。\n- 「事実 → それを欲しい人 → 使う場面 → 何が楽になるか」の順で2〜4段落。本文は目安120〜240文字。短くても具体的な方を優先。\n- 1つの文に事実と便益を詰め込みすぎない。事実の文、その事実から直接つながる便益の文、と分ける。\n- 私ならこういう時に候補にしたい、という友人に勧める自然な口調は可。ただし「使ってみた」「愛用中」など実使用を装う表現は禁止。\n- 「比較ポイント」「機能が魅力」「確認ポイント」「万能」「ぴったり」「良い感じ」「コスパ」「手頃」のような、商品を入れ替えても成立する空疎・評価的表現は禁止。\n- 日本語として不自然な語、文字化け、途中で切れた文、意味不明な比喩は出さない。\n- ハッシュタグは3〜5個。日本語または一般的な英数字だけで、商品種別・用途に直接関係する短いタグにする。空白や他言語文字を混ぜない。\n- 色や外観は文章入力に明記されている時だけ書く。${withImage?'画像は商品の種類を特定するためだけに使う。画像から色・サイズ・数量・材質・性能・外観の特徴を本文へ追加しない。':''}\n${sensitive}\n\n【良い例1：収納】\n入力:「折りたたみ収納ボックス 50L」「使わない時は折りたたみ可能」\n方向性:「50Lの折りたたみ収納ボックス。季節物や日用品をまとめて入れたい時に使いやすい容量です。使わない時は折りたためるので、空になった箱をそのまま置いておく手間を減らせます。」\n\n【良い例2：調理家電】\n入力:「電気ケトル 0.8L」「1℃単位で温度設定」\n方向性:「0.8Lの電気ケトル。飲み物に合わせて温度を自分で決めたい人に。1℃単位で設定できるので、毎回同じ設定に合わせたい時に使いやすいです。」\n\n【良い例3：日用品】\n入力:「ペット用うんち袋 200枚入り」\n方向性:「200枚入りのペット用うんち袋。散歩やトイレ処理で毎日使う消耗品を、まとめてストックしたい人に。何度も買い足す手間を減らしたい時に選びやすい量です。」`;
}
function outputText(data){if(typeof data?.output_text==='string')return data.output_text;for(const out of data?.output||[])for(const c of out?.content||[])if(typeof c?.text==='string')return c.text;return '';}
async function callGroqOnce({apiKey,model=DEFAULT_MODEL,input,imageDataUrl=null,fetchImpl=fetch}){
  const content=[{type:'input_text',text:JSON.stringify({itemName:input.itemName,catchcopy:input.catchcopy,description:input.description,itemPrice:input.itemPrice,reviewAverage:input.reviewAverage,reviewCount:input.reviewCount,genreId:input.genreId})}];
  if(imageDataUrl)content.push({type:'input_image',image_url:imageDataUrl,detail:'low'});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
  try{
    const r=await fetchImpl('https://api.groq.com/openai/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,reasoning:{effort:'none'},input:[{role:'system',content:[{type:'input_text',text:systemPrompt(input,{withImage:Boolean(imageDataUrl)})}]},{role:'user',content}],text:{format:{type:'json_schema',name:'urenavi_room_post_v1',strict:true,schema:OUTPUT_SCHEMA}},max_output_tokens:MAX_OUTPUT_TOKENS}),signal:controller.signal});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(`Groq request failed (${r.status})`);e.status=r.status;e.retryAfter=r.headers?.get?.('retry-after')||null;throw e;}
    const text=outputText(data);if(!text)throw new Error('Groq returned no structured output');
    let raw;try{raw=JSON.parse(text);}catch{throw new Error('Groq returned invalid JSON');}
    return{raw,model:data.model||model,usage:data.usage||null};
  }finally{clearTimeout(timer);}
}
function norm(v=''){return String(v??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();}
function splitSentences(text=''){
  return compact(text).split(/(?<=[。！？!?])\s*|\n+/).map(x=>x.trim()).filter(Boolean);
}
function numericTokens(text=''){return [...String(text||'').matchAll(NUMBER_UNIT_RE)].map(m=>m[0]);}
function hasUnsupportedNumber(sentence,sourceText){const source=norm(sourceText);return numericTokens(sentence).some(token=>!source.includes(norm(token)));}
function unsafeSentence(sentence,sourceText){return LEGAL_PATTERNS.some(re=>re.test(sentence))||INTERNAL_PATTERNS.some(re=>re.test(sentence))||ABSTRACT_PATTERNS.some(re=>re.test(sentence))||hasUnsupportedNumber(sentence,sourceText);}
function cleanHashtags(tags=[]){
  const out=[];
  for(const raw of Array.isArray(tags)?tags:[]){
    const body=String(raw||'').replace(/^#+/,'').replace(/\s+/g,'').trim();
    if(!body||body.length>32)continue;
    if(!/^[A-Za-z0-9０-９ぁ-んァ-ヶ一-龠々ー・]+$/.test(body))continue;
    const tag='#'+body;if(!out.includes(tag))out.push(tag);
    if(out.length>=5)break;
  }
  return out;
}
function inspectOutput(raw,input){
  const understood=raw?.understood===true;
  const rawPost=String(raw?.post_text||'').trim();
  const sentences=splitSentences(rawPost);
  const kept=sentences.filter(s=>!unsafeSentence(s,input.sourceText));
  const rawSummary=String(raw?.product_summary||'').trim().slice(0,80);
  const summary=rawSummary&&!numericTokens(rawSummary).length&&!INTERNAL_PATTERNS.some(re=>re.test(rawSummary))?rawSummary:'';
  if(understood&&!kept.length&&summary&&!unsafeSentence(summary,input.sourceText))kept.push(summary);
  const postText=kept.join('\n').trim();
  const factsUsed=(Array.isArray(raw?.facts_used)?raw.facts_used:[]).map(x=>String(x||'').trim()).filter(x=>x&&norm(input.sourceText).includes(norm(x))).slice(0,8);
  const hashtags=cleanHashtags(raw?.hashtags);
  const final={understood,product_summary:summary,facts_used:factsUsed,post_text:postText,hashtags};
  return{raw,final,removedSentenceCount:sentences.length-kept.filter(s=>sentences.includes(s)).length};
}
module.exports={DEFAULT_MODEL,MIN_DESCRIPTION_CHARS,MAX_DESCRIPTION_CHARS,MAX_OUTPUT_TOKENS,PROMPT_VERSION,OUTPUT_SCHEMA,LEGAL_PATTERNS,INTERNAL_PATTERNS,ABSTRACT_PATTERNS,stripHtml,removeBoilerplate,prepareInput,effectiveTextLength,sensitiveGenre,systemPrompt,callGroqOnce,numericTokens,hasUnsupportedNumber,inspectOutput};
