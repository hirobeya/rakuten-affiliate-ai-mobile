'use strict';

const {authorize,db}=require('../lib/billing');
const {validateAiExtraction}=require('../lib/room-ai');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {analyzeProductV3}=require('../lib/super-urenavi-v3-engine');
const {createV3Groq,DEFAULT_MODEL,nextSafeDelayMs}=require('../lib/super-urenavi-v3-groq');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');
const {logAiUsageMetric}=require('../lib/super-urenavi-v3-metrics');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const {repeatedLiteralIdentity,leadingCompoundIdentity}=require('../lib/repeated-literal-identity');
const {selectLocalIdentity}=require('../lib/local-identity-arbitrator');
const {hasCompetingCompoundIdentity}=require('../lib/local-zero-identity-conflict');
const {composeLocalPartnerCopy,SAFE_SIGNALS}=require('../lib/local-partner-reasoner');
const localTypeData=require('../data/local-product-types.json');
const structured=require('../public/structured-room-copy');
const {guardUnsupportedBenefitCopy}=require('../public/fact-safety');
const {catalogueOnly,restatedReason,verifiedTitleSignal}=require('../public/purchase-copy-quality');
const {isDescriptorIdentity}=require('../lib/local-identity-role-guard');
const {reviewSourceBenefit}=require('../lib/local-editorial-quality');

const DEFAULT_DAILY_LIMIT=200;
const PREVIEW_NAMESPACE='__v3_preview__:';
const EVALUATION_MODELS=new Set(['openai/gpt-oss-120b','openai/gpt-oss-20b']);

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function json(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
}

function namespacedStore(base){
  const keyArgs=x=>({...x,itemCode:PREVIEW_NAMESPACE+String(x?.itemCode||'')});
  const out={
    loadProduct:x=>base.loadProduct(keyArgs(x)),
    saveProduct:x=>base.saveProduct(keyArgs(x))
  };
  if(typeof base.loadTypeKnowledge==='function') out.loadTypeKnowledge=x=>base.loadTypeKnowledge(x);
  if(typeof base.saveTypeKnowledge==='function') out.saveTypeKnowledge=x=>base.saveTypeKnowledge(x);
  if(typeof base.findTypeIdentityInTitle==='function') out.findTypeIdentityInTitle=x=>base.findTypeIdentityInTitle(x);
  return out;
}

async function consumeQuota(stage){
  const limitRaw=Number(process.env.GROQ_ROOM_DAILY_LIMIT||DEFAULT_DAILY_LIMIT);
  const limit=Number.isSafeInteger(limitRaw)&&limitRaw>0?limitRaw:DEFAULT_DAILY_LIMIT;
  const result=await db('rpc/urenavi_consume_ai_daily_limit',{
    method:'POST',
    body:JSON.stringify({p_limit:limit})
  });
  const allowed=result===true || result?.allowed===true;
  console.log('super urenavi v3 quota',JSON.stringify({stage,allowed,limit}));
  return allowed;
}

function accessoryScoped(title,value){
  const t=normalize(title),v=normalize(value);
  const at=t.indexOf(v);
  if(at<0) return true;
  const before=t.slice(Math.max(0,at-10),at);
  const after=t.slice(at+v.length,Math.min(t.length,at+v.length+14));
  return /(?:交換用|替え)\s*$/.test(before)
    || /^\s*(?:用|専用)\s*(?:ケース|カバー|ポーチ|ホルダー|フィルター|アダプター|ケーブル|交換|替え)/.test(after);
}

function sharedTypeSuffixes(){
  const types=(localTypeData.productTypes||[]).map(normalize).filter(Boolean);
  const out=new Set();
  for(let i=0;i<types.length;i++){
    for(let j=i+1;j<types.length;j++){
      const a=[...types[i]],b=[...types[j]];
      let n=0;
      while(n<a.length&&n<b.length&&a[a.length-1-n]===b[b.length-1-n]) n++;
      if(n>=4) out.add(a.slice(a.length-n).join(''));
    }
  }
  return [...out].sort((a,b)=>b.length-a.length);
}

const TYPE_SUFFIXES=sharedTypeSuffixes();

function validateLiteralIdentity(item,value){
  const title=normalize(item?.itemName),identity=normalize(value);
  if(!identity||isDescriptorIdentity(identity)||!title.includes(identity)||accessoryScoped(title,identity)) return null;
  const raw={productType:{value:identity,source:'itemName',evidence:identity},features:[],sellingPoints:[],confidence:'high'};
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:item?.itemCaption||''},{imageAvailable:false});
  if(validation?.productType?.valid!==true||!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation,version:(localTypeData.version||'local-types')+'-literal-source'};
}

