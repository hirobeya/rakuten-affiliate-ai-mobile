'use strict';
// Extractive only: retained text is a quote from the corresponding input field.
// No semantic classification, benefit inference, hallucinated attributes or model calls.
const FIELD_NAMES=['itemName','itemCaption','catchcopy'];
// A fact may be longer than 180 characters: the S1 contract limits the
// entire input pack to 1,500 characters, not each source clause. Preserve
// exact long clauses (including conditions) rather than silently discarding.
const MAX_FACTS=40,MAX_CHARS=1500,MAX_FACT_LENGTH=MAX_CHARS;
const KEEP=/(?:約|最大|最小|別売|のみ|だけ|場合|条件|除く|除外|非対応|未対応|不可|ではない|ません|ない|まで|以上|以下|限定|対象|対応機種|±|[〜～~]|※)/g;
const EXCLUDE=/(?:広告文責|薬事法に基づく表記|検索用キーワード|検索ワード|関連商品一覧|この商品を見た人|配送について|発送について|送料について|お届けについて|返品について|交換について|更新履歴|更新情報|リニューアル履歴|クーポンコード|レビュー投稿で|ランキング第\d+位)/;
const DELIM=/[。！？!?\n\r●■◆★☆]+/;
function normalized(v){return String(v||'').replace(/[\u0000-\u001f]/g,' ').replace(/[ \u3000]+/g,' ').trim();}
function isExcluded(raw){
 const s=normalized(raw);
 return !s||EXCLUDE.test(s)||/^(?:関連商品|配送|送料|発送|広告文責|販売元|検索用|更新履歴|免責事項)\s*[:：]/.test(s)
  || /(?:送料無料|今すぐ購入|クーポン獲得|ポイント\d+倍|当店限定セール)/.test(s);
}
function splitField(raw,field){
 const source=String(raw||'');
 const parts=[];
 // Title often has no full stop; preserve its exact source expressions.
 const splitter=field==='itemName'?/[。！？!?\n\r●■◆★☆|｜]+/:DELIM;
 for(const chunk of source.split(splitter)){
   const text=normalized(chunk);
   if(!text||text.length>MAX_FACT_LENGTH||isExcluded(text))continue;
   // We do not split at commas, parentheses, "約", "別売" or qualifying text.
   parts.push(text);
 }
 return parts;
}
function pack(item={}){
 if(!item||typeof item!=='object'||!FIELD_NAMES.every(k=>typeof item[k]==='string'))throw Error('room_writer_invalid_source');
 const facts=[],seen=new Set(),usage={chars:0};
 const omitted={excluded:0,overlong:0,capacity:0};
 // Prefer caption propositions over search-engine-stuffed titles.
 for(const field of ['itemCaption','catchcopy','itemName']){
   const chunks=String(item[field]).split(field==='itemName'?/[。！？!?\n\r●■◆★☆|｜]+/:DELIM);
   for(const raw of chunks){
     const text=normalized(raw);
     if(!text)continue;
     if(isExcluded(text)){omitted.excluded++;continue;}
     if(text.length>MAX_FACT_LENGTH){omitted.overlong++;continue;}
     if(seen.has(text))continue;
     if(facts.length>=MAX_FACTS||usage.chars+text.length>MAX_CHARS){omitted.capacity++;continue;}
     if(!String(item[field]).includes(text)){omitted.excluded++;continue;}
     seen.add(text);
     const keep=[...new Set([...text.matchAll(KEEP)].map(m=>m[0]))];
     facts.push({id:'f'+String(facts.length+1).padStart(2,'0'),field,text,
       numbers:[...new Set([...text.matchAll(/\d+(?:[.,]\d+)?\s*(?:mAh|Wh|kg|cm|mm|ml|mL|L|W|V|枚|本|個|点|組|%|％|℃|円|[〜～~]\d+)?/g)].map(m=>m[0].trim()))],keep});
     usage.chars+=text.length;
   }
 }
 return {version:'room-writer-source-pack-v1',itemCode:String(item.itemCode||''),facts,
   totalChars:usage.chars,limits:{facts:MAX_FACTS,chars:MAX_CHARS},omitted,
   incomplete:omitted.overlong>0||omitted.capacity>0};
}
module.exports={pack,splitField,isExcluded,FIELD_NAMES,MAX_FACTS,MAX_CHARS};
