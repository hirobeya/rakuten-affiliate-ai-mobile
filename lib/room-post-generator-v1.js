'use strict';

const DEFAULT_MODEL='qwen/qwen3.8-27b';
const MIN_DESCRIPTION_CHARS=120;
const MAX_NAME_CHARS=900;
const MAX_CATCH_CHARS=500;
const MAX_DESCRIPTION_CHARS=5000;
const MAX_OUTPUT_TOKENS=900;
const AI_TIMEOUT_MS=15000;
const PROMPT_VERSION='2026-09-30-room-post-single-pass-v6';
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
const ABSTRACT_PATTERNS=[
  /(?:比較ポイント|機能が魅力|確認ポイントになります|候補に入れる理由を一つずつ確認)/,
  /(?:選択肢に入りやすい|適しています|向いています|設定の自由度が確保されています)/
];
const FOREIGN_SCRIPT_RE=/[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Hangul}\p{Script=Thai}\p{Script=Devanagari}]/u;
const NUMBER_UNIT_RE=/[0-9０-９]+(?:[.,．，][0-9０-９]+)?\s*(?:mm|cm|km|kg|ml|mL|mAh|Wh|kHz|MHz|GHz|GB|TB|Hz|Ah|W|V|A|g|m|L|℃|°C|%|円|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{1,6})/giu;