function separatedKnownIdentity(item){
  const title=normalize(item?.itemName);
  if(!title) return null;
  const hits=[];
  for(const canonical of (localTypeData.productTypes||[]).map(normalize).filter(Boolean)){
    const chars=[...canonical];
    if(chars.length<4) continue;
    const escaped=chars.map(ch=>ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const re=new RegExp(escaped.join('\\s*'),'g');
    let match;
    while((match=re.exec(title))){
      const source=normalize(match[0]);
      if(!/\s/.test(source)) break;
      const validated=validateLiteralIdentity(item,source);
      if(validated){
        validated.canonicalIdentity=canonical;
        validated.matchIndex=match.index;
        hits.push(validated);
      }
      if(!match[0].length) re.lastIndex++;
    }
  }
  return hits.sort((a,b)=>a.matchIndex-b.matchIndex||String(b.canonicalIdentity||'').length-String(a.canonicalIdentity||'').length)[0]||null;
}

// Narrow, opt-in product-noun coverage for owner Preview editorial generation.
// Historical local results and recorded fallback approvals must not change.
const EXTRA_EDITORIAL_PRODUCT_TYPES=Object.freeze([
  '洗濯ネットセット','ヘアブラシ','靴下','ビジネスソックス',
  '野球グローブ','バイクグローブ','バイク グローブ','グローブ','臭わない袋','おそうじ 手袋','手袋','お米'
]);
function resolveLiteralIdentity(item,expanded=false){
  const title=normalize(item?.itemName);
  if(!title) return null;
  const candidates=[];
  const separated=separatedKnownIdentity(item);
  if(separated) candidates.push(separated);

  const known=[...(localTypeData.productTypes||[]),...(expanded?EXTRA_EDITORIAL_PRODUCT_TYPES:[])]
    .map(normalize).filter(Boolean)
    .map(type=>({type,at:title.indexOf(type)}))
    .filter(x=>x.at>=0&&!accessoryScoped(title,x.type))
    .sort((a,b)=>a.at-b.at||b.type.length-a.type.length);

  const titleTokens=title.split(/[\s,，、。!！?？()（）【】\[\]・\/／|｜]+/).filter(Boolean);
  for(const hit of known){
    // Preserve an explicitly named purpose compound instead of first reducing
    // it to its known suffix (e.g. X用Y -> Y). Validation and the existing
    // conflict/role arbitration still decide whether it is the whole product.
    for(const token of titleTokens){
      if(!token.endsWith(hit.type)||token===hit.type) continue;
      const prefix=token.slice(0,-hit.type.length);
      if(!/^[ぁ-んァ-ヶ一-龯ー]{1,12}用$/.test(prefix)) continue;
      const compound=validateLiteralIdentity(item,token);
      if(!compound) continue;
      compound.canonicalIdentity=token;
      compound.matchIndex=title.indexOf(token);
      candidates.push(compound);
    }
    const validated=validateLiteralIdentity(item,hit.type);
    if(!validated) continue;
    validated.canonicalIdentity=hit.type;
    validated.matchIndex=hit.at;
    candidates.push(validated);
  }
  if(candidates.length){
    return candidates.sort((a,b)=>a.matchIndex-b.matchIndex||String(b.canonicalIdentity||'').length-String(a.canonicalIdentity||'').length)[0];
  }

  const tokens=title.split(/[\s,，、。!！?？()（）【】\[\]・\/／]+/).map(normalize).filter(Boolean);
  for(const token of tokens){
    if(token.length<4||token.length>24) continue;
    if(!TYPE_SUFFIXES.some(suffix=>token.endsWith(suffix)&&token.length>suffix.length)) continue;
    const validated=validateLiteralIdentity(item,token);
    if(validated) return validated;
  }
  return null;
}

function extractLiteralSpecs(item){
  const parts=[{source:'itemName',text:normalize(item?.itemName)}].filter(x=>x.text);
  const out=[];
  const patterns=[
    /\d+(?:\.\d+)?\s*(?:~|〜|～|-)\s*\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|kg|g|ml|mL|L|GB|インチ)/gi,
    /\d+(?:\.\d+)?\s*(?:mm|cm|m)[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m))?/gi,
    /\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|kg|mg|g|ml|mL|L|GB|インチ)/gi,
    /\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?/g
  ];
  for(const part of parts){
    for(const re of patterns){
      re.lastIndex=0;
      let match;
      while((match=re.exec(part.text))){
        const quote=normalize(match[0]);
        const start=match.index;
        const end=start+match[0].length;
        const before=part.text.slice(Math.max(0,start-1),start);
        const after=part.text.slice(end,end+1);
        const isCount=/枚|個|本|袋|組|点|粒|錠|箱|足/.test(quote);
        if(/[0-9０-９A-Za-z.,，_+×xX-]$/.test(before)||/^[0-9０-９A-Za-z×xX]/.test(after)) continue;
        if(/^[ぁ-んァ-ヶ一-龯]/.test(after)) continue;
        if(!quote||out.some(x=>x.quote.toLowerCase()===quote.toLowerCase())) continue;
        out.push({quote,source:part.source,kind:/[×xX]/.test(quote)?'dimension':isCount?'count':'numeric'});
      }
    }
  }
  return out.slice(0,6);
}

