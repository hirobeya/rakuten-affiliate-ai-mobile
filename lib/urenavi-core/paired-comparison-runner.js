'use strict';
const {verify}=require('node:crypto');
const {fixedInputs,prepareArm,prepareReview,assessStored,MODEL,CAPS,hash}=require('./generation-comparison');
const {createCapacityV2}=require('./multitenant-capacity-v2-adapter');
const {resolveCapacityIdentity}=require('./multitenant-paid-identity');
const {validSchema}=require('./contracts');
const {officialWindows}=require('./official-capacity-evidence');
const manifest=require('../../docs/evaluations/20261120-multi-sentence/frozen-index.json');
const plan=require('../../docs/evaluations/20261120-ai-comparison/offline-report.json');
const TIMEOUT_MS=10000;
const SHA=/^[a-f0-9]{64}$/;
const STOP=reason=>({status:'stopped',reason});
const nowIso=now=>new Date(now).toISOString();

function signed(envelope,key){
 try{return envelope?.payload&&typeof envelope.signature==='string'&&
  verify(null,Buffer.from(JSON.stringify(envelope.payload)),key,Buffer.from(envelope.signature,'base64'))?
  envelope.payload:null;}
 catch{return null;}
}
function expectedApproval(executionSha,tenant,account,study=plan){
 return {
  executionSha,tenant,account,studyId:study.studyId,model:MODEL,setup:study.setup,
  maxCalls:study.paired.maximumCalls,maximumReservation:study.paired.reservation,
  pricedCeilingUsd:study.paired.pricedCeilingUsd,
  slots:study.rows.filter(row=>study.paired.itemCodes.includes(row.itemCode)).flatMap(row=>['B','C'].map(arm=>({
   itemCode:row.itemCode,arm,sourceHash:row.sourceHash,writerRequestHash:row[arm].plan.writerRequestHash,
   attemptIds:row[arm].plan.attemptIds,writerReservation:row[arm].plan.writerReservation,reviewCeiling:CAPS.perCall
  })))
 };
}
const validEvidence=(e,account,now,estimate)=>officialWindows(e,account,now,estimate,TIMEOUT_MS);

