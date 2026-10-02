'use strict';
// The writer consumes validated meaning, not category-specific hooks or title tokens.
const {sourceContains}=require('./super-urenavi-v3-understanding');
const safety=require('../public/structured-room-copy');
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
const unsupported=/便利|快適|使いやす|時短|ラク|楽になる|手軽|おすすめ|豊富|高品質|高性能|長持ち|ストレス|悩み|解決|暮らしが|毎日が/;
const inspection=/商品名には|明記されています|と確認できます|比較しやすい|判断材料|確認しながら|選ぶ基準|商品情報を確認/;
function groundedAttribute(item,a){
 if(!a||!sourceContains(item,a.quote)) return false;
 const q=clean(a.quote);
 if(/非対応|非防水|未対応|対応しない|対応していません|ではありません|別売|付属しない/.test(q)) return false;
 // A positive substring cut from a negative phrase is not evidence.
 for(const source of [item.itemName,item.itemCaption]){
  const s=clean(source);let pos=s.indexOf(q);
  while(pos>=0){if(/(?:非|未|不)$/.test(s.slice(Math.max(0,pos-2),pos))) return false;pos=s.indexOf(q,pos+q.length);}
 }
 return true;
}
function sentence(x){const s=clean(x);return /[。！？]$/.test(s)?s:s+'。';}
// Semantic drafts are published unchanged after whole-paragraph verification.
// No guessed benefits or unused specifications are added by the renderer.
function composeSemanticDraft(item,v,appeals){
 const blocked=reason=>({status:'blocked',reasons:[reason],text:'',ledger:[]});
 if(!v.valid||!sourceContains(item,v.productType?.quote)) return blocked('identity_not_grounded');
 if(!appeals.length || appeals.length!==(v.appeals||[]).length) return blocked('missing_draft_verification');
 const attrs=v.attributes||[],ledger=[];
 for(const a of appeals){
  const refs=a.attributeRefs||[],combined=clean(a.scene)+' '+clean(a.text);
  if(a.verification?.supported!==true || !refs.length) return blocked('draft_not_verified');
  if(!clean(a.text)||refs.some(i=>!attrs[i]||!groundedAttribute(item,attrs[i]))) return blocked('evidence_not_grounded');
  if(safety.RISK.test(combined)||/疲れにく|疲れない|疲れが取|疲れを取/.test(combined)||inspection.test(combined)) return blocked('prohibited_expression');
  const quotes=refs.map(i=>clean(attrs[i].quote)).join(' ');
  for(const n of combined.normalize('NFKC').match(/\d+(?:\.\d+)?/g)||[]) if(!(quotes.normalize('NFKC').match(/\d+(?:\.\d+)?/g)||[]).includes(n)) return blocked('unsupported_number');
  if(/バイク|ライディング|運転/.test(v.productType.general+' '+v.productType.specific)&&/スマホ|タッチ|ナビ|端末|位置確認/.test(combined)&&(!/停車中/.test(combined)||/走行中|運転中/.test(combined))) return blocked('unsafe_operation');
  ledger.push({role:ledger.length?'supporting_reason':'primary_reason',scene:clean(a.scene),text:clean(a.text),facts:refs.map(i=>({quote:attrs[i].quote,source:sourceContains({itemName:item.itemName},attrs[i].quote)?'itemName':'itemCaption'})),verification:a.verification});
 }
 if(!clean(appeals[0].scene)) return blocked('missing_opening');
 const paragraphs=[sentence(appeals[0].scene),...appeals.map(a=>sentence(a.text))];
 // Product identity and paragraph meaning are checked together by the final verifier.
 if(new Set(paragraphs.map(clean)).size!==paragraphs.length) return blocked('duplicate_paragraph');
 paragraphs.push('※アフィリエイト広告を利用しています');
 const text=paragraphs.join('\n\n');
 if(text.length>500) return blocked('length_overflow');
 return {status:'ready',reasons:[],text,ledger};
}
function composePurchaseCopy({item={},analysis={}}={}){
 const v=analysis.validation||{},attrs=v.attributes||[],reasons=[];
 if(v.semanticDraft) return composeSemanticDraft(item,v,analysis.verifiedAppeals||[]);
 if(!v.valid||!sourceContains(item,v.productType?.specific)) return {status:'blocked',reasons:['identity_not_grounded'],text:'',ledger:[]};
 const viable=(analysis.verifiedAppeals||[]).filter(a=>{
  const refs=a.attributeRefs||[],text=clean(a.text),scene=clean(a.scene);
  if(a.verification?.supported!==true||!refs.length||!text||!scene) return false;
  if(refs.some(i=>!Number.isInteger(i)||!attrs[i]||!groundedAttribute(item,attrs[i]))) return false;
  if(safety.RISK.test(text+' '+scene)||inspection.test(text+' '+scene)) return false;
  if((unsupported.test(text)&&!sourceContains(item,text))||(unsupported.test(scene)&&!sourceContains(item,scene))) return false;
  // Unsupported values cannot enter through a fluent paraphrase.
  const quotes=refs.map(i=>clean(attrs[i].quote)).join(' ');
  for(const n of (text+' '+scene).match(/\d+(?:\.\d+)?/g)||[]) if(!(quotes.match(/\d+(?:\.\d+)?/g)||[]).includes(n)) return false;
  for(const i of refs){const a=attrs[i];if(a.qualifier&&!text.includes(clean(a.qualifier))) return false;}
  if(/バイク|ライディング/.test(item.itemName||'')&&/スマホ|タッチ操作/.test(text+' '+scene)&&!/停車/.test(text+' '+scene)) return false;
  return true;
 }).sort((a,b)=>(b.strength||0)-(a.strength||0));
 if(!viable.length) return {status:'blocked',reasons:['no_verified_purchase_reason'],text:'',ledger:[]};
 const primary=viable[0],used=new Set(primary.attributeRefs),chosen=[primary];
 for(const appeal of viable.slice(1)){
  if(chosen.length>=2) break;
  if(appeal.attributeRefs.some(i=>used.has(i))) continue;
  chosen.push(appeal);appeal.attributeRefs.forEach(i=>used.add(i));
 }
 const ledger=chosen.map(a=>({role:a===primary?'primary_reason':'supporting_reason',scene:a===primary?clean(a.scene):'',text:clean(a.text),facts:a.attributeRefs.map(i=>({quote:attrs[i].quote,source:sourceContains({itemName:item.itemName},attrs[i].quote)?'itemName':'itemCaption'})),verification:a.verification}));
 const body=chosen.map(a=>sentence(a.text)).join('');
 const identity=clean(v.productType.specific);
 const lines=[sentence(primary.scene),'',body.includes(identity)?body:identity+'です。'+body];
 const rendered=chosen.map(a=>a.text).join(' ');
 const extras=attrs.map((a,i)=>({a,i})).filter(({a,i})=>(!used.has(i)||(/\d/.test(a.value)&&!rendered.includes(a.value)))&&groundedAttribute(item,a)&&!safety.RISK.test(a.quote)).filter((x,i,all)=>all.findIndex(y=>y.a.quote===x.a.quote)===i).slice(0,3);
 if(extras.length){lines.push('','特徴👇');for(const {a} of extras) lines.push('✓ '+clean(a.quote));}
 const price=Number(item.itemPrice);if(price>0&&Number.isFinite(price)) lines.push('','価格：'+price.toLocaleString('ja-JP')+'円');
 lines.push('','※アフィリエイト広告を利用しています');
 const text=lines.join('\n');
 if(text.length>500) reasons.push('length_overflow');
 if(clean(primary.scene)===clean(primary.text)) reasons.push('duplicate_scene_and_reason');
 return {status:reasons.length?'review_required':'ready',reasons,text:reasons.length?'':text,ledger};
}
module.exports={composePurchaseCopy};