function equivalentVolumeKey(value){
  const m=normalize(value).match(/^(\d+(?:\.\d+)?)\s*(ml|mL|L)$/i);
  if(!m) return '';
  const amount=Number(m[1]);
  if(!Number.isFinite(amount)) return '';
  const unit=m[2].toLowerCase();
  const ml=unit==='l'?amount*1000:amount;
  return 'volume_ml:'+String(Math.round(ml*1000)/1000);
}

function neutralLiteralText(identity,facts,itemPrice){
  const rows=[identity];
  if(facts.length){
    rows.push('', '特徴👇');
    for(const fact of facts.slice(0,3)) rows.push('✓ '+fact.quote);
  }
  if(Number(itemPrice)>0) rows.push('', '価格：'+Number(itemPrice).toLocaleString('ja-JP')+'円');
  rows.push('', '※アフィリエイト広告を利用しています');
  return rows.join('\n');
}

const LOCAL_PARTNER_ALLOWED_PREVENTION=[
  '型崩れ防止','形崩れ防止','絡まり防止','色移り防止','毛玉防止','シワ防止'
];

function hasCrossSourceFactConflict(item={},facts=[]){
  return structured.hasSourceFactConflict(item,facts);
}

function localPartnerTextSafe(item,partnerCopy,text){
  const source=normalize([item?.itemName,item?.itemCaption].filter(Boolean).join(' '));
  const quote=normalize(partnerCopy?.quote);
  if(!source||!quote||!source.includes(quote)) return false;

  let probe=String(text||'');
  const canonicalQuote=quote.replace(/\s+/g,'');
  if(LOCAL_PARTNER_ALLOWED_PREVENTION.includes(canonicalQuote)){
    probe=probe.split(quote).join('');
  }
  return !structured.RISK.test(probe);
}

function resolveIdentityHint(item,learnedIdentity=''){
  const title=normalize(item?.itemName);
  const ruleLocal=resolveLocalUnderstanding({itemName:item?.itemName,itemCaption:item?.itemCaption});
  const literalLocal=resolveLiteralIdentity(item);
  const repeatedLocal=repeatedLiteralIdentity(item);
  let local=selectLocalIdentity({title,ruleLocal,literalLocal,repeatedLocal});
  if(!local){
    const rescue=leadingCompoundIdentity(item);
    if(rescue?.validation?.productType?.valid===true){
      const rescueIdentity=String(rescue?.canonicalIdentity||rescue?.raw?.productType?.value||'').trim();
      if(rescueIdentity&&!hasCompetingCompoundIdentity(title,rescueIdentity)) local=rescue;
    }
  }
  if(!local&&normalize(learnedIdentity)){
    const learned=validateLiteralIdentity(item,learnedIdentity);
    if(learned) local={...learned,canonicalIdentity:normalize(learnedIdentity)};
  }
  const sourceIdentity=String(local?.raw?.productType?.value||'').trim();
  const identity=String(local?.canonicalIdentity||sourceIdentity).trim();
  if(!identity||local?.validation?.productType?.valid!==true) return '';
  if(!local?.arbitration&&hasCompetingCompoundIdentity(title,identity)) return '';
  return identity;
}

// In owner Preview only, prefer an explicit independently named selling noun
// when a short component-role heuristic or unrelated promotional descriptor
// would otherwise leave the actual item unresolved. No inferred aliases.
function expandedLiteralWinner(item,literal,previous){
  const title=normalize(item?.itemName);
  const type=normalize(literal?.canonicalIdentity||literal?.raw?.productType?.value);
  if(!type||literal?.validation?.productType?.valid!==true
     ||!EXTRA_EDITORIAL_PRODUCT_TYPES.includes(type))return previous;
  const at=title.indexOf(type);
  if(at<0)return previous;
  const before=title.slice(Math.max(0,at-7),at),after=title.slice(at+type.length,at+type.length+13);
  if(/(?:替え|交換用|専用|付属|対応|用)\s*$/.test(before)
     ||/^\s*(?:用|専用)(?:ケース|カバー|ポーチ|ホルダー|ケーブル|替え)/.test(after))return previous;
  const standalone=title.split(/[\s【】〖〗（）()「」『』・／｜,:：;；!！?？★☆※。&＆]+/).includes(type);
  if(!standalone&&!type.includes(' '))return previous;
  const existing=normalize(previous?.canonicalIdentity||previous?.raw?.productType?.value);
  const wrongDescriptor=/^(?:令和|平成)\d+年産\d+%使用$/.test(existing);
  const strongerSet=existing&&type.startsWith(existing)&&type!==existing&&/(?:セット|キット)$/.test(type);
  if(previous&&!wrongDescriptor&&!strongerSet)return previous;
  if(hasCompetingCompoundIdentity(title,type))return previous;
  return {...literal,identityHypothesis:{method:'explicit_editorial_product_noun',supportCount:1},
    arbitration:{version:'2026-11-16-preview-explicit-product-v1',winner:{identity:type,source:'literal'},candidates:[{identity:type,source:'literal'}]}};
}
function stripMarketingAngle(title=''){
  return normalize(title).replace(/[<＜][^>＞]{0,100}(?:COUPON|クーポン|レビュー|OFF|セール)[^>＞]{0,100}[>＞]/gi,' ');
}

