'use strict';
const {sourceDeclaredIdentity}=require('./product-intake');
const {sourcePassages,FOREIGN,SECTION}=require('./source-passages');
const {extractEvidence,verifyEvidence,bindMeasurement}=require('./source-evidence-ledger');
const {reviewSourceBenefit}=require('../local-editorial-quality');
const {sellerNarrative,hasUseRelation,catalogueOnly,restatedReason,verifiedMeasuredSourceCopy}=require('../../public/purchase-copy-quality');
const RISK=/ランキング|受賞|楽天.*1位|送料無料|クーポン|半額|最安|SALE|改善|予防|防止|安全|安心|無害|保証|難燃|抗菌|除菌|殺菌|消臭|防臭|臭わない|アレルギー|疲労|痛み|快眠|安眠|健康|小顔|リフトアップ|痩せ|若返|美白|治療|効果|効能|最強|最高|絶対|必ず/i;
const {guardUnsupportedBenefitCopy}=require('../../public/fact-safety');

const DISALLOWED=/(?:楽天|実際に使|購入しました|完全|どんな|すべて|心配|アレルギー|体調|怪我|衝撃吸収|(?:より|従来)[^。]{0,16}(?:高|向上|優)|[【】<>「」]|https?:|[%％])/iu;
const QUALIFIED_CLAIM=/(?:場合により|場合があります|別途|一部|ご使用前|非対応|使用不可|使用できません)/u;
const VARIANT=/(?:モデル|タイプ|仕様違い|バリエーション|(?:のぞく|を除)|(?:[A-Z]|\d+)サイズ|(?:のみ|限定)(?:対応|仕様))/u;
const NEGATION=/(?:ません|できない|不可|非対応|付属しない|なし|ない)/u;
const TERMS={
 audience:/(?:初心者|子ども|子供|大人|高齢者|左利き|右利き)(?:でも|向け|は|が)/gu,
 condition:/(?:のみ|だけ|場合|とき|時|に限|以上|以下|未満|以内|なくても)/gu,
 degree:/(?:約|最大|最小|およそ|ほど|やすい|にくい|少し|楽に|たっぷり)/gu,
 negation:/(?:なくても|不要|しない|できない|できません|ない|ません|不可)/gu,
 number:/[0-9０-９]+(?:[.．][0-9０-９]+)?(?:\s?(?:mm|cm|ml|kg|mL|g|L|円|時間|分|秒|枚|本|段|個|回|人|℃|度))?/gu
};
const endless=text=>text.replace(/[。！？!?]$/u,'');
const plain=text=>text.replace(/^[ \t　・●]+/u,'').trim();
function protectedTerms(text){
 return Object.fromEntries(Object.entries(TERMS).map(([key,pattern])=>[key,text.match(pattern)||[]]));
}
function span(p,quote=p.quote,offset=p.quote.indexOf(quote)){
 return {source:'itemCaption',quote,start:p.start+offset,end:p.start+offset+quote.length,...protectedTerms(quote)};
}
function isClean(quote,identity,ownVariant=false){
 return quote.length>=8&&quote.length<=180&&!FOREIGN.test(quote)&&!SECTION.test(quote)
  &&(ownVariant||!VARIANT.test(quote))&&!DISALLOWED.test(quote)&&!RISK.test(quote)&&!sellerNarrative(quote)
  &&reviewSourceBenefit({quote,identity}).ok;
}
function attachment(text){
 return /(?:が(?:付いています|あります)|を(?:採用しています|備えています)|(?:式|構造|仕様)です)$/u.test(text);
}
function presentRelation(p){
 const text=endless(p.quote);
 // Parse grammatical roles in explicit causality and applicability. These
 // connectors are shared across product types and never infer a new use.
 const explicit=text.match(/^(?<feature>[^。]{4,60}?)(?:ことで|によって|により|ので)[、，]?(?<benefit>[^。]{4,70})$/u);
 if(explicit&&hasUseRelation(text)){
  return {kind:'explicit_cause',feature:span(p,explicit.groups.feature,0),benefit:span(p,explicit.groups.benefit,text.length-explicit.groups.benefit.length),literal:span(p)};
 }
 const location=text.match(/^(?<scene>[^、。]{2,18})には(?<target>[^。]{4,60}?)(?<degree>もたっぷり|も|を)?(?<action>[\p{Script=Han}]{2})(?:可能|できます)$/u);
 if(location&&/^(?:収納|保管|設置|充電|調整|使用)$/.test(location.groups.action)&&/等|など|、/.test(location.groups.target)){
  const {scene,target,degree,action}=location.groups;
  return {kind:'explicit_location',scene:span(p,scene),target:span(p,target),benefit:span(p,target+(degree||'')+action+(text.endsWith('可能')?'可能':'できます')),action,degree};
 }
 return null;
}
function productNameField(quote){
 const explicit=quote.match(/^(?:【商品名】\s*|商品名(?:[ \t]*[：:][ \t]*|[ \t]+))([^。！？!]{2,42})$/u);
 if(explicit)return explicit[1].trim();
 // A specifications field can name the product even when the catalogue
 // has no category entry. Require the declaration, not a keyword guess.
 return quote.match(/(?:^|\s)品[ \t]+名[ \t]*([A-Z][A-Z0-9-]{1,27})(?=（[^）]*）|\s|$)/u)?.[1]||'';
}
function declaredProductName(item){
 const title=String(item.itemName||'');
 let declared='';
 for(const part of sourcePassages(String(item.itemCaption||''))){
  if(FOREIGN.test(part.quote)||VARIANT.test(part.quote)||/^(?:ご注意|関連キーワード)$/.test(part.quote))break;
  const label=productNameField(part.quote);
  if(!label)continue;
  if(/^[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}A-Z0-9ー-]{2,28}$/u.test(label)
     &&title.split(/\s+/).includes(label)&&(!declared||declared===label)){
   declared=label;
  }else return '';
 }
 return declared;
}
function inspect(item,identity,{inputOwner=false,providerEvidence=false,declared=null}={}){
 const title=String(item.itemName||'').normalize('NFKC');
 const caption=String(item.itemCaption||'');
 const statements=sourcePassages(caption);
 const bound=declared&&sourceDeclaredIdentity(item,statements);
 if(bound?.quote!==identity&&declared)return [];
 if(!identity||(!bound&&!title.includes(identity))||caption.length>6000||RISK.test(identity)||DISALLOWED.test(identity)
   ||/[\n。！、：:]|\s{2,}/u.test(identity)||identity.length>42)return [];
 const identityStart=String(item.itemName).indexOf(identity);
 if(identityStart<0&&!bound)return [];
 const subject=bound?{source:bound.source,quote:bound.quote,start:bound.start,end:bound.end}: {source:'itemName',quote:identity,start:identityStart,end:identityStart+identity.length,...protectedTerms(identity)};
 const candidates=[];
 let block=false,variantScope=false,scoped=inputOwner,inDescription=false,anchor=[],previous=null,priorOwner=null;
 for(const part of statements){
  const quote=plain(part.quote);
  const p=quote===part.quote?part:{...part,quote,start:part.start+part.quote.indexOf(quote)};
  if(bound&&part.start<bound.descriptionStart){
   if(part.start===bound.header.start)priorOwner=span(part);
   continue;
  }
  if(part.kind==='section'){
   const description=quote==='商品説明'||quote==='商品詳細';
   // Require product identity in the leading description or specifications.
   inDescription=!block&&!variantScope&&description;
   scoped=inDescription&&Boolean(priorOwner);
   anchor=scoped?[priorOwner,span(p)]:[];previous=null;
   if(quote==='関連キーワード'||quote==='関連商品')block=true;
   continue;
  }
  if(FOREIGN.test(quote)||/関連キーワード|関連商品|検索用/u.test(quote)){
   block=true;scoped=false;previous=null;continue;
  }
  if(block)continue;
  if(!priorOwner&&part.start<900&&quote.includes(identity)&&!VARIANT.test(quote.slice(0,quote.indexOf(identity))))priorOwner=span(p,identity);
  const restriction=quote.match(VARIANT)?.[0];
  const namedVariant=bound&&restriction==='タイプ'&&bound.header.quote.split(/\s+/)
   .find(term=>term.endsWith(restriction)&&term.length>restriction.length
    &&quote.includes(term)&&title.includes(term.slice(0,-restriction.length)));
  const ownVariant=Boolean(namedVariant&&!VARIANT.test(quote.replace(namedVariant,'')));
  if(restriction&&!ownVariant){
   variantScope=true;scoped=false;inDescription=false;previous=null;continue;
  }
  if(!variantScope&&productNameField(quote)===identity){
   priorOwner=span(p);
   if(inDescription){scoped=true;anchor=[priorOwner];}
   previous=null;
   continue;
  }
  const subjectAt=quote.indexOf(identity);
  // Some listings identify the product immediately after the description
  // heading. A literal product heading is evidence, never a sales claim.
  if(inDescription&&!scoped&&subjectAt>=0&&subjectAt<=24&&quote.length<=50
      &&!sellerNarrative(quote)&&!SECTION.test(quote)
      &&(/^(?:が人気の理由|の特徴|の特長|のおすすめポイント|おすすめポイント)[。！!]?$/.test(quote.slice(subjectAt+identity.length))
       ||(subjectAt>0&&/^[。！!]$/.test(quote.slice(subjectAt+identity.length))&&/可能な|できる/u.test(quote.slice(0,subjectAt))))){
   anchor=[span(p)];
   scoped=true;
   previous=null;
   continue;
  }
  if(!isClean(quote,identity,ownVariant)){previous=null;continue;}
  if(quote.startsWith(identity+'は、')||quote.startsWith('この'+identity+'は、')){
   anchor=[span(p)];scoped=true;
  }
  if(!scoped)continue;
  const attribution=anchor;
  const own=quote.startsWith(identity+'は、')?identity.length+2:quote.startsWith('この'+identity+'は、')?identity.length+4:0;
  const body=own?{...p,start:p.start+own,quote:p.quote.slice(own)}:p;
  const causal=ownVariant&&body.quote.match(/^(?<feature>[^。！？]{5,60})だから[、，](?<benefit>[^。！？]{8,70})[。！？]$/u);
  const explicit=causal?{kind:'declared_use',feature:span(body,causal.groups.feature,0),
   benefit:span(body,causal.groups.benefit),literal:span(body)}:presentRelation(body);
  if(explicit&&!NEGATION.test(quote)){
   candidates.push({...explicit,subject,evidence:[...attribution,span(p)]});
  }
  const follow=body.quote.match(/^(?:これにより|そのため)[、，](?<benefit>.+)$/u);
  if(follow&&previous&&part.group===previous.group&&!NEGATION.test(follow.groups.benefit)&&hasUseRelation(follow.groups.benefit)){
   // No adjacency-only inference. The continuation must explicitly refer to
   // the immediately previous, single attributable feature.
   candidates.push({kind:'explicit_continuation',subject,feature:span(previous,endless(previous.quote)),
    benefit:span(body,endless(follow.groups.benefit),body.quote.length-follow.groups.benefit.length),evidence:[...attribution,span(previous),span(p)]});
  }
  previous=attachment(endless(body.quote))&&!NEGATION.test(quote)?body:null;
 }
 // Multiple explicit claims can disagree even when they are each well
 // formed. Negative statements and variant switches leave multi-line
 // user material unpublishable until the intended scope is clarified.
 if(inputOwner&&statements.some(p=>FOREIGN.test(p.quote)||NEGATION.test(p.quote)))return [];
 if(providerEvidence){
  const ledger=extractEvidence({...item,identity});
  if(!verifyEvidence(item,ledger))return [];
  for(const fact of ledger.facts){
   if(fact.claimType!=='source_purchase_relation'||fact.subjectBinding!=='adjacent_explicit_subject')continue;
   const lead=statements.find(part=>part.start===fact.subjectSpan.start&&part.end===fact.subjectSpan.end);
   const passage=statements.find(part=>part.start===fact.start&&part.end===fact.end);
   if(!lead||!passage||lead.group!==passage.group||caption.slice(lead.end,passage.start).trim())continue;
   if(FOREIGN.test(caption)||VARIANT.test(caption)||QUALIFIED_CLAIM.test(caption)||NEGATION.test(caption))continue;
   if(RISK.test(lead.quote)||sellerNarrative(lead.quote)||!isClean(passage.quote,identity))continue;
   const relation=presentRelation(passage);
   if(relation)candidates.push({...relation,subject,evidence:[span(lead),span(passage)]});
  }
  return candidates.filter(candidate=>candidate.literal&&candidate.literal.quote.length<=64&&
   !FOREIGN.test(caption)&&!VARIANT.test(caption)&&!QUALIFIED_CLAIM.test(caption)&&!NEGATION.test(caption));
 }
 return candidates;
}

