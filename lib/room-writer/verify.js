'use strict';
// S2: deterministic vetoes. A valid ID/token match is NEVER semantic approval.
const factSafety=require('../../public/fact-safety');
const {schema}=require('./writer');
const HIGH_RISK=/(?:防水|耐水|耐火|耐衝撃|安全|安心|消臭|防臭|抗菌|殺菌|除菌|医療|治療|改善|予防|防止|無害|無毒|保証|疲労|健康|快眠|アレルギー|リフトアップ|痩せる|赤ちゃんにも安全)/g;
const QUANT=/\d+(?:[.,]\d+)?\s*(?:mAh|Wh|kg|cm|mm|ml|mL|L|W|V|枚|本|個|点|組|%|％|℃|円|回|時間|分)?/g;
const UNIT=/(?:mAh|Wh|kg|cm|mm|ml|mL|L|W|V|枚|本|個|点|組|%|％|℃|円|時間|分)/;
const NEGATION=/(?:ない|なし|ではない|不可|非対応|未対応|別売|のみ|だけ|場合|限定|対象|最大|約|以内|以下|以上)/g;
const CONDITIONAL=/(?:なら|場合|とき|方に|したい|選びたい|向け|検討するなら|用途なら|使うなら)/;
const DEFINITE_BENEFIT=/(?:必ず|絶対|確実|解決します|改善します|予防できます|防げます|保証します|効果があります)/;
const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function valid(value,def){
 if(def.anyOf)return def.anyOf.some(x=>valid(value,x));
 if(def.enum)return def.enum.includes(value);
 if(def.type==='null')return value===null;
 if(def.type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value)&&def.required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>def.properties[k]&&valid(value[k],def.properties[k]));
 if(def.type==='array')return Array.isArray(value)&&value.length>=(def.minItems||0)&&value.length<=(def.maxItems??Infinity)&&value.every(x=>valid(x,def.items));
 if(def.type==='string')return typeof value==='string';
 if(def.type==='boolean')return typeof value==='boolean';
 return false;
}
function longestCommon(a,b){
 let row=new Uint16Array(b.length+1),best=0;
 for(let i=1;i<=a.length;i++){const next=new Uint16Array(b.length+1);for(let j=1;j<=b.length;j++)if(a[i-1]===b[j-1]){next[j]=row[j-1]+1;best=Math.max(best,next[j]);}row=next;}
 return best;
}
function verify(pack,draft){
 const failures=[],add=(rule,index=-1,text='')=>failures.push({rule,index,text});
 if(!pack||!Array.isArray(pack.facts)||!valid(draft,schema))return {ok:false,status:'rejected',publication:false,copyable:false,semanticApproved:false,failures:[{rule:'V1_structure',index:-1,text:''}]};
 const map=new Map(pack.facts.map(f=>[f.id,f])),source=pack.facts.map(f=>f.text).join(' ');
 if(draft.hold.active){if(draft.post!==null||!draft.hold.reason.trim())add('V1_hold_structure');return {ok:false,status:'held',publication:false,copyable:false,semanticApproved:false,failures:failures.length?failures:[{rule:'hold',index:-1,text:draft.hold.reason}]};}
 if(!draft.product.confident||!draft.product.type.trim()||draft.post===null||draft.hold.reason.trim())add('V1_product_or_post');
 const post=draft.post;
 if(!post)return {ok:false,status:'rejected',publication:false,copyable:false,semanticApproved:false,failures};
 const claims=[post.hook,...post.body];
 for(const [i,c] of claims.entries()){
   const exactFacts=c.basis.map(id=>map.get(id));
   if(!c.text.trim()||!c.basis.length||exactFacts.some(x=>!x)||new Set(c.basis).size!==c.basis.length){add('V2_missing_fact_id',i,c.text);continue;}
   const supported=exactFacts.map(f=>f.text).join(' ');
   const normalizedText=norm(c.text),normalizedEvidence=norm(supported);
   if(c.kind==='F'&&!Array.from(normalizedText).some(ch=>ch.length&&normalizedEvidence.includes(ch)&&/[一-龠ぁ-んァ-ン]/.test(ch)))add('V2_no_source_overlap',i,c.text);
   for(const quantity of [...c.text.matchAll(QUANT)].map(m=>norm(m[0]))){
     if(!quantity||!normalizedEvidence.includes(quantity))add('V3_number_unit_unsupported',i,c.text);
   }
   for(const term of new Set([...supported.matchAll(NEGATION)].map(m=>m[0]))){
     // Negation/qualifiers are mandatory when the sentence asserts a claim
     // about their exact grounded clause; conservative veto if missing.
     if(c.kind==='F'&&!c.text.includes(term))add('V4_qualifier_lost',i,c.text);
   }
   if(factSafety.PROMO_RE.test(c.text)||factSafety.CLAIM_RE.test(c.text)||factSafety.unsupportedBenefitTerms(c.text,{itemName:source,itemCaption:source}).length) add('V5_unsafe_expression',i,c.text);
   if(c.kind==='S'&&(/\d/.test(c.text)||!CONDITIONAL.test(c.text)||DEFINITE_BENEFIT.test(c.text)))add('V6_scene_not_conditional',i,c.text);
   for(const phrase of new Set([...c.text.matchAll(HIGH_RISK)].map(m=>m[0]))){
     if(!source.includes(phrase))add('V7_risk_term_absent',i,c.text);
   }
   if(c.text.length>=10&&longestCommon(norm(c.text),normalizedEvidence)/norm(c.text).length>0.60)add('V8_source_copy_excess',i,c.text);
   if(c.text.length>60)add('V10_sentence_too_long',i,c.text);
 }
 const pb=[...draft.product.basis];
 if(!pb.length||pb.some(id=>!map.has(id)))add('V2_product_fact_missing');
 if(!norm(claims[0]?.text).includes(norm(draft.product.type)))add('V9_product_not_in_hook',0,claims[0]?.text);
 const len=claims.reduce((n,c)=>n+c.text.length,0);
 if(len<120||len>220)add('V10_post_length');
 const fullText=claims.map(x=>x.text).join('\n');
 if(!source.includes(draft.product.type))add('V2_type_not_in_source');
 // Publication requires a distinct semantic review of ownership,
 // scope/negation/degree and the naturalness/purchase-reason axes.
 return {ok:failures.length===0,status:failures.length?'rejected':'needs_semantic_review',failures,
   publication:false,copyable:false,text:fullText,semanticApproved:false};
}
module.exports={verify,valid,longestCommon};
