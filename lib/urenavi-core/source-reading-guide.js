'use strict';
// Untrusted, exact-span reading guide. This layer NEVER validates product
// ownership or claims and never enables publication. Full original sources
// remain available to the writer and independent semantic reviewer.
const FIELDS=['itemName','itemCaption','catchcopy'];
const PROMO=/(?:クーポン|楽天.*[1１]位|送料無料|ランキング|お買い物マラソン|ポイント\d+倍|レビュー|お客様の声|弊社|当店|販売店|他の商品|関連商品)/;
const SCOPE=/(?:別売|付属|関連商品|他のサイズ|他のカラー|モデル|タイプ|対象外|非対応|未対応|のみ|一部|約|最大|からお選び)/;
const USE=/(?:洗(?:え|う)|使(?:え|う)|入れ(?:られ|る)|収納|掛け(?:られ|る)|設置|開(?:け|く)|上げ(?:る|て)|選(?:べ|ぶ)|調整|保温|調節|接続|対応|防(?:ぐ|ぎ|止)|抑(?:え|制)|包(?:み|む)|外(?:せ|す)|巻(?:い|く)|持(?:て|ち)|取り出(?:せ|す))/;
const RELATION=/(?:ので|ことで|ため|に合わせ|に応じ|により|によって|すると|すれば|したら|と、|際に|とき|時に|できる|できます|可能)/;
function segments(raw,field){
 const src=String(raw||''),out=[];
 // Split only on original characters. Never edit source text/normalize offsets.
 const re=/[^。！？!\n\r]+[。！？!]?/g;let m;
 while((m=re.exec(src))){
  const part=m[0],l=part.search(/\S/);
  if(l<0)continue;
  const text=part.slice(l).trimEnd(),start=m.index+l;
  if(text.length<12||text.length>400)continue;
  out.push({field,start,end:start+text.length,text});
  if(out.length>=120)break;
 }
 return out;
}
function build(item={},limit=6){
 if(!Number.isSafeInteger(limit)||limit<1||limit>10)throw Error('invalid_reading_guide_limit');
 const candidates=FIELDS.flatMap(field=>segments(item[field],field));
 // A hint is a navigational pointer; "interesting" is not "supported".
 const ranked=candidates.map(c=>{
  let score=0;
  if(USE.test(c.text))score+=4;
  if(RELATION.test(c.text))score+=3;
  if(SCOPE.test(c.text))score+=2;
  if(PROMO.test(c.text))score-=8;
  if(c.text.length>230)score-=3;
  if(c.field==='itemName')score+=1;
  return {...c,score};
 }).filter(c=>c.score>0)
   .sort((a,b)=>b.score-a.score||FIELDS.indexOf(a.field)-FIELDS.indexOf(b.field)||a.start-b.start);
 const seen=new Set(),selected=[];
 for(const r of ranked){
  const key=r.text.replace(/\s+/g,'');
  if(seen.has(key))continue;
  seen.add(key);
  selected.push({field:r.field,start:r.start,end:r.end,text:r.text,attention:r.score});
  if(selected.length>=limit)break;
 }
 return {
  status:'reading_hints_only_not_verified',
  notice:'These verbatim passages are reading aids. They are not proof of ownership, product applicability, benefits, or writing permission. Check ALL original fields before any claim.',
  passages:selected
 };
}
function validate(item,guide){
 if(guide?.status!=='reading_hints_only_not_verified'||!Array.isArray(guide.passages))return false;
 return guide.passages.every(p=>FIELDS.includes(p.field)&&Number.isSafeInteger(p.start)&&Number.isSafeInteger(p.end)&&p.start>=0&&p.end>p.start&&String(item[p.field]||'').slice(p.start,p.end)===p.text);
}
module.exports={FIELDS,segments,build,validate};
