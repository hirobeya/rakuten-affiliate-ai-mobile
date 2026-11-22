'use strict';

const {createHash}=require('node:crypto');
const {groqPlan,paidCapacityPolicy}=require('./urenavi-core/groq-plan');
const {roomCopySourceHash,reviewedRoomCopy}=require('./urenavi-core/room-copy-review');
const {readyRoomText}=require('../public/purchase-copy-quality');
const {authorize,db}=require('./billing');
const {
  validateAiExtraction,
  preprocessCaption
}=require('./room-ai');
const legacy=require('./room-ai-handler');
const {createRuntimeCacheStore}=require('./super-urenavi-cache');
const {guardedRoomAiCall}=require('./urenavi-core/room-ai-capacity-gate');
const {isolatedCacheDb}=require('./urenavi-core/isolated-room-ai-capacity-db');
const {makeRuntimeCapacityDb}=require('./urenavi-core/runtime-capacity-db');
const {extractEvidence}=require('./urenavi-core/source-evidence-ledger');
const {sourcePassages}=require('./urenavi-core/source-passages');
const {intakeProduct,sourceDeclaredIdentity}=require('./urenavi-core/product-intake');
const {composeSourceCopy,declaredProductName}=require('./urenavi-core/source-purchase-relations');
const localTypeData=require('../data/local-product-types.json');

const DEFAULT_MODEL='openai/gpt-oss-120b';
const PROMPT_VERSION='2026-09-24-ai-facts-only-v13';
const VALIDATION_RULE_VERSION='2026-09-24-ai-facts-v9';

function json(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
}

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function exactSourceMatch(source,value){
  const s=normalize(source);
  const v=normalize(value);
  return Boolean(v && s.includes(v));
}

function hasAccessoryScope(title,type){
  const t=normalize(title);
  const needle=normalize(type);
  const at=t.indexOf(needle);
  if(at<0) return false;
  const before=t.slice(Math.max(0,at-10),at);
  const after=t.slice(at+needle.length,Math.min(t.length,at+needle.length+12));
  const around=before+'|'+after;
  return (localTypeData.accessoryMarkers||[]).some(marker=>{
    const m=normalize(marker);
    if(!m) return false;
    if(after.startsWith(m)) return true;
    if(before.endsWith('用') && (m==='ケース'||m==='カバー'||m==='ポーチ'||m==='ホルダー'||m==='スタンド')) return true;
    return false;
  }) || /(?:交換用|替え)\s*$/.test(before) || /^\s*(?:用|専用)\s*(?:ケース|カバー|ポーチ|ホルダー|スタンド|フィルター)/.test(after) || around.includes('用|ケース');
}

function resolveLocalUnderstanding({itemName='',itemCaption=''}={},declaredName=''){
  const title=normalize(itemName);
  const caption=normalize(itemCaption);
  if(!title) return null;
  const hits=(localTypeData.productTypes||[])
    .map(normalize)
    .filter(Boolean)
    .filter(type=>title.includes(type))
    .filter(type=>!hasAccessoryScope(title,type))
    .sort((a,b)=>b.length-a.length || a.localeCompare(b,'ja'));
  if(!hits.length&&!declaredName) return null;

  const longest=declaredName||hits[0];
  const unrelated=hits.filter(x=>x!==longest && !longest.includes(x) && !x.includes(longest));
  if(!declaredName&&unrelated.length) return null;
  if(!exactSourceMatch(title,longest)) return null;

  const raw={
    productType:{value:longest,source:'itemName',evidence:longest},
    features:[],
    sellingPoints:[],
    confidence:'high'
  };
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:false});
  if(validation?.productType?.valid!==true) return null;
  if(!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation,version:localTypeData.version||'local-types'};
}