function localZeroCall(item,learnedIdentity='',diagnostics=null,previewOptions={}){
  // Internal diagnostics expose the existing decision, never a second policy
  // or a bypass. The normal endpoint still receives exactly the same contract.
  const reject=(stage,reason)=>{
    if(diagnostics) Object.assign(diagnostics,{status:'deferred',stage,reason});
    return null;
  };
  const title=normalize(item?.itemName);
  const ruleLocal=resolveLocalUnderstanding({itemName:item.itemName,itemCaption:item.itemCaption});
  const literalLocal=resolveLiteralIdentity(item,previewOptions.identityExpansion===true);
  const repeatedLocal=repeatedLiteralIdentity(item);
  if(diagnostics) diagnostics.identityCandidates={
    rule:ruleLocal?.canonicalIdentity||ruleLocal?.raw?.productType?.value||'',
    literal:literalLocal?.canonicalIdentity||literalLocal?.raw?.productType?.value||'',
    repeated:repeatedLocal?.canonicalIdentity||repeatedLocal?.raw?.productType?.value||''
  };
  let local=selectLocalIdentity({title,ruleLocal,literalLocal,repeatedLocal});
  if(previewOptions.identityExpansion===true)
    local=expandedLiteralWinner(item,literalLocal,local);

  if(!local){
    const rescue=leadingCompoundIdentity(item);
    if(rescue?.validation?.productType?.valid===true){
      const rescueIdentity=String(rescue?.canonicalIdentity||rescue?.raw?.productType?.value||'').trim();
      if(rescueIdentity&&!hasCompetingCompoundIdentity(title,rescueIdentity)) local=rescue;
    }
  }

  if(!local&&normalize(learnedIdentity)){
    const learned=validateLiteralIdentity(item,learnedIdentity);
    if(learned){
      learned.canonicalIdentity=normalize(learnedIdentity);
      learned.matchIndex=title.indexOf(learned.canonicalIdentity);
      learned.identityHypothesis={method:'learned_verified_type',supportCount:1};
      learned.version='2026-10-05-learned-verified-type-v1';
      local=learned;
    }
  }

  let sourceIdentity=String(local?.raw?.productType?.value||'').trim();
  let identity=String(local?.canonicalIdentity||sourceIdentity).trim();
  let identityQuote=String(local?.raw?.productType?.evidence||sourceIdentity).trim();
  if(diagnostics) diagnostics.identity=identity;
  if(!identity || local?.validation?.productType?.valid!==true) return reject('identity','identity_unresolved');
  if(!local?.arbitration&&hasCompetingCompoundIdentity(
    previewOptions.identityExpansion===true?stripMarketingAngle(title):title,identity
  )) return reject('identity','competing_identity');

  const titleOnlyItem={...item,itemCaption:''};
  const copy=structured.compose(titleOnlyItem,{identity});
  const understanding=copy?.understanding||{};
  const structuredMethod=String(understanding?.method||'');
  const structuredIdentity=String(understanding?.identity||'').trim();
  const structuredSafe=copy?.status==='ok'
    && structured.factsAreTitleBound(copy.facts)
    && ['type_definition','validated_identity'].includes(structuredMethod)
    && structuredIdentity===identity
    && String(copy.text||'').trim()
    && !structured.RISK.test(copy.text);

  const structuredFacts=structuredSafe&&Array.isArray(copy.facts)?copy.facts:[];
  const literalFacts=extractLiteralSpecs(titleOnlyItem);
  const proposedPartnerCopy=composeLocalPartnerCopy({itemName:titleOnlyItem.itemName,itemCaption:item.itemCaption,identity,itemPrice:item.itemPrice,editorial:previewOptions.editorial===true,linkedReason:previewOptions.linkedReason===true});
  if(diagnostics) diagnostics.purchaseCandidate=proposedPartnerCopy?{
    text:proposedPartnerCopy.text,quote:proposedPartnerCopy.quote,source:proposedPartnerCopy.source||'itemName',
    kind:proposedPartnerCopy.kind,axes:proposedPartnerCopy.axisHints||[]
  }:null;
  // Generic material, quantity and dimension descriptions are factual, but do
  // not by themselves explain a buyer's use case. Defer those to verified AI
  // instead of marking a thin title-only description as a finished post.
  const weakGenericAxis=/^(?:素材・構造|生産情報|サイズ|入り数|数値仕様|重量|容量)$/;
  // A complete, source-checked caption claim can describe what fits inside.
  // Its capacity axis does not make it equivalent to an isolated size/number.
  const partnerCopy=proposedPartnerCopy?.generic
    && proposedPartnerCopy.kind!=='caption_claim'
    && weakGenericAxis.test(String(proposedPartnerCopy.axisHints?.[0]||''))
    ?null:proposedPartnerCopy;
  const facts=[];
  const semanticFactKeys=new Set();
  for(const fact of [...structuredFacts,...literalFacts]){
    if(!fact?.quote) continue;
    const exact='exact:'+normalize(fact.quote).toLowerCase();
    const volume=equivalentVolumeKey(fact.quote);
    if(semanticFactKeys.has(exact)||(volume&&semanticFactKeys.has(volume))) continue;
    semanticFactKeys.add(exact);
    if(volume) semanticFactKeys.add(volume);
    facts.push(fact);
  }
  if(partnerCopy?.quote){
    const exact='exact:'+normalize(partnerCopy.quote).toLowerCase();
    if(!semanticFactKeys.has(exact)){
      semanticFactKeys.add(exact);
      facts.unshift({quote:partnerCopy.quote,source:partnerCopy.source||'itemName',kind:'partner_signal'});
    }
  }
  if(diagnostics) diagnostics.extractedFacts=facts.map(({quote,source,kind})=>({quote,source,kind}));
  if(!facts.length) return reject('extraction','no_grounded_facts');
  if(hasCrossSourceFactConflict(item,facts)) return reject('evidence','conflicting_source_facts');
  if(facts.every(f=>/^(?:日本製)$/.test(normalize(f.quote)))) return reject('purchase_reason','origin_only');

  const groundedValues=structuredSafe?(Array.isArray(copy.values)?copy.values:[]).filter(v=>
    String(v?.text||'').trim() && (v.factRefs||[v.factRef]).filter(Boolean).length
  ):[];
  // A purchase reason must appear as a complete rendered line. A substring
  // inside a title, a generic hook, or an unrelated specification is not proof.
  const renderedCopyLines=new Set(String(copy?.text||'').split(/\n+/).map(line=>line.trim()).filter(Boolean));
  const selectedGroundedValues=groundedValues.filter(v=>renderedCopyLines.has(String(v?.text||'').trim()));
  const hasWeakStructuredPiggyback=selectedGroundedValues.some(v=>!structured.valueHasStrongReason(v,structuredFacts,identity));
  const useStructuredText=!partnerCopy
    && structuredSafe
    && structuredFacts.length>0
    && selectedGroundedValues.length>0
    && !hasWeakStructuredPiggyback
    && selectedGroundedValues.some(v=>structured.valueHasStrongReason(v,structuredFacts,identity));
  // Exact facts alone are not a finished ROOM post. Local completion requires
  // a grounded purchase reason; otherwise defer to the V3 Groq verification path.
  if(!partnerCopy&&!useStructuredText) return reject('purchase_reason','no_grounded_purchase_candidate');
  const directAppeals=partnerCopy?[{
    text:[partnerCopy.hook,partnerCopy.quote].filter(Boolean).join('。'),
    factRef:partnerCopy.quote,
    factRefs:[partnerCopy.quote],
    source:partnerCopy?.source||'itemName'
  }]:(groundedValues.length?groundedValues:facts.slice(0,3).map(f=>({
    text:'仕様：'+f.quote,
    factRef:f.quote,
    factRefs:[f.quote],
    source:f.source
  })));
  if(!directAppeals.length) return reject('composition','no_renderable_appeals');

  let text=partnerCopy?.text||(useStructuredText?copy.text:neutralLiteralText(identity,facts,item.itemPrice));
  if(useStructuredText&&structuredFacts.length!==facts.length&&facts.some(f=>equivalentVolumeKey(f.quote))) text=neutralLiteralText(identity,facts,item.itemPrice);
  const textSafe=partnerCopy?localPartnerTextSafe(item,partnerCopy,text):!structured.RISK.test(text);
  if(!String(text||'').trim()||!textSafe) return reject('safety','local_text_rejected');
  // The browser already refuses any text changed by this guard. A local
  // response must not claim ready while its final copy boundary will reject it.
  if(guardUnsupportedBenefitCopy(item,text)!==text) return reject('safety','final_copy_guard');
  const restatement=restatedReason(text,{identity,quote:partnerCopy?.quote||''});
  if(restatement) return reject('purchase_reason',restatement);
  if(catalogueOnly(text)) return reject('quality','catalogue_only_copy');
  // An exact quote is necessary, but never by itself a persuasive buyer
  // reason. This is a rejection-only editorial screen, not a 6-axis pass.
  // Historic baseline copy remains untouched.
  if(previewOptions.editorial===true&&partnerCopy?.kind==='caption_claim'){
    const editorialReview=reviewSourceBenefit({quote:partnerCopy.quote,identity});
    if(!editorialReview.ok)return reject('quality',editorialReview.reason);
  }
  if(diagnostics) Object.assign(diagnostics,{status:'ready',stage:'publication',reason:'grounded_local_copy'});
  const hook=partnerCopy?.hook||(useStructuredText&&String(understanding.scene||'').trim()?String(understanding.scene).trim():identity);
  const hookType=partnerCopy?.hookType||(hook===identity?'identity':'scene');
  const variant={index:1,hookType,hook,text};
  return {
    ok:true,pending:false,retryAfterMs:0,phase:'local',
    version:'super-urenavi-v3-conditional-preview',model:'local',
    productType:{specific:identity,general:(structuredSafe&&understanding.domain)||identity,quote:identityQuote,valid:true},
    attributes:facts.map((f,index)=>({name:f.kind||'fact',value:f.quote,unit:'',qualifier:'',valueType:'text',quote:f.quote,sourceIndex:index})),
    decisionAxes:partnerCopy?.axisHints||[],
    verifiedAppeals:directAppeals.map((v,index)=>({index,text:v.text,noHassle:'',scene:index===0&&hookType==='scene'?hook:'',attributeRefs:[],strength:index===0?3:2,verification:{required:false,supported:true,keepDirectFact:true,reason:partnerCopy?'local_partner_grounded_angle':'local_grounded_fact'}})),
    groq:{pass1Calls:0,pass2Calls:0,totalCalls:0},
    cacheStatus:'local',pass2Status:'not_needed',tier:'A',
    quality:{status:'ready',text,reasons:[]},
    variants:[variant],
    local:{route:'local',version:local.arbitration?.version||partnerCopy?.reasoningVersion||local.version||copy?.version||'literal-source',method:partnerCopy?'partner_reasoning':(useStructuredText?structuredMethod:'literal_source'),factCount:facts.length,valueCount:groundedValues.length,partner:partnerCopy?{productType:partnerCopy.productType,actsOn:partnerCopy.actsOn,quote:partnerCopy.quote,kind:partnerCopy.kind,...(partnerCopy.linkedEvidence?.length?{linkedEvidence:partnerCopy.linkedEvidence}:{})}:null,arbitration:local.arbitration||null,learnedIdentity:local?.identityHypothesis?.method==='learned_verified_type'?identity:null}
  };
}

