'use strict';

const DEFAULT_MODEL='qwen/qwen3.8-27b';
const MIN_DESCRIPTION_CHARS=120;
const MAX_NAME_CHARS=900;
const MAX_CATCH_CHARS=500;
const MAX_DESCRIPTION_CHARS=5000;
const MAX_OUTPUT_TOKENS=1100;
const AI_TIMEOUT_MS=15000;
const PROMPT_VERSION='2026-09-29-room-post-single-pass-v1';
const SENSITIVE_GENRES=new Set(['100939','100938','551169']);

const OUTPUT_SCHEMA={
  type:'object',additionalProperties:false,
  required:['understood','product_summary','facts_used','post_text','hashtags'],
  properties:{
    understood:{type:'boolean'},
    product_summary:{type:'string',maxLength:120},
    facts_used:{type:'array',maxItems:10,items:{type:'string',maxLength:120}},
    post_text:{type:'string',maxLength:900},
    hashtags:{type:'array',maxItems:8,items:{type:'string',maxLength:40}}
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
const NUMBER_UNIT_RE=/[0-9０-９]+(?:[.,．，][0-9０-９]+)?\s*(?:mm|cm|m|km|g|kg|ml|mL|L|W|V|A|Ah|mAh|Wh|Hz|kHz|MHz|GHz|GB|TB|℃|°C|%|枚|個|本|台|人|回|分|秒|時間|日|段|点|色|組|セット|粒|錠|包|杯|足|着)/gi;

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
function effectiveTextLength(input){return compact([input.catchcopy,input.description].filter(Boolean).join(' ')).replace(/\s/g,'').length;}
function sensitiveGenre(genreId=''){
  const env=String(process.env.URENAVI_SENSITIVE_GENRE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return SENSITIVE_GENRES.has(String(genreId))||env.includes(String(genreId));
}
function systemPrompt(input,{withImage=false}={}){
  const sensitive=sensitiveGenre(input.genreId)?'この商品は医療・美容・健康に近い可能性があります。医薬品的な効能、治療、予防、身体変化を断定せず、入力で確認できる事実と一般的な使用場面だけで書いてください。':'';
  return `あなたは楽天ROOMで実際に使える日本語投稿文を書く編集者です。1回の回答で完成させてください。JSONだけを返してください。\n\n最重要ルール:\n- 商品名・キャッチコピー・説明文から何の商品か理解できたら understood=true。理解できない場合だけ false。\n- 数値、仕様、性能、効果を創作しない。\n- 入力の事実から自然に導ける使用場面や便益は提案してよい。例:「容量2L」から、十分な文脈があれば「家族分をまとめて用意したい時にも候補」と表現してよい。断定しすぎない。\n- 構成は「事実 → 誰が → どんな場面で → 何が楽になるか」。仕様の羅列だけで終わらせない。\n- 「比較ポイント」「機能が魅力」「確認ポイント」のように、商品を入れ替えても成立する抽象文は禁止。\n- 実際に使ったと虚偽の体験談を作らない。「使ってみた」「愛用中」など、入力にない体験は書かない。自然な一人称のおすすめ口調はよいが、未経験を経験済みに見せない。\n- ROOM向けに読みやすく改行し、本文は概ね180〜420文字。ハッシュタグは本文に混ぜず hashtags に分離。\n- 色や見た目は文章から明示されている場合のみ使用。${withImage?'画像は商品の種類を特定する補助にだけ使い、色・サイズ・外観の事実には使わない。':''}\n- facts_used には post_text で根拠にした入力事実だけを短く列挙する。\n${sensitive}\n\n良い例1（収納用品）:\n入力:「折りたたみ収納ボックス ふた付き 50L」「使わない時は折りたたみ可能」\n出力の方向性:「季節物や日用品をまとめたい時に、50Lの容量と折りたためる仕様が便利。使わない時まで場所を取り続けないのがうれしい。」のように、事実から生活場面へつなげる。\n\n良い例2（調理家電）:\n入力:「電気ケトル 0.8L 1℃単位で温度設定」\n出力の方向性:「飲み物に合わせて温度を選びたい人に。1℃単位で設定できるので、毎回同じ温度に合わせたい時に使いやすい。」のように、仕様を購入理由へ変える。\n\n良い例3（日用品）:\n入力:「ペット用うんち袋 200枚入り」\n出力の方向性:「毎日の散歩で使う消耗品だから、200枚入りはストック回数を減らしたい人にうれしい量。」のように、数量を生活上の便益へつなげる。`;
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
function cleanHashtags(tags=[]){return [...new Set((Array.isArray(tags)?tags:[]).map(x=>String(x||'').trim()).filter(Boolean).map(x=>x.startsWith('#')?x:'#'+x.replace(/^#+/,''))).values()].slice(0,8);}
function inspectOutput(raw,input){
  const understood=raw?.understood===true;
  const rawPost=String(raw?.post_text||'').trim();
  const kept=splitSentences(rawPost).filter(s=>!unsafeSentence(s,input.sourceText));
  const postText=kept.join('\n').trim();
  const factsUsed=(Array.isArray(raw?.facts_used)?raw.facts_used:[]).map(x=>String(x||'').trim()).filter(x=>x&&norm(input.sourceText).includes(norm(x))).slice(0,10);
  const hashtags=cleanHashtags(raw?.hashtags);
  const final={understood:Boolean(understood&&postText),product_summary:String(raw?.product_summary||'').trim().slice(0,120),facts_used:factsUsed,post_text:postText,hashtags};
  return{raw,final,removedSentenceCount:splitSentences(rawPost).length-kept.length};
}
module.exports={DEFAULT_MODEL,MIN_DESCRIPTION_CHARS,MAX_DESCRIPTION_CHARS,MAX_OUTPUT_TOKENS,PROMPT_VERSION,OUTPUT_SCHEMA,LEGAL_PATTERNS,INTERNAL_PATTERNS,ABSTRACT_PATTERNS,stripHtml,removeBoilerplate,prepareInput,effectiveTextLength,sensitiveGenre,systemPrompt,callGroqOnce,numericTokens,hasUnsupportedNumber,inspectOutput};
