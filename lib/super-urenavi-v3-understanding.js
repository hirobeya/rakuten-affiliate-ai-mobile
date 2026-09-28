'use strict';

const VALUE_TYPES=new Set(['single','range','options','identifier','text']);
const HOOK_TYPES=new Set(['question','relatable','failure_avoidance','number','scene']);
const PROMO_RE=/(?:ランキング|受賞|1位|最安|激安|限定|クーポン|ポイント\s*\d+倍|送料無料|セール|SALE)/i;
const CLAIM_RE=/(?:治る|改善|予防|防止|安全|安心|無害|保証|発火しない|燃えにくい|難燃|抗菌|除菌|殺菌|消臭|防臭|アレルギー|疲労|疲れ|痛み|快眠|安眠|健康|ヘルシー|小顔|引き締め|リフトアップ|痩せる|若返)/i;
const READER_SPEC_RE=/(?:\d|[０-９]|(?:^|[^A-Za-z])(?:cm|mm|kg|ml|mL|mAh|Hz|GB|TB)(?:$|[^A-Za-z]))/i;
const READER_PERFORMANCE_RE=/(?:高性能|高機能|大容量|強力|速い|高速|軽量|長時間|耐久|防水|撥水|保温|保冷|急速|静音|省エネ)/;
const IDENTITY_SPEC_RE=/(?:\d|[０-９]|(?:cm|mm|kg|g|ml|mL|L|mAh|Ah|W|V|Hz|GB|TB|°C|℃|RPM)|(?:大容量|軽量|高速|急速|強力|長時間|防水|撥水|静音|省エネ|\d+台\d+役|\d+役|\d+メニュー))/i;
function displayCompact(value=''){return String(value??'').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/\s+/g,' ').trim();}
function normalize(value=''){return String(value??'').normalize('NFKC').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').trim();}
function compact(value=''){return normalize(value).replace(/\s+/g,' ');}
function sourceParts(item={}){return [compact(item.itemName||''),compact(item.itemCaption||'')].filter(Boolean);}
function sourceDisplayParts(item={}){return [displayCompact(item.itemName||''),displayCompact(item.itemCaption||'')].filter(Boolean);}
function sourceContains(item,value){const v=compact(value);return Boolean(v&&sourceParts(item).some(x=>x.includes(v)));}
function sourceContainsExact(item,value){const v=displayCompact(value);return Boolean(v&&sourceDisplayParts(item).some(x=>x.includes(v)));}
function hasJapaneseText(value){const s=compact(value);if(!s)return false;const jp=(s.match(/[ぁ-んァ-ヶ一-龠々ー]/g)||[]).length;const asciiWords=s.match(/[A-Za-z]{4,}/g)||[];return jp>0&&asciiWords.length<=1;}
function hasNaturalReaderJapanese(value){const s=compact(value);return Boolean(hasJapaneseText(s)&&/[ぁ-んァ-ヶー]/.test(s));}
function readerLayerSafe(text,{specific='',general=''}={}){const s=compact(text);if(!s||s.length>90||!hasNaturalReaderJapanese(s)||READER_SPEC_RE.test(s)||READER_PERFORMANCE_RE.test(s)||PROMO_RE.test(s)||CLAIM_RE.test(s))return false;for(const n0 of [specific,general]){const n=compact(n0);if(n&&s.includes(n))return false;}return true;}
function identityNameSafe(value){const s=compact(value);return Boolean(s&&s.length<=48&&!PROMO_RE.test(s)&&!CLAIM_RE.test(s)&&!IDENTITY_SPEC_RE.test(s));}
function identityEvidenceSafe(value){const s=compact(value);return Boolean(s&&s.length<=120&&!PROMO_RE.test(s)&&!CLAIM_RE.test(s));}
function integerRefs(refs,max){if(!Array.isArray(refs))return [];return [...new Set(refs.filter(x=>Number.isInteger(x)&&x>=0&&x<max))];}
function normalizedAttribute(raw,index,item){
 if(!raw||typeof raw!=='object')return {valid:false,index,reason:'attribute_not_object'};
 const name=displayCompact(raw.name),value=displayCompact(raw.value),unit=displayCompact(raw.unit),qualifier=displayCompact(raw.qualifier),valueType=VALUE_TYPES.has(raw.valueType)?raw.valueType:'text',quote=displayCompact(raw.quote);
 if(!name||!value||!quote)return {valid:false,index,reason:'attribute_missing_fields'};
 if(!sourceContainsExact(item,quote))return {valid:false,index,reason:'attribute_quote_not_grounded'};
 if(!quote.includes(value))return {valid:false,index,reason:'attribute_value_not_in_quote'};
 if(PROMO_RE.test(compact(name+' '+value+' '+quote))||CLAIM_RE.test(compact(name+' '+value+' '+quote)))return {valid:false,index,reason:'attribute_unsafe_claim'};
 return {valid:true,index,attribute:{name,value,unit,qualifier,valueType,quote,sourceIndex:index}};
}
function conflictIndexes(attributes){const groups=new Map();for(const row of attributes){const key=compact(row.name).toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}const bad=new Set();for(const rows of groups.values()){if(new Set(rows.map(x=>compact(x.value).toLowerCase())).size>1)for(const row of rows)bad.add(row.sourceIndex);}return bad;}
function appealNeedsVerification(appeal,attributes){if(!appeal||typeof appeal!=='object')return false;const text=compact(appeal.text),noHassle=compact(appeal.noHassle),scene=compact(appeal.scene);if(noHassle||scene)return true;const refs=integerRefs(appeal.attributeRefs,attributes.length);if(!text||!refs.length)return false;return !refs.map(i=>attributes[i]?.quote||'').filter(Boolean).some(q=>compact(q).includes(text));}
function collectRawRefs(raw){
 const rows=[...(Array.isArray(raw?.decisionAxes)?raw.decisionAxes:[]),...(Array.isArray(raw?.appeals)?raw.appeals:[])];
 return rows.flatMap(x=>Array.isArray(x?.attributeRefs)?x.attributeRefs:[]).filter(Number.isInteger);
}
function detectRefBase(raw,attributeCount){
 const refs=collectRawRefs(raw);
 if(!refs.length||attributeCount<=0)return 'zero';
 const hasZero=refs.includes(0),hasCount=refs.includes(attributeCount);
 if(hasZero&&hasCount)return 'mixed';
 if(hasCount&&!hasZero)return 'one';
 return 'zero';
}
function validateUnderstanding(raw,item={}){
 const reasons=[],p=raw?.productType&&typeof raw.productType==='object'?raw.productType:{};const specific=compact(p.specific),general=compact(p.general),typeQuote=displayCompact(p.quote);
 const identityValid=Boolean(identityNameSafe(specific)&&identityNameSafe(general)&&identityEvidenceSafe(typeQuote)&&sourceContainsExact(item,typeQuote));
 if(!identityValid)reasons.push('invalid_product_identity');
 const rawAttrs=Array.isArray(raw?.attributes)?raw.attributes.slice(0,12):[];const attrRows=rawAttrs.map((x,i)=>normalizedAttribute(x,i,item));for(const row of attrRows)if(!row.valid)reasons.push(row.reason+':'+row.index);
 let attributes=attrRows.filter(x=>x.valid).map(x=>x.attribute);const conflicts=conflictIndexes(attributes);if(conflicts.size){reasons.push('conflicting_attribute_values');attributes=attributes.filter(x=>!conflicts.has(x.sourceIndex));}
 const refBase=detectRefBase(raw,rawAttrs.length);if(refBase==='one')reasons.push('attribute_refs_one_based_repaired');if(refBase==='mixed')reasons.push('attribute_refs_mixed_base');
 const sourceToValidated=new Map(attributes.map((x,i)=>[x.sourceIndex,i]));
 const remapRefs=refs=>{
   if(refBase==='mixed')return [];
   const adjusted=(Array.isArray(refs)?refs:[]).filter(Number.isInteger).map(i=>refBase==='one'?i-1:i);
   return [...new Set(adjusted.filter(i=>sourceToValidated.has(i)).map(i=>sourceToValidated.get(i)))];
 };
 const decisionAxes=(Array.isArray(raw?.decisionAxes)?raw.decisionAxes:[]).slice(0,4).map(x=>({text:compact(x?.text),attributeRefs:remapRefs(x?.attributeRefs)})).filter(x=>x.text&&hasJapaneseText(x.text)&&!PROMO_RE.test(x.text)&&!CLAIM_RE.test(x.text)&&x.attributeRefs.length>0);
 const appeals=(Array.isArray(raw?.appeals)?raw.appeals:[]).slice(0,6).map((x,index)=>{const row={index,text:compact(x?.text),noHassle:compact(x?.noHassle),scene:compact(x?.scene),attributeRefs:remapRefs(x?.attributeRefs),strength:[1,2,3].includes(Number(x?.strength))?Number(x.strength):1};row.languageValid=Boolean(row.text&&hasJapaneseText(row.text));const combined=row.text+' '+row.noHassle+' '+row.scene;row.unsafe=Boolean(PROMO_RE.test(combined)||CLAIM_RE.test(combined));row.needsVerification=appealNeedsVerification(row,attributes);return row;}).filter(x=>x.languageValid&&!x.unsafe&&x.attributeRefs.length>0);
 const hooks=(Array.isArray(raw?.hooks)?raw.hooks:[]).slice(0,5).map(x=>({type:HOOK_TYPES.has(x?.type)?x.type:'scene',text:compact(x?.text)})).filter(x=>readerLayerSafe(x.text,{specific,general}));
 return {valid:identityValid,productType:{specific,general,quote:typeQuote,valid:identityValid},attributes,decisionAxes,appeals,hooks,reasons:[...new Set(reasons)]};
}
const PASS1_SCHEMA={type:'object',additionalProperties:false,required:['productType','attributes','decisionAxes','appeals','hooks'],properties:{productType:{type:'object',additionalProperties:false,required:['specific','general','quote'],properties:{specific:{type:'string',maxLength:48},general:{type:'string',maxLength:48},quote:{type:'string',maxLength:120}}},attributes:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['name','value','unit','qualifier','valueType','quote'],properties:{name:{type:'string',maxLength:48},value:{type:'string',maxLength:96},unit:{type:'string',maxLength:24},qualifier:{type:'string',maxLength:64},valueType:{type:'string',enum:[...VALUE_TYPES]},quote:{type:'string',maxLength:180}}}},decisionAxes:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['text','attributeRefs'],properties:{text:{type:'string',maxLength:80},attributeRefs:{type:'array',maxItems:6,items:{type:'integer',minimum:0,maximum:11}}}}},appeals:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['text','noHassle','scene','attributeRefs','strength'],properties:{text:{type:'string',maxLength:120},noHassle:{type:'string',maxLength:100},scene:{type:'string',maxLength:100},attributeRefs:{type:'array',maxItems:6,items:{type:'integer',minimum:0,maximum:11}},strength:{type:'integer',minimum:1,maximum:3}}}},hooks:{type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['type','text'],properties:{type:{type:'string',enum:[...HOOK_TYPES]},text:{type:'string',maxLength:90}}}}}};
const PASS1_SYSTEM_PROMPT=`出力は簡潔に。attributesは購入判断に重要な最大3件、decisionAxesは1件、appealsは最も強い購入価値1件、hooksは2件に絞る。attributeRefsは必ずattributes配列の0始まりインデックスを使い、先頭属性は0、2番目は1、3番目は2とする。1始まりは禁止。引用は意味と条件を保った短い連続部分にする。noHassleとsceneは重複するなら空文字にする。hooksは仕様値・性能断定・商品種別名を含めず、読み手の場面や迷いだけを書く。hooksに健康・安全・美容効果・安心・疲労軽減・衛生・人気・ランキング・価格優位などの未検証価値を入れない。あなたは楽天商品の商品判別と購買価値理解を行うエンジンです。商品固有の辞書や例外ルールではなく、商品名と説明文全体の意味から「これは何の商品か」を最初に正しく判別してください。JSONだけを返してください。productType.specificは、販促語や仕様を除いた自然で具体的な商品種別をあなた自身の意味理解で付けて構いません。原文と完全一致する必要はありません。generalはその上位カテゴリです。ただしspecific/generalに容量、寸法、重量、電力、温度、数量、メニュー数、性能形容詞、ランキング、販促語を混ぜないでください。productType.quoteは、その商品判別の根拠になる原文の短い連続引用を必ず入れてください。quote自体は文字・記号を変えず原文と完全一致させてください。attributesは商品種別と分離し、購入判断に意味のある仕様だけを抽出してください。各quoteは文字・記号を変えず原文の連続引用、valueはquote内の文字列そのものにしてください。「最大」「約」「〜時」「〜を除く」など条件を落とさないでください。decisionAxesは、その商品を買う人が比較・確認したい観点で、必ずattributeRefsを1件以上付けてください。appealsは、確認済み仕様が購入者の生活でどんな価値につながり得るかを考えてください。ただし事実・性能・効果を原文以上に断定せず、必ず根拠attributeRefsを付けてください。根拠から一段推論する場合は断定ではなく「〜しやすそう」「〜を重視する人の判断材料」のように推論だと分かる表現にしてください。sceneやnoHassleにも、attributesで支えられない健康・安全・美容効果・疲労軽減・衛生・快適性などを足さないでください。hooksは読み手が自分事化しやすい悩み・場面・選び方の迷いを自然な日本語で作ってください。医療・安全・美容効果、体験談、売上、人気、ランキングの捏造は禁止です。最優先順位は 1.正しい商品判別 2.事実の正確さ 3.購入価値の理解 4.自然で刺さる表現 です。`;
module.exports={PASS1_SCHEMA,PASS1_SYSTEM_PROMPT,displayCompact,normalize,sourceContains,sourceContainsExact,readerLayerSafe,appealNeedsVerification,detectRefBase,validateUnderstanding};