async function rememberValidatedIdentity(store,analysis,model=''){
  const type=normalize(analysis?.validation?.productType?.specific||'');
  if(!analysis?.ok||analysis?.validation?.productType?.valid!==true||[...type].length<4) return {status:'skipped',productType:''};
  if(typeof store?.loadTypeKnowledge!=='function'||typeof store?.saveTypeKnowledge!=='function') return {status:'unsupported',productType:type};
  try{
    const existing=await store.loadTypeKnowledge(type);
    const identityOnly=existing?.validation_status==='pending'&&existing?.raw_ai_json?.identityLearned===true;
    if(existing?.validation_status==='valid'||identityOnly) return {status:'hit',productType:type};
    await store.saveTypeKnowledge({
      productType:type,
      model:String(model||''),
      promptVersion:'2026-10-05-v3-verified-identity-v1',
      schemaVersion:'product_type_identity_v1',
      rawAiJson:{productType:type,identityLearned:true,source:'v3_verified_product'},
      validationStatus:'pending'
    });
    return {status:'stored',productType:type};
  }catch(error){
    console.warn('super-urenavi-v3 learned identity unavailable',error?.message||'unknown');
    return {status:'unavailable',productType:type};
  }
}

// Reuse a rejected baseline only when the editorial path supplies a new,
// verbatim caption claim bound to a verified appeal. This never bypasses any
// safety, publication or copy guard within localZeroCall.
function verifiedCaptionEditorialRescue(item,result){
  if(!result?.ok||result?.quality?.status!=='ready') return false;
  const partner=result?.local?.partner;
  const quote=partner?.quote;
  if(partner?.kind!=='caption_claim'||typeof quote!=='string'||!quote.trim())return false;
  if(typeof item?.itemCaption!=='string'||!item.itemCaption.includes(quote))return false;
  if(!result.verifiedAppeals?.some(v=>v?.verification?.keepDirectFact===true&&typeof v.text==='string'&&v.text.includes(quote)))return false;
  const text=String(result.quality.text||'');
  const linked=partner.linkedEvidence||[];
  if(!Array.isArray(linked)||linked.length>3)return false;
  if(linked.length&&!linked.every(f=>f?.source==='itemCaption'&&typeof f.quote==='string'&&f.quote.trim()
    &&item.itemCaption.includes(f.quote)&&text.includes(f.quote)))return false;
  return !!text&&result.variants?.[0]?.text===text&&text.includes(quote);
}