function editCausalSentence(candidate){
 const original=candidate.literal.quote;
 const boundary=candidate.benefit.start-candidate.literal.start;
 const lead=original.slice(0,boundary).trimEnd();
 const benefit=original.slice(boundary).trimStart();
 // Keep the affected measurements and all intervening qualifiers. Match
 // only a redundant control noun governing the same physical quantities.
 const editedBenefit=benefit.replace(
  /((?:量|速度|角度|位置|高さ|幅|長さ)(?:や|と)(?:量|速度|角度|位置|高さ|幅|長さ))のコントロールを((?:初心者でも)?(?:簡単に)?調整できます。)$/u,
  '$1を$2'
 );
 const separator=/[、，]$/.test(lead)?'':'、';
 const edited=lead+separator+editedBenefit;
 return JSON.stringify(protectedTerms(edited))===JSON.stringify(protectedTerms(original))?edited:original;
}

function write(candidate){
 const {subject,feature,benefit,scene,target,kind}=candidate;
 if(kind==='declared_use')return subject.quote+'\n'+endless(candidate.literal.quote)+'。';
 if(kind==='explicit_continuation')return subject.quote+'\n'+feature.quote+'。そのため、'+benefit.quote+'。';
 if(kind==='explicit_location'){
  const things=target.quote.replace(/等$/u,'など').replace('、','や');
  return subject.quote+'\n'+scene.quote+'に'+things+(candidate.degree||'を')+candidate.action+'できます。';
 }
 // Convert a genuine function-to-use relation to a readable pair of
 // sentences. Match the quantity and both predicate arguments verbatim.
 const can=feature.quote.match(/^(?<function>.+)ができる$/u);
 const use=benefit.quote.match(/^(?<uses>.+)(?<particle>にも|に)ご利用できます$/u);
 if(can&&use){
  const setting=can.groups.function.match(/^([0-9０-９]+(?:[.．][0-9０-９]+)?(?:℃|度|分|秒|時間|段階))設定$/u);
  const featureText=setting?setting[1]+'に設定':can.groups.function;
  const canText=setting?featureText+'できる':featureText+'ができる';
  return subject.quote+'\n'+canText+'ので、'+use.groups.uses+use.groups.particle+'使えます。';
 }
 // Edit the rendered sentence only; provider verification still compares
 // the exact source span in the proof.
 if(kind==='explicit_cause'&&candidate.literal
   &&/(?:ことで|によって|により|ので)[、，]?/u.test(candidate.literal.quote)
   &&/(?:できます|できる|使えます|使える|収納|調整|取り出せ|取り出しやす|洗え|保管|持ち運べ|着脱|取り外せ|設置|充電)/u.test(benefit.quote))
  return subject.quote+'\n'+editCausalSentence(candidate);
 return null;
}
function scoreAppeal(candidate,body){
 const compact=body.split('\n').slice(1).join('');
 return compact.length>=18&&compact.length<=120
  &&(candidate.kind==='explicit_location'||(candidate.benefit.quote.length>=8&&candidate.feature.quote.length>=5));
}
// Candidates retain source offsets from product recognition through publication.
function preparePurchaseFacts(item,identity,options){
 return inspect(item,identity,options).map(candidate=>{
  if(options.providerEvidence||options.inputOwner||candidate.kind!=='explicit_cause'||!candidate.literal)
   return candidate;
  const measurement=bindMeasurement(item,candidate.feature);
  return measurement?{...candidate,measurement}:candidate;
 });
}

