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
const {composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');
const localTypeData=require('../data/local-product-types.json');
const structured=require('../public/structured-room-copy');

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
  if(!identity||!title.includes(identity)||accessoryScoped(title,identity)) return null;
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

function resolveLiteralIdentity(item){
  const title=normalize(item?.itemName);
  if(!title) return null;
  const candidates=[];
  const separated=separatedKnownIdentity(item);
  if(separated) candidates.push(separated);

  const known=(localTypeData.productTypes||[])
    .map(normalize).filter(Boolean)
    .map(type=>({type,at:title.indexOf(type)}))
    .filter(x=>x.at>=0&&!accessoryScoped(title,x.type))
    .sort((a,b)=>a.at-b.at||b.type.length-a.type.length);

  for(const hit of known){
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
  if(hasCompetingCompoundIdentity(title,identity)) return '';
  return identity;
}

function localZeroCall(item,learnedIdentity=''){
  const title=normalize(item?.itemName);
  const ruleLocal=resolveLocalUnderstanding({itemName:item.itemName,itemCaption:item.itemCaption});
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
  if(!identity || local?.validation?.productType?.valid!==true) return null;
  if(hasCompetingCompoundIdentity(title,identity)) return null;

  const titleOnlyItem={...item,itemCaption:''};
  const copy=structured.compose(titleOnlyItem,{identity});
  const understanding=copy?.understanding||{};
  const structuredMethod=String(understanding?.method||'');
  const structuredIdentity=String(understanding?.identity||'').trim();
  const structuredSafe=copy?.status==='ok'
    && ['type_definition','validated_identity'].includes(structuredMethod)
    && structuredIdentity===identity
    && String(copy.text||'').trim()
    && !structured.RISK.test(copy.text);

  const structuredFacts=structuredSafe&&Array.isArray(copy.facts)?copy.facts:[];
  const literalFacts=extractLiteralSpecs(titleOnlyItem);
  const partnerCopy=composeLocalPartnerCopy({itemName:titleOnlyItem.itemName,itemCaption:item.itemCaption,identity,itemPrice:item.itemPrice});
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
  if(!facts.length) return null;
  if(facts.every(f=>/^(?:日本製)$/.test(normalize(f.quote)))) return null;

  const groundedValues=structuredSafe?(Array.isArray(copy.values)?copy.values:[]).filter(v=>
    String(v?.text||'').trim() && (v.factRefs||[v.factRef]).filter(Boolean).length
  ):[];
  const useStructuredText=!partnerCopy&&structuredSafe&&structuredFacts.length>0&&groundedValues.length>0;
  // Exact facts alone are not a finished ROOM post. Local completion requires
  // a grounded purchase reason; otherwise defer to the V3 Groq verification path.
  if(!partnerCopy&&!useStructuredText) return null;
  const directAppeals=partnerCopy?[{
    text:partnerCopy.hook+'。'+partnerCopy.quote,
    factRef:partnerCopy.quote,
    factRefs:[partnerCopy.quote],
    source:partnerCopy?.source||'itemName'
  }]:(groundedValues.length?groundedValues:facts.slice(0,3).map(f=>({
    text:'仕様：'+f.quote,
    factRef:f.quote,
    factRefs:[f.quote],
    source:f.source
  })));
  if(!directAppeals.length) return null;

  let text=partnerCopy?.text||(useStructuredText?copy.text:neutralLiteralText(identity,facts,item.itemPrice));
  if(useStructuredText&&structuredFacts.length!==facts.length&&facts.some(f=>equivalentVolumeKey(f.quote))) text=neutralLiteralText(identity,facts,item.itemPrice);
  if(!String(text||'').trim()||structured.RISK.test(text)) return null;
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
    local:{route:'local',version:local.arbitration?.version||partnerCopy?.reasoningVersion||local.version||copy?.version||'literal-source',method:partnerCopy?'partner_reasoning':(useStructuredText?structuredMethod:'literal_source'),factCount:facts.length,valueCount:groundedValues.length,partner:partnerCopy?{productType:partnerCopy.productType,actsOn:partnerCopy.actsOn,quote:partnerCopy.quote,kind:partnerCopy.kind}:null,arbitration:local.arbitration||null,learnedIdentity:local?.identityHypothesis?.method==='learned_verified_type'?identity:null}
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
        && Boolean(String(copy.variants?.[0]?.text||'').trim());
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

module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.namespacedStore=namespacedStore;
module.exports.localZeroCall=localZeroCall;
module.exports.resolveLiteralIdentity=resolveLiteralIdentity;
module.exports.resolveIdentityHint=resolveIdentityHint;
module.exports.extractLiteralSpecs=extractLiteralSpecs;
module.exports.rememberValidatedIdentity=rememberValidatedIdentity;
