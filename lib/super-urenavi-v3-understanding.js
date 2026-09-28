'use strict';

const VALUE_TYPES=new Set(['single','range','options','identifier','text']);
const HOOK_TYPES=new Set(['question','relatable','failure_avoidance','number','scene']);
const PROMO_RE=/(?:ランキング|受賞|1位|最安|激安|限定|クーポン|ポイント\s*\d+倍|送料無料|セール|SALE)/i;
const CLAIM_RE=/(?:治る|改善|予防|防止|安全|安心|無害|保証|発火しない|燃えにくい|難燃|抗菌|除菌|殺菌|消臭|防臭|アレルギー|疲労|痛み|快眠|安眠|健康|小顔|引き締め|リフトアップ|痩せる|若返)/i;
const READER_SPEC_RE=/(?:\d|[０-９]|(?:^|[^A-Za-z])(?:cm|mm|kg|ml|mL|mAh|Hz|GB|TB)(?:$|[^A-Za-z]))/i;
const READER_PERFORMANCE_RE=/(?:高性能|高機能|大容量|強力|速い|高速|軽量|長時間|耐久|防水|撥水|保温|保冷|急速|静音|省エネ)/;
const IDENTITY_SPEC_RE=/(?:\d|[０-９]|(?:cm|mm|kg|g|ml|mL|L|mAh|Ah|W|V|Hz|GB|TB|°C|℃|RPM)|(?:大容量|軽量|高速|急速|強力|長時間|防水|撥水|静音|省エネ|\d+台\d+役|\d+役|\d+メニュー))/i;

function normalize(value=''){
  return String(value??'').normalize('NFKC').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').trim();
}
function compact(value=''){return normalize(value).replace(/\s+/g,' ');}
function sourceParts(item={}){return [compact(item.itemName||''),compact(item.itemCaption||'')].filter(Boolean);}
function sourceContains(item,value){const v=compact(value);return Boolean(v&&sourceParts(item).some(x=>x.includes(v)));}
function hasJapaneseText(value){const s=compact(value);if(!s)return false;const jp=(s.match(/[ぁ-んァ-ヶ一-龠々ー]/g)||[]).length;const asciiWords=s.match(/[A-Za-z]{4,}/g)||[];return jp>0&&asciiWords.length<=1;}
function hasNaturalReaderJapanese(value){const s=compact(value);if(!hasJapaneseText(s))return false;return /[ぁ-んァ-ヶー]/.test(s);}
function readerLayerSafe(text,{specific='',general=''}={}){const s=compact(text);if(!s||s.length>90)return false;if(!hasNaturalReaderJapanese(s))return false;if(READER_SPEC_RE.test(s)||READER_PERFORMANCE_RE.test(s))return false;for(const productName of [specific,general]){const n=compact(productName);if(n&&s.includes(n))return false;}return true;}
function identityNameSafe(value){const s=compact(value);return Boolean(s&&s.length<=48&&!PROMO_RE.test(s)&&!CLAIM_RE.test(s)&&!IDENTITY_SPEC_RE.test(s));}
function integerRefs(refs,max){if(!Array.isArray(refs))return [];return [...new Set(refs.filter(x=>Number.isInteger(x)&&x>=0&&x<max))];}
function normalizedAttribute(raw,index,item){if(!raw||typeof raw!=='object')return {valid:false,index,reason:'attribute_not_object'};const name=compact(raw.name),value=compact(raw.value),unit=compact(raw.unit),qualifier=compact(raw.qualifier),valueType=VALUE_TYPES.has(raw.valueType)?raw.valueType:'text',quote=compact(raw.quote);if(!name||!value||!quote)return {valid:false,index,reason:'attribute_missing_fields'};if(!sourceContains(item,quote))return {valid:false,index,reason:'attribute_quote_not_grounded'};if(!quote.includes(value))return {valid:false,index,reason:'attribute_value_not_in_quote'};if(PROMO_RE.test(name+' '+value+' '+quote)||CLAIM_RE.test(name+' '+value+' '+quote))return {valid:false,index,reason:'attribute_unsafe_claim'};return {valid:true,index,attribute:{name,value,unit,qualifier,valueType,quote,sourceIndex:index}};}
function conflictIndexes(attributes){const groups=new Map();for(const row of attributes){const key=compact(row.name).toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}const bad=new Set();for(const rows of groups.values()){const values=new Set(rows.map(x=>compact(x.value).toLowerCase()));if(values.size>1)for(const row of rows)bad.add(row.sourceIndex);}return bad;}
function appealNeedsVerification(appeal,attributes){if(!appeal||typeof appeal!=='object')return false;const text=compact(appeal.text),noHassle=compact(appeal.noHassle),scene=compact(appeal.scene);if(noHassle||scene)return true;const refs=integerRefs(appeal.attributeRefs,attributes.length);if(!text||!refs.length)return false;const quoted=refs.map(i=>attributes[i]?.quote||'').filter(Boolean);return !quoted.some(q=>compact(q).includes(text));}

