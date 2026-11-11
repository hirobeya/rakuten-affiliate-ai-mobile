'use strict';
const {hash,intact}=require('./source');
const {valid,schema}=require('./contract');
const DISCLOSURE='※アフィリエイト広告を利用しています';
const norm=s=>String(s).normalize('NFKC').replace(/\s+/g,'').replace(/(\d),(?=\d{3})/g,'$1');
const QUANTITY=/\d+(?:,\d{3})*(?:\.\d+)?(?:[〜～~-]\d+(?:\.\d+)?)?\s*(?:mAh|Wh|kg|cm|mm|mL|ml|℃|°C|GB|TB|L|W|V|枚|本|個|点|組|セット|%|％|円|回|時間|分|年|月|日)?/g;
const QUALIFIER=/(?:ではない|非対応|未対応|別売|のみ|だけ|不可|限定|最大|最小|約|以内|以下|以上|前後|程度|なし|ない)/g;
const DIMENSION=/(約\s*)?(\d+(?:\.\d+)?)\s*(cm|mm|m)?\s*[×xX＊*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|m)/g;
function dimensions(text){
 return [...String(text).matchAll(DIMENSION)].map(m=>({
  raw:m[0],approx:!!m[1],first:Number(m[2]),second:Number(m[4]),
  firstUnit:m[3]||m[5],secondUnit:m[5]
 }));
}
function sameDimension(a,b){
 return a.approx===b.approx&&a.first===b.first&&a.second===b.second&&a.firstUnit===b.firstUnit&&a.secondUnit===b.secondUnit;
}
function withoutDimensions(text){return String(text).replace(DIMENSION,' ');}