function resolveSourceUnderstanding(item,validationCaption=preprocessCaption(item.itemCaption)){
  const validationItem={...item,itemCaption:validationCaption};
  let local=resolveLocalUnderstanding(validationItem);
  const intake=intakeProduct(item);
  if(!intake.product)return {local,sourceCopy:null,copyReason:intake.reason};
  let sourceCopy=local&&composeSourceCopy(item,local.validation.productType.value);
  if(sourceCopy)return {local,sourceCopy};
  const name=declaredProductName(item);
  if(name&&name!==local?.validation.productType.value&&!hasAccessoryScope(item.itemName,name)){
    const declared=resolveLocalUnderstanding(validationItem,name);
    sourceCopy=declared&&composeSourceCopy(item,name);
    if(sourceCopy)return {local:declared,sourceCopy,layoutBound:true};
    if(!local&&declared)return {local:declared,sourceCopy:null,copyReason:'source_use_unconfirmed'};
  }
  if(!local){
    const declared=sourceDeclaredIdentity(item,sourcePassages(item.itemCaption));
    if(declared&&!hasAccessoryScope(item.itemName,declared.quote)){
      const raw={productType:{value:declared.quote,source:declared.source,evidence:declared.quote},features:[],sellingPoints:[],confidence:'high'};
      const validation=validateAiExtraction(raw,validationItem,{imageAvailable:false});
      if(validation.productType?.valid&&validation.mode==='simple'){
        local={raw,validation,version:localTypeData.version};
        sourceCopy=composeSourceCopy(item,declared.quote,{declared});
        return {local,sourceCopy,layoutBound:true,copyReason:sourceCopy?null:'source_use_unconfirmed'};
      }
    }
  }
  return {local,sourceCopy,copyReason:local?'source_use_unconfirmed':'product_identity_unresolved'};
}

// The operator attests to current Free-plan evidence for the exact key.
// Capacity v2 independently authorizes the reservation and durable intent.
function hasFreeEvidence(key,now=Date.now()){
  if(process.env.VERCEL_ENV!=='preview'||groqPlan()!=='free')return false;
  try{
    const evidence=JSON.parse(process.env.URENAVI_ROOM_COPY_FREE_EVIDENCE||'null');
    const observed=Date.parse(evidence?.verifiedAt);
    const expires=Date.parse(evidence?.expiresAt);
    return evidence?.plan==='free'&&evidence?.approved===true&&
      /^[a-f0-9]{64}$/.test(evidence.evidenceHash||'')&&
      evidence.keyHash===createHash('sha256').update(key).digest('hex')&&
      observed<=now&&now<expires&&expires-observed<=3600000;
  }catch{return false;}
}

function trialEvidenceAllows(item,apiKey){
  if(!apiKey||!hasFreeEvidence(apiKey)||!process.env.VERCEL_GIT_COMMIT_SHA)return false;
  const proof=JSON.parse(process.env.URENAVI_ROOM_COPY_FREE_EVIDENCE).trial;
  const digest=roomCopySourceHash(item);
  return proof?.sha===process.env.VERCEL_GIT_COMMIT_SHA
    &&Array.isArray(proof.sourceHashes)&&proof.sourceHashes.length<=8&&proof.sourceHashes.includes(digest);
}

function matchesApprovedCopy(raw,validation,draft){
  const expected=draft.proof.subject.quote;
  const quote=draft.proof.literal.quote;
  if(validation.mode!=='simple'||validation.productType.valid!==true||
    raw?.productType?.source!=='itemName'||raw.productType.value!==expected||
    raw.productType.evidence!==expected||Object.keys(raw.productType).sort().join(',')!=='evidence,source,value'||!Array.isArray(raw.features)||!Array.isArray(raw.sellingPoints)||
    Object.keys(raw).some(key=>!['productType','features','sellingPoints','confidence'].includes(key)))return false;
  const claims=[...raw.features,...raw.sellingPoints];
  return claims.length===1&&claims[0]?.source==='itemCaption'&&
    Object.keys(claims[0]).sort().join(',')==='evidence,source,text'&&
    claims[0]?.text===quote&&claims[0]?.evidence===quote&&
    [...validation.features,...validation.sellingPoints].every(claim=>claim.valid);
}