function renderPurchaseFact(item,fact){
 const {measurement,subject,literal}=fact;
 const body=measurement?[subject.quote,literal.quote,
  measurement.notes.map(note=>note.quote).join('')].join('\n'):write(fact);
 if(!body||!scoreAppeal(fact,body))return null;
 const price=Number(item.itemPrice);
 const text=body+(price>0?'\n\n価格：'+price.toLocaleString('ja-JP')+'円':'')+'\n\n※アフィリエイト広告を利用しています';
 return {text,proof:fact};
}

function reviewPurchaseCopy(item,identity,result){
 const {text,proof}=result;
 if(proof.action&&sourcePassages(item.itemCaption).some(part=>
  part.start>proof.benefit.end&&part.quote.includes(proof.action)&&QUALIFIED_CLAIM.test(part.quote)))return false;
 const covered=[proof.subject,proof.feature,proof.benefit,proof.scene,proof.target,...proof.evidence].filter(Boolean);
 if(covered.some(p=>String(item[p.source]||'').slice(p.start,p.end)!==p.quote))return false;
 if(proof.measurement&&!verifiedMeasuredSourceCopy(item,result))return false;
 return !RISK.test(text)&&!catalogueOnly(text)&&!restatedReason(text,{identity})&&guardUnsupportedBenefitCopy(item,text)===text;
}

function composeSourceCopy(item,identity,options={}){
 const {diagnostics}=options;
 if(diagnostics)Object.assign(diagnostics,{drafts:0,reviewRejected:0});
 for(const fact of preparePurchaseFacts(item,identity,options)){
  const result=renderPurchaseFact(item,fact);
  if(!result)continue;
  if(diagnostics)diagnostics.drafts++;
  if(reviewPurchaseCopy(item,identity,result))return result;
  if(diagnostics)diagnostics.reviewRejected++;
 }
 return null;
}

module.exports={declaredProductName,inspect,protectedTerms,composeSourceCopy};