function validateUnderstanding(raw,item={}){
  const reasons=[];
  const productType=raw?.productType&&typeof raw.productType==='object'?raw.productType:{};
  const specific=compact(productType.specific),general=compact(productType.general),typeQuote=compact(productType.quote);
  const identityText=[specific,general,typeQuote].join(' ');
  const identityValid=Boolean(specific&&general&&typeQuote&&sourceContains(item,typeQuote)&&typeQuote.includes(specific)&&identityNameSafe(specific)&&identityNameSafe(general)&&!PROMO_RE.test(identityText)&&!CLAIM_RE.test(identityText));
  if(!identityValid)reasons.push('invalid_product_identity');
  const rawAttrs=Array.isArray(raw?.attributes)?raw.attributes.slice(0,12):[];
  const attrRows=rawAttrs.map((x,i)=>normalizedAttribute(x,i,item));for(const row of attrRows){if(!row.valid)reasons.push(row.reason+':'+row.index);}
  let attributes=attrRows.filter(x=>x.valid).map(x=>x.attribute);const conflicts=conflictIndexes(attributes);if(conflicts.size){reasons.push('conflicting_attribute_values');attributes=attributes.filter(x=>!conflicts.has(x.sourceIndex));}
  const sourceToValidated=new Map(attributes.map((x,i)=>[x.sourceIndex,i]));
  const remapRefs=(refs)=>{if(!Array.isArray(refs))return [];const out=[];for(const sourceIndex of refs){if(Number.isInteger(sourceIndex)&&sourceToValidated.has(sourceIndex))out.push(sourceToValidated.get(sourceIndex));}return [...new Set(out)];};
  const decisionAxes=(Array.isArray(raw?.decisionAxes)?raw.decisionAxes:[]).slice(0,4).map(x=>({text:compact(x?.text),attributeRefs:remapRefs(x?.attributeRefs)})).filter(x=>x.text&&hasJapaneseText(x.text));
  const appeals=(Array.isArray(raw?.appeals)?raw.appeals:[]).slice(0,6).map((x,index)=>{const row={index,text:compact(x?.text),noHassle:compact(x?.noHassle),scene:compact(x?.scene),attributeRefs:remapRefs(x?.attributeRefs),strength:[1,2,3].includes(Number(x?.strength))?Number(x.strength):1};row.languageValid=Boolean(row.text&&hasJapaneseText(row.text));row.unsafe=Boolean(PROMO_RE.test(row.text+' '+row.noHassle)||CLAIM_RE.test(row.text+' '+row.noHassle));row.needsVerification=appealNeedsVerification(row,attributes);return row;}).filter(x=>x.languageValid&&!x.unsafe&&x.attributeRefs.length>0);
  const hooks=(Array.isArray(raw?.hooks)?raw.hooks:[]).slice(0,5).map(x=>({type:HOOK_TYPES.has(x?.type)?x.type:'scene',text:compact(x?.text)})).filter(x=>readerLayerSafe(x.text,{specific,general}));
  return {valid:identityValid,productType:{specific,general,quote:typeQuote,valid:identityValid},attributes,decisionAxes,appeals,hooks,reasons:[...new Set(reasons)]};
}

const PASS1_SCHEMA={type:'object',additionalProperties:false,required:['productType','attributes','decisionAxes','appeals','hooks'],properties:{productType:{type:'object',additionalProperties:false,required:['specific','general','quote'],properties:{specific:{type:'string',maxLength:48},general:{type:'string',maxLength:48},quote:{type:'string',maxLength:120}}},attributes:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['name','value','unit','qualifier','valueType','quote'],properties:{name:{type:'string',maxLength:48},value:{type:'string',maxLength:96},unit:{type:'string',maxLength:24},qualifier:{type:'string',maxLength:64},valueType:{type:'string',enum:[...VALUE_TYPES]},quote:{type:'string',maxLength:180}}}},decisionAxes:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['text','attributeRefs'],properties:{text:{type:'string',maxLength:80},attributeRefs:{type:'array',maxItems:6,items:{type:'integer',minimum:0,maximum:11}}}}},appeals:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['text','noHassle','scene','attributeRefs','strength'],properties:{text:{type:'string',maxLength:120},noHassle:{type:'string',maxLength:100},scene:{type:'string',maxLength:100},attributeRefs:{type:'array',maxItems:6,items:{type:'integer',minimum:0,maximum:11}},strength:{type:'integer',minimum:1,maximum:3}}}},hooks:{type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['type','text'],properties:{type:{type:'string',enum:[...HOOK_TYPES]},text:{type:'string',maxLength:90}}}}}};

const PASS1_SYSTEM_PROMPT=`あなたは楽天商品の購買判断を助ける商品理解エンジンです。商品ごとの固有ルールを使わず、入力の商品名と説明文だけを読み、JSONだけを返してください。最重要目的は、読者が「なぜ欲しいか」を理解できる材料を見つけることです。ただし商品についての事実・性能・効果は原文を超えてはいけません。productTypeは商品の種類だけを表します。specificは原文quoteの中に連続して存在する、顧客が自然に呼ぶ最小限の具体的商品名にしてください。generalはspecificより広い一般カテゴリです。specific/generalには容量、寸法、重量、電力、温度、数量、メニュー数、性能形容詞、販促語、ランキング、用途列挙を混ぜないでください。quoteはspecificを含む原文の短い連続引用です。attributesは商品種別とは分離し、意味を持つ仕様として name/value/unit/qualifier/valueType/quote を出してください。quoteは原文の連続引用、valueはquote内の文字列にしてください。「最大」「〜時」「〜を除く」「約」など条件はqualifierに保持してください。複数選択肢はoptionsとして扱い、1つに断定しないでください。decisionAxesはこの商品の購入判断で比較される観点。appealsは購入理由の候補で、必ずattributeRefsを付け、原文だけで直接言えない推論は推論として表現してください。hooksは読み手の悩み・場面・あるあるだけを書き、商品名・数字・単位・性能主張を入れないでください。販促、ランキング、医療・安全・美容の断定、体験談の捏造は禁止。日本語で自然に書いてください。`;
module.exports={PASS1_SCHEMA,PASS1_SYSTEM_PROMPT,normalize,sourceContains,readerLayerSafe,appealNeedsVerification,validateUnderstanding};