function responseBase({model,usage=null,elapsedMs=0,rawAiJson,validation,route,stages=null,cache,sourceCopy=null,sourceEvidenceStatus}){
  return {
    ok:true,
    phase:1,
    provider:route?.route==='local'?'local':'groq',
    model,
    usage,
    elapsedMs,
    validationRuleVersion:VALIDATION_RULE_VERSION,
    promptVersion:PROMPT_VERSION,
    rawAiJson,
    validation,
    route,
    ...(stages?{stages}:{}),
    ...(sourceCopy?{sourceCopy}:{}),
    ...(sourceEvidenceStatus?{sourceEvidenceStatus}:{}),
    cache
  };
}

function createHandler(deps={}){
  const authorizeFn=deps.authorize||authorize;
  // The single v2 gate, not the old daily counter, authorizes transport.
  const capacityGate=deps.capacityGate||guardedRoomAiCall;
  const callAI=deps.callGroq||((args)=>legacy.defaultCallGroq({...args,maxRetries:0}));
  const store=deps.store||createRuntimeCacheStore(db);
  const isolatedTrialStore=deps.store||createRuntimeCacheStore(isolatedCacheDb);

  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST') return json(res,405,{message:'Method not allowed'});
    const runtimeEnv=String(process.env.VERCEL_ENV||'');
    if(!['preview','production'].includes(runtimeEnv)) return json(res,404,{message:'Not found'});

    try{
      const auth=await authorizeFn(req);
      if(!auth?.ok) return json(res,403,{message:'access_required'});
      if(runtimeEnv==='preview' && auth.plan!=='owner') return json(res,403,{message:'owner_preview_only'});
      if(runtimeEnv==='production' && !['standard','base','pro','owner'].includes(String(auth.plan||''))) return json(res,403,{message:'paid_plan_required'});

      const body=req.body&&typeof req.body==='object'?req.body:{};
      const itemCode=String(body.itemCode||'').trim().slice(0,300);
      const itemName=String(body.itemName||'').trim().slice(0,1000);
      const itemCaptionRaw=String(body.itemCaption||'');
      const processed=preprocessCaption(itemCaptionRaw);
      // Preserve the entire source for validation and persistence. Only the
      // bounded provider payload is condensed to stay within Free limits.
      const itemCaption=processed;
      const modelCaption=processed.length<=3000?processed:
        (processed.slice(0,2200)+' … '+processed.slice(-750));
      const itemPrice=Number(body.itemPrice)||0;
      if(!itemName) return json(res,400,{message:'itemName is required'});
      if(itemCode.startsWith('room-copy-trial:'))return json(res,400,{message:'invalid_item_code'});

      const item={itemCode,itemName,itemCaption:itemCaptionRaw,itemPrice};
      const wantsCopy=body.purpose==='room-copy';
      const stopped=(reason)=>json(res,200,{ok:true,sourceCopy:null,copyStatus:'stopped',copyReason:reason});
      const {local,sourceCopy,layoutBound,copyReason}=resolveSourceUnderstanding(item,itemCaption);

      if(body.groqRoomCopyTrial===true){
        if(!wantsCopy||body.localOnly===true)return stopped('groq_trial_unavailable');
        const apiKey=String(process.env.GROQ_API_KEY||'').trim();
        const paidPolicy=runtimeEnv==='production'?paidCapacityPolicy({key:apiKey}):null;
        if(runtimeEnv!=='preview'&&(!paidPolicy||process.env.URENAVI_GROQ_PAID_ROOM_COPY_ENABLED!=='approved_copy'))
          return stopped('groq_trial_unavailable');
        if(!itemCode||!itemCaptionRaw.trim()||legacy.trialInputBytes(item)>5800)
          return stopped('groq_trial_source_unavailable');

        const cacheInput={...item,itemCode:'room-copy-trial:'+itemCode};
        const trialStore=runtimeEnv==='preview'?isolatedTrialStore:store;
        let stored;
        try{stored=await trialStore.loadProduct(cacheInput);}
        catch{return stopped('prior_result_unconfirmed');}
        const publish=(record,route)=>{
          const {roomCopy,...facts}=record?.raw||{};
          if(typeof roomCopy!=='string'||!roomCopy.trim()||roomCopy.length>550)
            return stopped('provider_candidate_rejected');
          const name=local?.validation.productType?.value;
          const draft=sourceCopy||(name&&composeSourceCopy(item,name,{providerEvidence:true}));
          const validation=validateAiExtraction(facts,{itemName,itemCaption},{imageAvailable:false});
          const formatted=readyRoomText(item,roomCopy.trim());
          const independentlyRendered=draft?.proof?.literal&&formatted===draft.text&&matchesApprovedCopy(facts,validation,draft);
          const reviewed=reviewedRoomCopy(item,record,validation,formatted);
          if(!independentlyRendered&&!reviewed)return stopped('provider_candidate_requires_review');
          return json(res,200,{ok:true,copyStatus:'ready',
            sourceCopy:independentlyRendered?draft:{text:formatted,proof:{kind:'reviewed_groq_copy'}},validation,route});
        };
        if(stored)return publish(stored.raw_ai_json,{route:'cache',groqCalls:0});
        if(body.reviewOnly===true)return stopped('reviewed_candidate_not_found');
        if(!paidPolicy&&!trialEvidenceAllows(item,apiKey))return stopped('groq_trial_approval_unconfirmed');
        const started=Date.now();
        const response=await capacityGate({
          req,authorization:auth,apiKey,model:DEFAULT_MODEL,paidPolicy,
          db:deps.capacityDb||makeRuntimeCapacityDb({productionDb:db}),
          authenticateSearchUser:deps.authenticateSearchUser,
          item:{...item,roomCopyTrial:true},callAI
        });
        const record={sourceHash:roomCopySourceHash(item),raw:response.raw,usage:response.usage,elapsedMs:Date.now()-started,
          ...(paidPolicy?{estimatedCostNanoUsd:response.estimatedCostNanoUsd}:{})};
        try{
          await trialStore.saveProduct({...cacheInput,model:DEFAULT_MODEL,promptVersion:'room-copy-trial-v1',
            schemaVersion:'room_copy_trial_v1',rawAiJson:record});
        }catch{return stopped('provider_result_save_unconfirmed');}
        return publish(record,{route:'text',groqCalls:1});
      }

      if(body.localOnly===true&&!sourceCopy){
        return wantsCopy?stopped(copyReason||'local_only'):json(res,200,{ok:true,sourceCopy:null});
      }

      let cacheStatus='miss';
      let productRow=null;
      try{productRow=await store.loadProduct({itemCode,itemName,itemCaption:itemCaptionRaw});}
      catch(error){cacheStatus='unavailable';console.warn('room-ai product cache unavailable',error?.message||'unknown');}

      if(wantsCopy&&productRow&&!productRow.raw_ai_json&&productRow.result_status==='unknown')
        return stopped('previous_result_not_publishable');
      if(!sourceCopy&&productRow?.raw_ai_json){
        const validation=validateAiExtraction(productRow.raw_ai_json,{itemName,itemCaption},{imageAvailable:Boolean(productRow.raw_ai_json?.imageProductTypeHint)});
        const negative=productRow.result_status==='unknown';
        const previouslySent=productRow.model!=='local'||negative;
        if(wantsCopy&&previouslySent){
          const cachedName=validation.productType?.value;
          const trustedName=local?.validation.productType?.value||declaredProductName(item);
          const draft=cachedName&&cachedName===trustedName&&composeSourceCopy(item,cachedName,{providerEvidence:true});
          const approved=!negative&&draft&&matchesApprovedCopy(productRow.raw_ai_json,validation,draft);
          if(!approved)return stopped('previous_result_not_publishable');
          return json(res,200,{ok:true,copyStatus:'ready',sourceCopy:draft,validation,
            route:{route:'cache',groqCalls:0},cache:{hit:true,status:'hit'}});
        }
        if(!wantsCopy&&(negative || validation?.productType?.valid===true)){
          const route=legacy.logAiRoute('cache',{groqCalls:0,cacheStatus:'hit',model:productRow.model||DEFAULT_MODEL,mode:validation.mode,negative});
          return json(res,200,responseBase({
            model:productRow.model||DEFAULT_MODEL,
            rawAiJson:productRow.raw_ai_json,
            validation,
            route,
            cache:{hit:true,status:'hit',negative}
          }));
        }
        cacheStatus='revalidate_miss';
      }

      if(local&&(!wantsCopy||sourceCopy)){
        let stored=false;
        // The existing cache folds whitespace, so it cannot certify a
        // product identity that depends on the original field boundaries.
        try{
          if(!layoutBound){
            await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:'local',promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:local.raw,resultStatus:'ok'});
            stored=true;
          }
        }catch(error){console.warn('room-ai local cache write unavailable',error?.message||'unknown');}
        const route=legacy.logAiRoute('local',{groqCalls:0,cacheStatus,model:'local',mode:local.validation.mode,localVersion:local.version});
        return json(res,200,{...responseBase({
          model:'local',
          rawAiJson:local.raw,
          validation:local.validation,
          route,
          cache:{hit:false,status:cacheStatus,stored},
          sourceCopy,
          sourceEvidenceStatus:extractEvidence({...item,identity:local.validation.productType.value}).status
        }),...(wantsCopy?{copyStatus:'ready'}:{})});
      }

      let draft=null;
      if(wantsCopy){
        const declared=declaredProductName(item);
        const localName=local?.validation.productType?.value;
        const trustedName=localName||declared;
        if(!trustedName||(declared&&localName&&declared!==localName)||
          hasAccessoryScope(itemName,trustedName)||!itemCaptionRaw.trim())
          return stopped('source_scope_unconfirmed');
        draft=composeSourceCopy(item,trustedName,{providerEvidence:true});
        if(!draft||itemCaptionRaw.length>3000)return stopped('source_use_unconfirmed');
        if(cacheStatus==='unavailable')return stopped('prior_result_unconfirmed');
      }
      const apiKey=String(process.env.GROQ_API_KEY||'').trim();
      const plan=groqPlan();
      if(!plan)return stopped('groq_plan_unconfirmed');
      const paidPolicy=plan==='paid'?paidCapacityPolicy({key:apiKey}):null;
      if(plan==='paid'&&!paidPolicy)return stopped('paid_budget_unconfirmed');
      if(paidPolicy&&legacy.roomInputBytes({...item,itemCaption:wantsCopy?itemCaptionRaw:modelCaption,copyReview:wantsCopy})>5800)
        return stopped('paid_input_budget_exceeded');
      if(plan==='free'&&wantsCopy&&(!apiKey||!hasFreeEvidence(apiKey)))return stopped('free_evidence_unconfirmed');
      if(!apiKey) return json(res,503,{message:'GROQ_API_KEY is not configured'});
      const model=DEFAULT_MODEL;
      const started=Date.now();
      const textAi=await capacityGate({
        req,authorization:auth,apiKey,model,paidPolicy,
        db:deps.capacityDb||makeRuntimeCapacityDb({productionDb:db}),
        authenticateSearchUser:deps.authenticateSearchUser,
        item:{itemCode,itemName,itemCaption:itemCaptionRaw,modelCaption:wantsCopy?itemCaptionRaw:modelCaption,itemPrice,
          catchcopy:String(body.catchcopy||''),copyReview:wantsCopy},
        callAI
      });
      const textValidation=validateAiExtraction(textAi.raw,{itemName,itemCaption},{imageAvailable:false});
      const textElapsedMs=Date.now()-started;

      if(wantsCopy){
        const approved=matchesApprovedCopy(textAi?.raw,textValidation,draft);
        try{
          await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model,promptVersion:PROMPT_VERSION,
            schemaVersion:'room_product_facts_v1',rawAiJson:approved?textAi.raw:null,resultStatus:approved?'ok':'unknown'});
        }catch{
          return stopped('provider_result_save_unconfirmed');
        }
        if(!approved)return stopped('provider_candidate_rejected');
        return json(res,200,{ok:true,copyStatus:'ready',sourceCopy:draft,validation:textValidation,
          route:{route:'text',groqCalls:1}});
      }

      if(textValidation?.productType?.valid===true && ['simple','simple_partial'].includes(textValidation.mode)){
        try{await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:textAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:textAi.raw,resultStatus:'ok'});}catch(error){console.warn('room-ai product cache write unavailable',error?.message||'unknown');}
        const route=legacy.logAiRoute('text',{groqCalls:1,cacheStatus,model:textAi.model||model,elapsedMs:textElapsedMs,mode:textValidation.mode,usage:textAi.usage||null,rateLimit:textAi.rateLimit||{}});
        return json(res,200,responseBase({
          model:textAi.model||model,usage:textAi.usage||null,elapsedMs:textElapsedMs,
          rawAiJson:textAi.raw,validation:textValidation,route,
          stages:{textOnly:true,imageAttempted:false,textElapsedMs,imageElapsedMs:0},
          cache:{hit:false,status:cacheStatus}
        }));
      }

      // An inconclusive text evaluation is terminal for this request:
      // no image-model escalation, no second Groq call, no hidden retry.
      try{
        await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,
          model:textAi.model||model,promptVersion:PROMPT_VERSION,
          schemaVersion:'room_product_facts_v1',rawAiJson:textAi.raw,
          resultStatus:'unknown'});
      }catch(error){
        console.warn('room-ai negative cache write unavailable',error?.message||'unknown');
      }
      const route=legacy.logAiRoute('text',{
        groqCalls:1,cacheStatus,model:textAi.model||model,
        elapsedMs:textElapsedMs,mode:textValidation.mode,
        inconclusive:true,imageAttempted:false
      });
      return json(res,200,responseBase({
        model:textAi.model||model,usage:textAi.usage||null,
        elapsedMs:textElapsedMs,rawAiJson:textAi.raw,
        validation:textValidation,route,
        stages:{textOnly:true,imageAttempted:false,secondProviderAttempt:false,
          textElapsedMs,imageElapsedMs:0},
        cache:{hit:false,status:cacheStatus,negativeStored:true}
      }));
    }catch(error){
      const timeout=error?.name==='AbortError'||/timeout|aborted/i.test(String(error?.message||''));
      const capacityBlocked=error?.capacityPreDispatch===true;
      const usageUnconfirmed=String(error?.message||'').includes('_no_retry');
      const rateLimited=error?.status===429;
      // No capacity error is a generic AI failure. Tell the UI to stop,
      // without exposing DB identifiers, tokens, secrets or provider payloads.
      const status=capacityBlocked||usageUnconfirmed?503:rateLimited?429:timeout?504:502;
      console.error('room-ai router failed',JSON.stringify({
        category:capacityBlocked?'capacity_denied':usageUnconfirmed?'capacity_halted':
          rateLimited?'rate_limited':timeout?'timeout':'provider_error',
        status
      }));
      return json(res,status,{
        message:capacityBlocked?'安全なAI利用枠を確認できないため生成を停止しました。':
          usageUnconfirmed?'AIの利用量を確定できないため再送せず停止しました。':
          rateLimited?'AIの利用上限に達したため生成を停止しました。':
          timeout?'AI分析が時間内に完了しませんでした。':'AI分析に失敗しました。',
        fallback:true,
        retryAllowed:false
      });
    }
  };
}

module.exports={
  createHandler,
  resolveLocalUnderstanding,
  resolveSourceUnderstanding,
  hasAccessoryScope
};