const DATE=/\d{4}年\d{1,2}月(?:\d{1,2}日)?時点/g;
const RISK=/(?:防水|耐水|耐火|耐衝撃|消臭|防臭|抗菌|殺菌|除菌|治療|改善|予防|安全|安心|無毒|保証|快眠|痩せる)/g;
const ABSOLUTE=/(?:必ず|絶対|確実|完全|解消|信頼の証|効果抜群|誰でも|どんな.*でも)/;
const SCENE=/(?:なら|場合|とき|したい|選びたい|検討する|向け)/;
const segmenter=new Intl.Segmenter('ja',{granularity:'word'});
const STOP=new Set(['です','ます','こと','もの','ため','これ','それ','商品','使う','できる','あり','なし','よう','など']);
function words(s){return [...segmenter.segment(s)].filter(x=>x.isWordLike&&(x.segment.length>1||/\p{Script=Han}/u.test(x.segment))&&!STOP.has(x.segment)).map(x=>norm(x.segment));}
function occurrences(source,quote){const found=[];for(let at=source.indexOf(quote);at>=0;at=source.indexOf(quote,at+1))found.push(at);return found;}
function context(source,start,length){
 const cuts=/[。！？\n・■]/g;let left=0,right=source.length;
 for(const m of source.matchAll(cuts)){if(m.index<start)left=m.index+1;else if(m.index>=start+length-1){right=m.index+1;break;}}
 return source.slice(left,right);
}
function scopes(source,start,length){
 // Review-only context inspection; the provider receives the untouched source.
 const left=Math.max(source.lastIndexOf('■',start),source.lastIndexOf('\n\n',start),0);
 const next=source.indexOf('■',start+length),block=source.slice(left,next<0?source.length:next),relative=start-left;
 const label=/(?:^|[。・\n>])\s*([\p{L}\p{N}ー_-]{1,24}(?:モデル|タイプ|サイズ|版|型)|[A-Za-z][A-Za-z0-9-]{0,18})\s*[:：]/gu;
 const labels=[...block.matchAll(label)].map(m=>({name:m[1].trim(),at:m.index+m[0].indexOf(m[1]),end:m.index+m[0].length}));
 const preceding=labels.filter(m=>m.at<=relative).at(-1),inside=labels.filter(m=>m.at>relative&&m.at<relative+length);
 if(preceding||inside.length)return [...new Set([...(preceding?[preceding.name]:[]),...inside.map(x=>x.name)])];
 // Prose ownership, e.g. "Bモデルの…"; multiple owners remain unresolved.
 const owners=[...block.matchAll(/([\p{L}\p{N}ー-]{1,24}(?:モデル|タイプ|サイズ|版|型))の/gu)].map(m=>m[1]);
 return [...new Set(owners)];
}
function related(text,candidates){
 const tokens=words(text),rows=candidates.flatMap(x=>x.split(/[。！？\n・]/)).filter(Boolean).map(s=>({s,score:tokens.reduce((n,t)=>n+(norm(s).includes(t)?t.length:0),0)}));
 return [...new Set(rows.filter(r=>r.score>0).map(r=>r.s))];
}
function inventory(draft){
 if(!draft?.post)return [];
 return ['sentences','notes','tags'].flatMap(group=>draft.post[group].map((claim,i)=>({id:`post.${group}.${i}`,group,...claim})));
}
function render(draft){
 if(!draft?.post)return '';
 return [...draft.post.sentences.map(c=>c.text),...draft.post.notes.map(c=>c.text),...(draft.post.tags.length?[draft.post.tags.map(c=>c.text).join(' ')]:[]),'',DISCLOSURE].join('\n');
}
function inspect(envelope,draft){
 const failures=[],unresolved=[],add=(rule,id,detail='')=>failures.push({rule,id,detail});
 if(!intact(envelope)||!valid(draft,schema))return {ok:false,status:'rejected',publication:false,copyable:false,semanticApproved:false,failures:[{rule:'structure_or_source_invalid'}],unresolved:[]};
 if(draft.hold.active){if(draft.post!==null||!draft.hold.reason.trim())add('hold_structure','hold');return {ok:false,status:failures.length?'rejected':'held',publication:false,copyable:false,semanticApproved:false,failures,unresolved};}
 if(!draft.post||draft.hold.reason.trim()||!draft.product.name.trim()){add('product_or_post_missing','product');return {ok:false,status:'rejected',publication:false,copyable:false,semanticApproved:false,failures,unresolved};}
 const source=envelope.source;
 function evidence(basis,id){
  const rows=[];
  for(const b of basis){
   const field=source[b.field],found=occurrences(field,b.quote);
   if(!b.quote.trim()||!found.length){add('invented_quote',id,b.field);continue;}
   if(found.length!==1)unresolved.push({id,reason:'ambiguous_quote_location'});
   for(const at of found)rows.push({quote:b.quote,context:context(field,at,b.quote.length),scopes:scopes(field,at,b.quote.length)});
  }
  return rows;
 }
 const productEvidence=evidence(draft.product.basis,'product');
 if(!productEvidence.some(r=>norm(r.quote).includes(norm(draft.product.name))))add('selling_product_not_in_evidence','product.name');
 if(draft.product.unit!==null){
  const unit=norm(draft.product.unit),quantities=productEvidence.flatMap(r=>[...r.quote.matchAll(QUANTITY)].map(m=>norm(m[0])));
  if(!unit||!productEvidence.some(r=>norm(r.quote).includes(unit))||/^\d/.test(unit)&&!quantities.includes(unit))add('selling_unit_not_established','product.unit');
 }
 const claims=inventory(draft);
 for(const c of claims){
  if(!c.text.trim()){add('empty_display_text',c.id);continue;}
  if(/[<>]/.test(c.text))add('display_markup_forbidden',c.id);
  if(c.group==='tags'&&(!/^#[^\s#]{1,35}$/.test(c.text)||c.kind!=='fact'))add('tag_format_or_kind',c.id);
  const rows=evidence(c.basis,c.id),support=rows.map(r=>r.quote).join('\n');
  const scopeNames=[...new Set(rows.flatMap(r=>r.scopes))];
  let focus=c.text.replace(/^#/,'');for(const name of [...scopeNames,...(c.scope?[c.scope]:[])])focus=focus.split(name).join('');
  const relevant=related(focus,rows.flatMap(r=>[r.quote,r.context]));
  if(!relevant.length)unresolved.push({id:c.id,reason:'no_mechanical_relation_established'});
  if(scopeNames.length>1)unresolved.push({id:c.id,reason:'mixed_scope_evidence'});
  if(c.scope!==null&&(!c.scope.trim()||!Object.values(source).some(s=>typeof s==='string'&&s.includes(c.scope))))add('scope_not_in_source',c.id);
  for(const name of scopeNames)if(!c.text.includes(name))add('model_scope_not_explicit',c.id,name);
  if(c.scope!==null&&!c.text.includes(c.scope))add('declared_scope_missing_from_text',c.id,c.scope);
  const normalizedEvidence=norm(support);
  const supportedDimensions=dimensions(support),claimedDimensions=dimensions(c.text);
  for(const d of claimedDimensions)if(!supportedDimensions.some(s=>sameDimension(d,s)))add('number_or_unit_not_supported',c.id,d.raw);
  const evidenceWithoutDimensions=withoutDimensions(support);
  const claimWithoutDimensions=withoutDimensions(c.text);
  const numbers=[...evidenceWithoutDimensions.matchAll(QUANTITY)].map(m=>norm(m[0]));
  for(const m of claimWithoutDimensions.matchAll(QUANTITY))if(!numbers.includes(norm(m[0])))add('number_or_unit_not_supported',c.id,m[0]);
  for(const clause of relevant){
   for(const q of new Set([...clause.replace(/だけ(?:で|では)なく/g,'').matchAll(QUALIFIER)].map(m=>m[0])))if(!c.text.includes(q)){
    const numericQualifier=/^(?:最大|最小|約|以内|以下|以上|前後|程度)$/.test(q);
    const assertedNumbers=[...c.text.matchAll(QUANTITY)].map(m=>norm(m[0]));
    const numericalRelation=assertedNumbers.some(n=>[...clause.matchAll(QUANTITY)].some(m=>norm(m[0])===n));
    if(numericQualifier&&!numericalRelation)unresolved.push({id:c.id,reason:'qualifier_relation_requires_semantic_review',qualifier:q});
    else add('related_qualifier_lost',c.id,q);
   }
   for(const m of clause.matchAll(DATE))if(!norm(c.text).includes(norm(m[0])))add('as_of_date_lost',c.id,m[0]);
   if(/にく[いく]|抑え|軽減|サポート|目安|可能性/.test(clause)&&/防(?:ぎ|ぐ|止)|完全|必ず|絶対|確実|解消|保証/.test(c.text))add('degree_strengthened',c.id);
   if(/親指|人差し指|中指|薬指|小指/.test(clause)&&/指先|全ての指|すべての指/.test(c.text)&&!/指先|全ての指|すべての指/.test(clause))add('part_scope_broadened',c.id);
   if(/別売|非対応|未対応|専用|のみ|限定/.test(clause)&&/すべて|全て|どの|全モデル|共通/.test(c.text))add('limited_scope_generalized',c.id);
  }
  if(ABSOLUTE.test(c.text))add('unsupported_assertion_or_promotion',c.id);
  for(const m of c.text.matchAll(RISK))if(!normalizedEvidence.includes(norm(m[0])))add('risk_term_not_supported',c.id,m[0]);
  if(c.kind==='scene'&&(!SCENE.test(c.text)||/\d/.test(c.text)||/防(?:ぎ|ぐ)|保証|効果|解消/.test(c.text)))add('scene_not_conditional_or_claims_result',c.id);
  if(/(?:使ってみ|使いました|愛用して|私も使|買ってよかった)/.test(c.text))add('invented_experience',c.id);
  // Exact quotes and word overlap do not settle ownership, causality or appeal.
  unresolved.push({id:c.id,reason:'independent_semantic_review_required'});
 }
 const text=render(draft);
 if([...text].length>500)add('display_over_500_characters','post');
 if(draft.post.sentences.length<2)unresolved.push({id:'post',reason:'explanation_may_be_insufficient'});
 return {ok:failures.length===0,status:failures.length?'rejected':'needs_independent_review',publication:false,copyable:false,semanticApproved:false,
  failures,unresolved,text,characterCount:[...text].length,sourceHash:envelope.sourceHash,draftHash:hash(draft),displayHash:hash(text),
  coverage:['product.name','product.unit',...claims.map(c=>c.id)]};
}
function reviewPacket(envelope,draft){const mechanical=inspect(envelope,draft);return {source:envelope.source,sourceHash:envelope.sourceHash,draft,draftHash:hash(draft),displayText:mechanical.text||'',displayHash:mechanical.displayHash||null,coverage:mechanical.coverage||[],mechanical,
 axes:['understanding','specificity','choice','audience_value','naturalness','grounded'],relationships:['selling_product','selling_unit','model_scope','accessories','numbers_units','qualifiers_date','degree_negation','scene_reason']};}
async function review(envelope,draft,reviewer){
 const packet=reviewPacket(envelope,draft);
 if(!packet.mechanical.ok)return packet.mechanical;
 if(!reviewer||reviewer.kind!=='human'||typeof reviewer.id!=='string'||!reviewer.id.trim()||typeof reviewer.evaluate!=='function')return packet.mechanical;
 let receipt;try{receipt=await reviewer.evaluate(packet);}catch{return {...packet.mechanical,status:'review_unavailable'};}
 const covers=Array.isArray(receipt?.coverage)&&packet.coverage.length===receipt.coverage.length&&new Set(receipt.coverage).size===packet.coverage.length&&packet.coverage.every(x=>receipt.coverage.includes(x));
 const approved=receipt?.sourceHash===packet.sourceHash&&receipt?.draftHash===packet.draftHash&&receipt?.displayHash===packet.displayHash&&covers
  &&packet.axes.every(k=>receipt.axes?.[k]===true)&&packet.relationships.every(k=>receipt.relationships?.[k]===true)
  &&typeof receipt.reason==='string'&&receipt.reason.trim().length>0&&receipt.reviewerId===reviewer.id;
 return {...packet.mechanical,status:approved?'independently_reviewed_candidate':'independent_review_hold',semanticApproved:!!approved,publication:false,copyable:false,
  reviewerId:reviewer.id,receipt:receipt||null};
}
module.exports={DISCLOSURE,norm,scopes,related,inventory,render,inspect,reviewPacket,review};
