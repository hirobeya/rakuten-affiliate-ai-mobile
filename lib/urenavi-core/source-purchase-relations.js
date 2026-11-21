'use strict';
const {sourcePassages,FOREIGN,SECTION}=require('./source-passages');
const {reviewSourceBenefit}=require('../local-editorial-quality');
const {sellerNarrative,hasUseRelation,catalogueOnly,restatedReason}=require('../../public/purchase-copy-quality');
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
function isClean(quote,identity){
 return quote.length>=8&&quote.length<=180&&!FOREIGN.test(quote)&&!SECTION.test(quote)
  &&!VARIANT.test(quote)&&!DISALLOWED.test(quote)&&!RISK.test(quote)&&!sellerNarrative(quote)
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
function inspect(item,identity,{inputOwner=false}={}){
 const title=String(item.itemName||'').normalize('NFKC');
 const caption=String(item.itemCaption||'');
 if(!identity||!title.includes(identity)||caption.length>6000||RISK.test(identity)||DISALLOWED.test(identity)
   ||/[\n。！、：:]|\s{2,}/u.test(identity)||identity.length>42)return [];
 const identityStart=String(item.itemName).indexOf(identity);
 if(identityStart<0)return [];
 const subject={source:'itemName',quote:identity,start:identityStart,end:identityStart+identity.length,...protectedTerms(identity)};
 const candidates=[];
 const statements=sourcePassages(caption);
 let block=false,scoped=inputOwner,inDescription=false,anchor=[],previous=null,priorOwner=null;
 for(const part of statements){
  const quote=plain(part.quote);
  const p=quote===part.quote?part:{...part,quote,start:part.start+part.quote.indexOf(quote)};
  if(part.kind==='section'){
   const description=quote==='商品説明'||quote==='商品詳細';
   // Require product identity in the leading description or specifications.
   inDescription=!block&&description;
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
  if(VARIANT.test(quote)){
   scoped=false;inDescription=false;previous=null;continue;
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
  if(!isClean(quote,identity)){previous=null;continue;}
  if(quote.startsWith(identity+'は、')||quote.startsWith('この'+identity+'は、')){
   anchor=[span(p)];scoped=true;
  }
  if(!scoped)continue;
  const attribution=anchor;
  const own=quote.startsWith(identity+'は、')?identity.length+2:quote.startsWith('この'+identity+'は、')?identity.length+4:0;
  const body=own?{...p,start:p.start+own,quote:p.quote.slice(own)}:p;
  const explicit=presentRelation(body);
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
 return candidates;
}

function write(candidate){
 const {subject,feature,benefit,scene,target,kind}=candidate;
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
 // Literal causal sentence fallback: no new beneficiary, target, condition,
 // or capability is introduced. The exact source span remains auditable.
 if(kind==='explicit_cause'&&candidate.literal
   &&/(?:ことで|によって|により|ので)[、，]?/u.test(candidate.literal.quote)
   &&/(?:できます|できる|使えます|使える|収納|調整|取り出せ|取り出しやす|洗え|保管|持ち運べ|着脱|取り外せ|設置|充電)/u.test(benefit.quote))
  return subject.quote+'\n'+candidate.literal.quote;
 return null;
}
function scoreAppeal(candidate,body){
 const compact=body.split('\n').slice(1).join('');
 return compact.length>=18&&compact.length<=120
  &&(candidate.kind==='explicit_location'||(candidate.benefit.quote.length>=8&&candidate.feature.quote.length>=5));
}
function composeSourceCopy(item,identity,options={}){
 const candidates=inspect(item,identity,options);
 const {diagnostics}=options;
 if(diagnostics)Object.assign(diagnostics,{drafts:0,reviewRejected:0});
 for(const candidate of candidates){
  const body=write(candidate);
  if(!body||!scoreAppeal(candidate,body))continue;
  if(diagnostics)diagnostics.drafts++;
  if(candidate.action&&sourcePassages(item.itemCaption).some(part=>
   part.start>candidate.benefit.end&&part.quote.includes(candidate.action)&&QUALIFIED_CLAIM.test(part.quote)))continue;
  const covered=[candidate.subject,candidate.feature,candidate.benefit,candidate.scene,candidate.target,...candidate.evidence].filter(Boolean);
  if(covered.some(p=>String(item[p.source]||'').slice(p.start,p.end)!==p.quote))continue;
  const price=Number(item.itemPrice);
  const text=body+(price>0?'\n\n価格：'+price.toLocaleString('ja-JP')+'円':'')+'\n\n※アフィリエイト広告を利用しています';
  if(!RISK.test(text)&&!catalogueOnly(text)&&!restatedReason(text,{identity})&&guardUnsupportedBenefitCopy(item,text)===text)
   return {text,proof:candidate};
  if(diagnostics)diagnostics.reviewRejected++;
 }
 return null;
}

module.exports={inspect,protectedTerms,composeSourceCopy};