// Isolated wiring only. Every runtime dependency and public key is supplied
// by a trusted server operator. There is no normal application entry point.
function createPairedComparisonRunner(options){
 return createComparisonRunner(options,manifest,plan);
}
function createComparisonRunner({inputs,environment,executionSha,account,db,authenticateSearchUser,authorize,
 journal,approvalKey,evidenceKey,readEvidence,transport,now=Date.now}={},index,study){
 if(environment!=='isolated')throw Error('isolated_comparison_required');
 if(!/^[a-f0-9]{40}$/.test(executionSha||'')||!account?.organization||!account?.project||!SHA.test(account.credentialSha256||'')
   ||!approvalKey||!evidenceKey||typeof authorize!=='function'||typeof readEvidence!=='function'
   ||typeof transport!=='function'||!journal?.create||!journal?.read||!journal?.lock)throw Error('comparison_runtime_not_configured');
 const records=fixedInputs(index,inputs);
 const capacity=createCapacityV2({db,authenticateSearchUser});
 let active=false;
 return {async run({req,approvalEnvelope,itemCode,arm,stage}){
  if(active)return STOP('execution_in_progress');
  active=true;
  let release;
  try{
   release=await journal.lock();
   const authorization=await authorize(req);
   const identity=await resolveCapacityIdentity(req,authorization,{authenticateSearchUser});
   if(!identity.ok||identity.plan!=='owner')return STOP('owner_required');
   const scope=expectedApproval(executionSha,identity.user.id,account,study);
   const approval=signed(approvalEnvelope,approvalKey);
   if(!approval||hash(approval.scope)!==hash(scope)||!SHA.test(approval.approvalId||'')
    ||!(Date.parse(approval.expiresAt)>now()))return STOP('approval_invalid_or_expired');
   const slot=scope.slots.find(s=>s.itemCode===itemCode&&s.arm===arm);
   if(!slot||!['generate','verify'].includes(stage))return STOP('outside_paired_scope');
   if(hash(approval.target??null)!==hash({itemCode,arm,stage}))return STOP('stage_not_approved');
   for(const s of scope.slots){
    for(const id of Object.values(s.attemptIds)){
     const recovered=await journal.read(id+'-recovered');
     if(await journal.read(id+'-halt')&&!recovered)return STOP('study_halted');
     if(await journal.read(id+'-claim')&&!await journal.read(id+'-terminal')&&!recovered)
      return STOP('unresolved_prior_claim');
    }
   }
   const record=records.find(r=>r.item.itemCode===itemCode);
   const prepared=prepareArm(record,arm);
   if(prepared.stop||prepared.writer.requestHash!==slot.writerRequestHash
    ||prepared.writer.reservation!==slot.writerReservation||hash(prepared.attemptIds)!==hash(slot.attemptIds))
    return STOP('fixed_plan_mismatch');
   let request=prepared.writer;
   let previous;
   const id=stage==='generate'?slot.attemptIds.writer:slot.attemptIds.review;
   if(await journal.read(id+'-claim'))return STOP('duplicate_attempt');
   if(stage==='verify'){
    previous=await journal.read(slot.attemptIds.writer+'-result');
    const terminal=await journal.read(slot.attemptIds.writer+'-terminal');
    if(!previous||terminal?.status!=='completed'||
     previous.requestHash!==slot.writerRequestHash)return STOP('matching_settled_writer_required');
    const review=prepareReview(record,prepared,previous.raw);
    if(!review.ok)return STOP(review.reason);
    request=review.request;
   }

   const approvalFile='approval-'+approval.approvalId;
   const oldApproval=await journal.read(approvalFile);
   if(oldApproval&&hash(oldApproval)!==hash(approvalEnvelope))return STOP('approval_id_reused');
   if(!oldApproval)await journal.create(approvalFile,approvalEnvelope);
   const evidenceEnvelope=await readEvidence({account,model:MODEL,tenant:identity.user.id});
   const evidence=signed(evidenceEnvelope,evidenceKey);
   const windows=validEvidence(evidence,account,now(),request.reservation);
   if(!windows)return STOP('official_capacity_unverified_or_insufficient');
   // Claim the stage and the capacity observation before attempting a durable
   // DB intent. A lost receipt never creates permission to send or retry.
   await journal.create(id+'-claim',{requestHash:request.requestHash,approvalId:approval.approvalId,
    stage,arm,itemCode,claimedAt:nowIso(now()),estimatedTokens:request.reservation});
   await journal.create('evidence-'+evidence.artifactSha256,evidenceEnvelope);
   const lease=await capacity.reserve({req,authorization,model:MODEL,item:record.item,stage,
    estimate:request.reservation,comparison:{attemptId:id,verifiedAt:evidence.verifiedAt,
     ...windows,evidenceHash:evidence.artifactSha256}});
   if(!lease){
    await journal.create(id+'-terminal',STOP('reservation_not_confirmed'));
    return STOP('reservation_not_confirmed');
   }
   if(!(Date.parse(approval.expiresAt)>now()+TIMEOUT_MS)
    ||!validEvidence(evidence,account,now(),request.reservation)){
    await journal.create(id+'-terminal',STOP('evidence_or_approval_expired_before_intent'));
    return STOP('evidence_or_approval_expired_before_intent');
   }
   if(!await lease.markSendIntent()){
    await journal.create(id+'-halt',{reason:'durable_send_intent_unconfirmed',at:nowIso(now())});
    return STOP('durable_send_intent_unconfirmed');
   }
   // The DB is authoritative. Keep the sent hold on any unexpected failure.
   if(!(Date.parse(approval.expiresAt)>now()+TIMEOUT_MS)||!validEvidence(evidence,account,now(),request.reservation))
    return await halt(lease,id,'evidence_or_approval_expired_before_transport');
   try{
    const started=now();
    const response=await transport(request.body);
    const spent=actualUsage(response.usage);
    const recordValue={requestHash:request.requestHash,approvalId:approval.approvalId,status:response.status,model:response.model,
     providerRequestId:response.providerRequestId,raw:response.raw,usage:spent,elapsedMs:now()-started};
    await journal.create(id+'-result',recordValue);
    if(response.status===429)return await halt(lease,id,'provider_rate_limited',429);
    if(response.status!==200||response.model!==MODEL||!response.providerRequestId||!spent)
     return await halt(lease,id,'provider_outcome_or_usage_unknown');
    if(spent.output>request.body.max_completion_tokens||spent.total>request.reservation){
     // Keep the real usage when known. An overrun trips v2 or the study stop.
     await lease.settle({status:200,actualTokens:spent.total});
     await journal.create(id+'-halt',{reason:'reservation_or_output_overrun',at:nowIso(now())});
     return STOP('reservation_or_output_overrun');
    }
    if(!await lease.settle({status:200,actualTokens:spent.total})){
     await journal.create(id+'-halt',{reason:'settlement_unconfirmed',at:nowIso(now())});
     return STOP('settlement_unconfirmed');
    }
    const schema=request.body.response_format.json_schema.schema;
    let publication=null;
    const valid=validSchema(response.raw,schema);
    if(stage==='verify'&&valid){
     publication=assessStored(record,prepared,{arm,itemCode,sourceHash:record.sourceHash,model:MODEL,
      reviewModel:MODEL,writerRequestHash:prepared.writer.requestHash,reviewRequestHash:request.requestHash,
      draft:previous.raw,review:response.raw});
    }
    await journal.create(id+'-terminal',{status:valid?'completed':'rejected',publication});
    return {status:valid?'completed':'rejected',publication,attemptId:id};
   }catch{
    return await halt(lease,id,'transport_or_persistence_failure');
   }
  }catch{return STOP('journal_or_runtime_unavailable');}
  finally{try{await release?.();}catch{}active=false;}
 },async recover({req,recoveryEnvelope}){
  if(active)return STOP('execution_in_progress');
  active=true;
  let release;
  try{
   release=await journal.lock();
   const authorization=await authorize(req);
   const identity=await resolveCapacityIdentity(req,authorization,{authenticateSearchUser});
   if(!identity.ok||identity.plan!=='owner')return STOP('owner_required');
   const r=signed(recoveryEnvelope,evidenceKey);
   const scope=expectedApproval(executionSha,identity.user.id,account,study);
   const windows=validEvidence(r,account,now(),1);
   if(!r||r.executionSha!==executionSha||r.tenant!==identity.user.id||r.studyId!==scope.studyId
    ||r.reconciled!==true||!windows)return STOP('recovery_evidence_invalid');
   const unresolved=[];
   for(const s of scope.slots)for(const id of Object.values(s.attemptIds)){
    if(await journal.read(id+'-recovered'))continue;
    if(await journal.read(id+'-halt')||(await journal.read(id+'-claim')&&!await journal.read(id+'-terminal')))unresolved.push(id);
   }
   if(!unresolved.length||hash(r.attemptIds)!==hash(unresolved))return STOP('recovery_scope_mismatch');
   await journal.create('recovery-'+r.artifactSha256,recoveryEnvelope);
   const reopened=await db('rpc/urenavi_capacity_comparison_resume_v2',{method:'POST',
    body:JSON.stringify({p_evidence_hash:r.artifactSha256,p_verified_at:r.verifiedAt,p_counters:windows.counters})});
   if(reopened!==true)return STOP('recovery_not_confirmed');
   for(const id of unresolved)await journal.create(id+'-recovered',{evidenceHash:r.artifactSha256});
   return {status:'recovered',attemptIds:unresolved};
  }catch{return STOP('recovery_persistence_or_database_unavailable');}
  finally{try{await release?.();}catch{}active=false;}
 }};
 async function halt(lease,id,reason,status){
  const settled=await lease.settle({status});
  try{await journal.create(id+'-halt',{reason,settled,at:nowIso(now())});}catch{}
  return STOP(reason);
 }
}
function actualUsage(usage){
 const input=usage?.prompt_tokens,output=usage?.completion_tokens,total=usage?.total_tokens;
 if(![input,output,total].every(x=>Number.isSafeInteger(x)&&x>=0)||input+output!==total||total===0)return null;
 return {input,output,total};
}

// Exposed only for an isolated operator process. The runner receives a
// transport dependency so tests can exercise all states without credentials.
function createGroqComparisonTransport({apiKey,fetchImpl=fetch}={}){
 if(!apiKey)throw Error('isolated_groq_key_required');
 return async body=>{
  const controller=new AbortController();
  let timer;
  try{
   const call=async()=>{
    const response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
     method:'POST',redirect:'error',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
     body:JSON.stringify(body),signal:controller.signal
    });
    if(response.status!==200)return {status:response.status};
    const data=await response.json();
    let raw;
    try{raw=JSON.parse(data.choices?.[0]?.message?.content);}catch{raw=null;}
    return {status:200,model:data.model,providerRequestId:data.id,raw,usage:data.usage};
   };
   return await Promise.race([call(),new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(Error('comparison_timeout'));},TIMEOUT_MS);
   })]);
  }finally{clearTimeout(timer);}
 };
}
module.exports={createPairedComparisonRunner,createComparisonRunner,createGroqComparisonTransport,expectedApproval};