function stripHtml(value=''){
  return String(value??'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");
}
function compact(value=''){
  return String(value??'').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function normalizeJapaneseSpacing(value=''){
  return String(value??'').replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])/gu,'$1');
}
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
  const sensitive=sensitiveGenre(input.genreId)
    ?'この商品は医療・美容・健康に近い可能性があります。医薬品的な効能、治療、予防、身体変化を断定せず、入力で確認できる事実と一般的な使用場面だけで書いてください。'
    :'';
  return `あなたは楽天ROOM向けの投稿文を一度で完成させる日本語編集者です。指定されたJSON以外は返さないでください。

【最優先ルール】
- 商品名・キャッチコピー・説明文を普通に読んで何の商品か分かれば understood=true。商品自体を特定できない時だけ false。
- product_summary は商品種別だけ。数値、評価、性能、効果、形容詞は入れない。
- facts_used は入力文に実際に書かれている短い文字列をそのまま抜き出す。言い換えない。
- 数値、仕様、性能、材質の性質、対応範囲、効果を創作・補完しない。
- 数値の単位や意味を変えない。「6個セット」を「6種類」、「2枚」を「2サイズ」などへ言い換えない。
- 入力にない人物、場所、季節、天候、用途、使用場面、他機器、結果を新しく足さない。
- 便益を無理に作らない。安全に直接つながる便益が無ければ、具体的な商品事実だけで自然に終えてよい。短い文章で構わない。
- post_text、product_summary、hashtags は自然な日本語と一般的な英数字だけを使う。キリル文字、アラビア文字、ハングルなど無関係な他言語文字を混ぜない。

【許される便益は一段だけ】
以下だけは、入力に該当する事実がある時に限り、直接の行動便益へ変換してよい。
1. スマホ対応のグローブ/手袋 → スマホ確認時に手袋を外す手間を減らせる。
2. 枚数・個数・本数・セット数などの入数 → 日常的に使う消耗品なら買い足す回数を減らしたい人に。
3. 折りたたみ式 → 使わない時にたたんでおきたい場面に。
4. 温度設定・温度調整・○℃単位 → 温度を自分で決めたい、毎回同じ設定に合わせたい時に。
5. 幅・高さ・奥行・寸法 → 置きたい場所や使うスペースに収まるか確認したい時に。
6. 説明文に用途や行動が明記されている → その明記された用途・行動だけを使ってよい。
上の6種類以外は、事実を便益に変換しない。仕様として述べるだけにする。

【絶対NGの推論例】
- 92g → 疲れにくい、持ち運びやすい、操作しやすい、手に馴染む。
- IPX4 → 水洗いできる、濡れた手で使える、風呂やシャワーで使える。
- 6枚刃 → 深剃り、よく剃れる、肌に優しい。
- 山羊革・本革 → 柔らかい、丈夫、高級、手の感覚を活かせる。
- 防風 → 手が冷えない、走行に集中できる。
- USB充電 → PCやモバイルバッテリーで充電できる、外出先で便利。
- 温度設定・1℃単位 → 味が良くなる、飲み物に最適、味が安定する。
- メンズ/レディース → 男女兼用。
- 価格 → 安い、手頃、コスパが良い。
- レビュー → 人気、高評価。

【post_text】
- 1文目で何の商品か分かる具体的な名詞を書く。
- 2〜4文を目安にするが、事実が少ない商品は1〜2文でもよい。文字数を埋めるための推論は禁止。
- 事実から許可された一段便益が作れる時だけ「誰が・どんな場面で・何が楽になるか」まで自然につなぐ。
- 許可された便益が作れない時は、商品種別と確認できる主要仕様を具体的に書いて終える。
- 「比較ポイント」「機能が魅力」「確認ポイント」「選択肢に入りやすい」「向いています」「適しています」「万能」「ぴったり」「コスパ」「手頃」のような入れ替え可能な評価文は禁止。
- 「使ってみた」「愛用中」「買ってよかった」など実使用を装う表現は禁止。
- itemPrice、reviewAverage、reviewCount は理解補助のみ。本文に価格やレビュー評価を書かない。

【hashtags】
- 3〜5個を目安。商品種別または入力文に明記された用途・仕様に直接関係するものだけ。
- 日本語または一般的な英数字だけ。空白、文字化け、無関係なタグは禁止。

${withImage?'【画像】画像は商品の種類を特定するためだけに使う。画像から色、サイズ、数量、材質、性能、外観の特徴をpost_textやfacts_usedへ追加しない。':''}
${sensitive}

【良い例1：事実だけで終える】
入力:「電気シェーバー 回転式6枚刃 IPX4 約92g USB充電」
投稿例:「回転式6枚刃の電気シェーバー。商品重量約92g、防水性能IPX4、USB充電対応です。」

【良い例2：明示機能から一段だけ便益】
入力:「バイク用グローブ 山羊革 防風 スマホ対応」
投稿例:「山羊革を使用したバイク用グローブ。防風仕様、スマホ対応です。スマホを確認したい時に、グローブを外す手間を減らせます。」

【良い例3：数量から一段だけ便益】
入力:「ペット用うんち袋 200枚入り」「散歩やトイレ処理に使える袋」
投稿例:「200枚入りのペット用うんち袋。散歩やトイレ処理に使う消耗品をまとめて用意して、買い足す回数を減らしたい時に選びやすい量です。」`;
}

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text;
  for(const out of data?.output||[]){
    if(out?.type!=='message')continue;
    for(const c of out?.content||[])if(typeof c?.text==='string'&&c.text.trim())return c.text;
  }
  return '';
}
async function callGroqOnce({apiKey,model=DEFAULT_MODEL,input,imageDataUrl=null,fetchImpl=fetch}){
  const content=[{type:'input_text',text:JSON.stringify({itemName:input.itemName,catchcopy:input.catchcopy,description:input.description,itemPrice:input.itemPrice,reviewAverage:input.reviewAverage,reviewCount:input.reviewCount,genreId:input.genreId})}];
  if(imageDataUrl)content.push({type:'input_image',image_url:imageDataUrl,detail:'low'});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
  try{
    const response=await fetchImpl('https://api.groq.com/openai/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,reasoning:{effort:'none'},
        input:[
          {role:'system',content:[{type:'input_text',text:systemPrompt(input,{withImage:Boolean(imageDataUrl)})}]},
          {role:'user',content}
        ],
        text:{format:{type:'json_schema',name:'urenavi_room_post_v1',strict:true,schema:OUTPUT_SCHEMA}},
        max_output_tokens:MAX_OUTPUT_TOKENS
      }),
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(data?.error?.message||`Groq request failed (${response.status})`);
      error.status=response.status;
      error.retryAfter=response.headers?.get?.('retry-after')||null;
      throw error;
    }
    const text=outputText(data);
    if(!text)throw new Error('Groq returned no structured message output');
    return{raw:JSON.parse(text),usage:data.usage||null};
  }finally{clearTimeout(timer);}
}