// A rule-authored use intent and a literal title signal are a separate,
// auditable path from caption claims. Never accept generic spec comparison,
// a missing quote, or a guessed customer outcome.
function verifiedTitleSignalEditorialRescue(item,result){
  if(!result?.ok||result?.pending!==false||result?.model!=='local'
      ||result?.quality?.status!=='ready'||result?.groq?.totalCalls!==0)return false;
  const partner=result?.local?.partner,quote=String(partner?.quote||'');
  if(partner?.kind!=='signal'||quote.length<4||typeof item?.itemName!=='string'
      ||!item.itemName.includes(quote))return false;
  const body=String(result.quality.text||'');
  if(!body||result.variants?.length!==1||result.variants[0]?.text!==body)return false;
  const lines=body.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(lines.length<3||!lines[1]?.includes(quote))return false;
  if(!result.verifiedAppeals?.some(v=>v?.verification?.keepDirectFact===true
    &&typeof v.text==='string'&&v.text.includes(quote)))return false;
  const firstLine=lines[0].replace(/[。！!]+$/,'');
  const allowed=SAFE_SIGNALS.some(rule=>
    rule.intent===firstLine
    &&/(?:したいとき|使いたいとき|持ち歩きたいとき|選びたいとき)$/.test(rule.intent)
    &&!/(?:見て選|確認して選|仕様も見)/.test(rule.intent)
    &&[rule.term,...(rule.aliases||[])].some(t=>normalize(t).toLowerCase()===normalize(quote).toLowerCase())
  );
  return allowed&&verifiedTitleSignal(item,partner,body)&&!catalogueOnly(body)&&!structured.RISK.test(body)
    &&guardUnsupportedBenefitCopy(item,body)===body;
}

