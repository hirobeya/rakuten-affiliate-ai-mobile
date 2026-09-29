'use strict';

const DEFAULT_MODEL='qwen/qwen3.8-27b';
const MIN_DESCRIPTION_CHARS=120;
const MAX_NAME_CHARS=900;
const MAX_CATCH_CHARS=500;
const MAX_DESCRIPTION_CHARS=5000;
const MAX_OUTPUT_TOKENS=900;
const AI_TIMEOUT_MS=15000;
const PROMPT_VERSION='2026-09-29-room-post-single-pass-v2';
const SENSITIVE_GENRES=new Set(['100939','100938','551169']);

const OUTPUT_SCHEMA={
  type:'object',additionalProperties:false,
  required:['understood','product_summary','facts_used','post_text','hashtags'],
  properties:{
    understood:{type:'boolean'},
    product_summary:{type:'string',maxLength:120},
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
  return `あなたは楽天ROOMで、そのまま投稿できる自然な日本語を書く編集者です。回答は指定JSONだけ。1回で完成させてください。\n\n【商品理解】\n- 商品名・キャッチコピー・説明文を普通に読んで、何の商品か分かれば understood=true。分からない時だけ false。\n- product_summary は「何の商品か」だけを短く書く。入力にない性能・効果・使用可否を足さない。\n\n【事実】\n- 数値、仕様、性能、材質の性質、対応範囲、効果を創作・補完しない。\n- facts_used は、商品名・キャッチコピー・説明文に実際に存在する短い文字列をそのまま抜き出す。言い換えない。\n- post_text の商品事実は facts_used で支えられる内容だけにする。\n- 材質名から「柔らかい・丈夫・高級」などの性質を推測しない。重量から「疲れにくい」、防水等級から「風呂・シャワーで使える」、刃数から「深剃り・肌に優しい」など、入力にない性能を足さない。\n- メンズ/レディース表記から「男女兼用」、箱型から「見た目がすっきり」、価格から「安い・手頃・コスパが良い」、レビューから「人気・高評価」などへ勝手に変換しない。\n- itemPrice、reviewAverage、reviewCount は理解の補助にしてよいが、post_text に価格・レビュー数値や価格評価を書かない。\n\n【許される便益】\n- 入力事実そのものを変えず、その事実があることで自然に想像できる「使う場面」「手間がどう変わるか」を一段だけ提案してよい。\n- 例:「スマホ対応」→「停車中などにスマホを確認したい時、グローブを外さず操作できるのが便利」。\n- 例:「200枚入り」→「毎日使う消耗品を、買い足す回数を減らしたい人に」。\n- 例:「折りたたみ式」→「使わない時にたたんでおきたい場面に」。\n- 便益は「治る・性能が上がる」のような効果ではなく、使い方・段取り・持ち物・収納・選びやすさなど生活上の変化に限る。\n- 入力にない季節、天候、場所、対象者、贈答用途、他の機器、専門用途を勝手に追加しない。\n\n【文章】\n- 「事実 → それを欲しい人 → 使う場面 → 何が楽になるか」の順で、2〜4段落。本文は目安140〜280文字。短くても具体的な方を優先。\n- 私ならこういう時に候補にしたい、という友人に勧めるような自然な口調は可。ただし「使ってみた」「愛用中」など実使用を装う表現は禁止。\n- 「比較ポイント」「機能が魅力」「確認ポイント」「万能」「ぴったり」「良い感じ」のような商品を入れ替えても成立する空疎な表現は禁止。\n- 日本語として不自然な語、文字化け、途中で切れた文、意味不明な比喩は出さない。\n- ハッシュタグは3〜5個。商品種別・用途に直接関係する短いタグだけ。タグに空白を入れない。\n- 色や外観は文章入力に明記されている時だけ書く。${withImage?'画像は商品の種類を特定するためだけに使う。画像から色・サイズ・数量・材質・性能・外観の特徴を本文へ追加しない。':''}\n${sensitive}\n\n【良い例1：収納】\n入力:「折りたたみ収納ボックス 50L」「使わない時は折りたたみ可能」\n方向性:「季節物や日用品をまとめたい時に。50Lの収納量があり、使わない時は折りたためるので、空になった箱まで場所を取り続けるのを避けたい人に使いやすい。」\n\n【良い例2：調理家電】\n入力:「電気ケトル 0.8L」「1℃単位で温度設定」\n方向性:「飲み物に合わせて温度を決めたい人に。1℃単位で設定できるので、毎回同じ温度に合わせたい時に使いやすい。0.8Lなので必要量と置き方をイメージして選びたい。」\n\n【良い例3：日用品】\n入力:「ペット用うんち袋 200枚入り」\n方向性:「散歩やトイレ処理で毎日使う袋。200枚入りなので、消耗品を何度も買い足す手間を減らしたい人に。毎日の後始末用をまとめてストックしたい時に選びやすい。」`;
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
  const summary=String(raw?.product_summary||'').trim().slice(0,120);
  if(understood&&!kept.length&&summary&&!unsafeSentence(summary,input.sourceText))kept.push(summary);
  const postText=kept.join('\n').trim();
  const factsUsed=(Array.isArray(raw?.facts_used)?raw.facts_used:[]).map(x=>String(x||'').trim()).filter(x=>x&&norm(input.sourceText).includes(norm(x))).slice(0,8);
  const hashtags=cleanHashtags(raw?.hashtags);
  const final={understood,product_summary:summary,facts_used:factsUsed,post_text:postText,hashtags};
  return{raw,final,removedSentenceCount:sentences.length-kept.filter(s=>sentences.includes(s)).length};
}
module.exports={DEFAULT_MODEL,MIN_DESCRIPTION_CHARS,MAX_DESCRIPTION_CHARS,MAX_OUTPUT_TOKENS,PROMPT_VERSION,OUTPUT_SCHEMA,LEGAL_PATTERNS,INTERNAL_PATTERNS,ABSTRACT_PATTERNS,stripHtml,removeBoilerplate,prepareInput,effectiveTextLength,sensitiveGenre,systemPrompt,callGroqOnce,numericTokens,hasUnsupportedNumber,inspectOutput};