function norm(value=''){return String(value??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();}
function splitSentences(text=''){return compact(text).split(/(?<=[。！？!?])\s*|\n+/).map(x=>x.trim()).filter(Boolean);}
function numericTokens(text=''){return [...String(text||'').matchAll(NUMBER_UNIT_RE)].map(m=>m[0]);}
function hasUnsupportedNumber(sentence,sourceText){
  const source=norm(sourceText);
  return numericTokens(sentence).some(token=>!source.includes(norm(token)));
}
function unsafeSentence(sentence,sourceText){
  return LEGAL_PATTERNS.some(re=>re.test(sentence))
    ||INTERNAL_PATTERNS.some(re=>re.test(sentence))
    ||ABSTRACT_PATTERNS.some(re=>re.test(sentence))
    ||FOREIGN_SCRIPT_RE.test(sentence)
    ||hasUnsupportedNumber(sentence,sourceText);
}
function cleanHashtags(tags=[]){
  const out=[];
  for(const raw of Array.isArray(tags)?tags:[]){
    const body=String(raw||'').replace(/^#+/,'').replace(/\s+/g,'').trim();
    if(!body||body.length>32)continue;
    if(!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9_\-ー]+$/u.test(body))continue;
    const tag='#'+body;
    if(!out.includes(tag))out.push(tag);
    if(out.length>=5)break;
  }
  return out;
}
function cleanSummary(summary,sourceText){
  const s=normalizeJapaneseSpacing(String(summary||'').trim()).slice(0,80);
  if(!s)return'';
  if(hasUnsupportedNumber(s,sourceText))return'';
  if(FOREIGN_SCRIPT_RE.test(s))return'';
  if(LEGAL_PATTERNS.some(re=>re.test(s))||INTERNAL_PATTERNS.some(re=>re.test(s)))return'';
  return s;
}
function inspectOutput(raw,input){
  const understood=raw?.understood===true;
  const rawPost=normalizeJapaneseSpacing(String(raw?.post_text||'').trim());
  const sentences=splitSentences(rawPost);
  const kept=sentences.filter(s=>!unsafeSentence(s,input.sourceText));
  const postText=kept.join('\n');
  const summary=cleanSummary(raw?.product_summary,input.sourceText);
  const factsUsed=(Array.isArray(raw?.facts_used)?raw.facts_used:[])
    .map(x=>String(x||'').trim())
    .filter(x=>x&&!FOREIGN_SCRIPT_RE.test(x)&&norm(input.sourceText).includes(norm(x)))
    .slice(0,8);
  const hashtags=cleanHashtags(raw?.hashtags);
  const final={understood,product_summary:summary,facts_used:factsUsed,post_text:postText,hashtags};
  return{raw,final,removedSentenceCount:sentences.length-kept.length};
}

module.exports={
  DEFAULT_MODEL,MIN_DESCRIPTION_CHARS,MAX_DESCRIPTION_CHARS,MAX_OUTPUT_TOKENS,PROMPT_VERSION,
  OUTPUT_SCHEMA,LEGAL_PATTERNS,INTERNAL_PATTERNS,ABSTRACT_PATTERNS,FOREIGN_SCRIPT_RE,NUMBER_UNIT_RE,
  stripHtml,removeBoilerplate,prepareInput,effectiveTextLength,sensitiveGenre,systemPrompt,
  callGroqOnce,numericTokens,hasUnsupportedNumber,normalizeJapaneseSpacing,inspectOutput
};