function createHandler(deps={}){
  const authorizeFn=deps.authorize||authorize;
  const baseStore=deps.store||createCacheStore(db);
  const store=deps.namespaced===false?baseStore:namespacedStore(baseStore);
  const quotaFn=deps.consumeQuota||consumeQuota;
  const localFn=deps.localZeroCall===undefined?localZeroCall:deps.localZeroCall;
  const analyzeFn=deps.analyzeProductV3||analyzeProductV3;
  const composeFn=deps.composeVariants||composeVariants;

  return async function handler(req,res){
    if(req.method!=='POST') return json(res,405,{message:'Method not allowed'});
    const runtimeEnv=String(process.env.VERCEL_ENV||'');
    if(runtimeEnv!=='preview') return json(res,404,{message:'Not found'});

    const started=Date.now();
    let activeModel=null;
    try{
      const auth=await authorizeFn(req);
      if(!auth?.ok || auth.plan!=='owner') return json(res,403,{message:'owner_preview_only'});

      const body=req.body&&typeof req.body==='object'?req.body:{};
      const runKey=body.evaluationRun===undefined?'':String(body.evaluationRun);
      if(runKey&&!/^[A-Za-z0-9_-]{1,80}$/.test(runKey)) return json(res,400,{message:'invalid evaluationRun'});
      if(body.evaluationModel!==undefined&&(!runKey||!EVALUATION_MODELS.has(body.evaluationModel))) return json(res,400,{message:'invalid evaluationModel'});

      const requestedModel=body.evaluationModel;
      const model=requestedModel||String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
      activeModel=model;
      const item={
        itemCode:String(body.itemCode||'').trim().slice(0,300)+(runKey?':eval:'+runKey:''),
        itemName:String(body.itemName||'').trim().slice(0,1000),
        itemCaption:String(body.itemCaption||'').slice(0,12000),
        itemPrice:Number(body.itemPrice)||0,
        imageUrl:String(body.imageUrl||'').trim()
      };
      if(!item.itemName) return json(res,400,{message:'itemName is required'});

      if(body.statusOnly===true){
        return json(res,202,{
          ok:false,pending:true,retryAfterMs:0,phase:'not_started',
          version:'super-urenavi-v3-conditional-preview',model,
          groq:{pass1Calls:0,pass2Calls:0,totalCalls:0}
        });
      }

      if(!runKey && typeof localFn==='function'){
        let learnedIdentity='';
        let localResult=localFn(item);
        if(!localResult&&typeof store.findTypeIdentityInTitle==='function'){
          try{learnedIdentity=await store.findTypeIdentityInTitle(item.itemName);}catch(error){console.warn('super-urenavi-v3 learned identity lookup unavailable',error?.message||'unknown');}
          if(learnedIdentity) localResult=localFn(item,learnedIdentity);
        }
        if(!localResult){
          // One offline-only editorial rescue, using the existing local gate.
          // Never use it for title-only, generic, or unsupported claims.
          const editorial=localFn(item,learnedIdentity,{}, {editorial:true,linkedReason:true,identityExpansion:true});
          if(verifiedCaptionEditorialRescue(item,editorial)||verifiedTitleSignalEditorialRescue(item,editorial)) localResult=editorial;
        }
        if(localResult){
          if(learnedIdentity&&localResult.local) localResult.local.learnedIdentity=learnedIdentity;
          localResult.metric=logAiUsageMetric({
            route:'local',cacheStatus:'local',pass1Calls:0,pass2Calls:0,imageCalls:0,
            outputTier:localResult.tier,hookType:localResult.variants?.[0]?.hookType||'none',decisionAxis:'',
            machineValidationPassed:true,copied:false,elapsedMs:Date.now()-started
          });
          return json(res,200,localResult);
        }
      }

      let groq=deps.groq;
      if(!groq){
        const createGroq=deps.createGroq||createV3Groq;
        const apiKey=String(process.env.GROQ_API_KEY||'').trim();
        if(!apiKey && !deps.createGroq) return json(res,503,{message:'GROQ_API_KEY is not configured'});
        groq=createGroq({apiKey,model});
      }

      item.identityHint=resolveIdentityHint(item);
      const analysis=await analyzeFn({
        item,store,model,consumeQuota:quotaFn,
        callPass1:groq.callPass1,
        callPass2:groq.callPass2,
        deferPass2:false
      });
      const learnedIdentity=runKey?{status:'skipped',productType:''}:await rememberValidatedIdentity(store,analysis,model);
      const copy=composeFn({item,analysis});
      const metric=logAiUsageMetric({
        route:analysis.source,
        cacheStatus:analysis.cacheStatus,
        pass1Calls:analysis.groq.pass1Calls,
        pass2Calls:analysis.groq.pass2Calls,
        imageCalls:0,
        outputTier:copy.tier,
        hookType:copy.variants[0]?.hookType||'none',
        decisionAxis:analysis.validation?.decisionAxes?.[0]?.text||'',
        machineValidationPassed:analysis.validation?.valid===true,
        copied:false,
        elapsedMs:Date.now()-started
      });

      const publication=copy.quality&&typeof copy.quality==='object'
        ?copy.quality
        :{status:'blocked',text:'',reasons:['copy_quality_missing'],ledger:[]};
      const ready=analysis.ok===true
        && publication.status==='ready'
        && Boolean(String(publication.text||'').trim())
        && String(publication.text||'').trim()===String(copy.variants?.[0]?.text||'').trim();
      const quality={
        ...publication,
        status:ready?'ready':'blocked',
        text:ready?String(copy.variants[0].text):'',
        reasons:ready?[]:[...(Array.isArray(publication.reasons)?publication.reasons:[]),...(analysis.ok===true?[]:['analysis_not_ready'])]
      };

      const nextDelayMs=nextSafeDelayMs(analysis.rateLimit||{},analysis.usage||{});

      return json(res,200,{
        ok:ready,
        pending:false,
        retryAfterMs:0,
        phase:analysis.pass2Status==='generated'?'verification':'generation',
        version:'super-urenavi-v3-conditional-preview',
        model,
        productType:analysis.validation?.productType||null,
        attributes:analysis.validation?.attributes||[],
        decisionAxes:analysis.validation?.decisionAxes||[],
        verifiedAppeals:analysis.verifiedAppeals||[],
        groq:analysis.groq,
        nextDelayMs,
        cacheStatus:analysis.cacheStatus,
        pass2Status:analysis.pass2Status,
        tier:copy.tier,
        quality,
        variants:ready?copy.variants:[],
        learnedIdentity,
        metric
      });
    }catch(error){
      const status=error?.status===429?429:502;
      const retryAfterMs=Number(error?.retryAfterMs)||0;
      if(retryAfterMs>0) res.setHeader('Retry-After',String(Math.ceil(retryAfterMs/1000)));
      return json(res,status,{
        ok:false,pending:false,
        message:status===429?(error?.safeError?'AI provider rate limit reached':'AI daily limit reached'):'v3 analysis failed',
        retryAfterMs,
        version:'super-urenavi-v3-conditional-preview',
        model:activeModel,
        stage:error?.stage||null,
        upstreamStatus:error?.status||null,
        failureReason:error?.failureReason||'analysis_error',
        upstreamDiagnostic:error?.safeError?{category:error.safeError.category,code:error.safeError.code,message:String(error.safeError.message||'').slice(0,500)}:null,
        fallback:true
      });
    }
  };
}

const legacyHandler=createHandler();
module.exports=function(req,res){
  if(req.query?.urenaviReviewComparison==='1')return require('../lib/room-review-comparison')(req,res);
  if(req.query?.urenaviContract==='1')return require('../lib/room-copy-handler')(req,res);
  return legacyHandler(req,res);
};
module.exports.createHandler=createHandler;
module.exports.namespacedStore=namespacedStore;
module.exports.localZeroCall=localZeroCall;
module.exports.verifiedCaptionEditorialRescue=verifiedCaptionEditorialRescue;
module.exports.verifiedTitleSignalEditorialRescue=verifiedTitleSignalEditorialRescue;
module.exports.resolveLiteralIdentity=resolveLiteralIdentity;
module.exports.resolveIdentityHint=resolveIdentityHint;
module.exports.extractLiteralSpecs=extractLiteralSpecs;
module.exports.rememberValidatedIdentity=rememberValidatedIdentity;
