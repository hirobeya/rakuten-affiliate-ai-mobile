'use strict';
const {createHash}=require('node:crypto');
const {generate}=require('../manual-room-copy');
const {localZeroCall}=require('../../api/room-ai-v3');
const {structuredRequestBody}=require('../super-urenavi-v3-groq');
const {estimate,stageRequest,sourceEvidenceHints,DEFAULT_MODEL}=require('../room-semantic-provider');
const {inspect:inspectRelations}=require('./source-purchase-relations');
const {inspect,publication}=require('../room-semantic-contract');
const {validSchema}=require('./contracts');

const MODEL=DEFAULT_MODEL;
const STUDY_ID='urenavi-fixed-20-abc-20261120';
const CAPS={writer:2000,review:2000,perCall:8000};
const SETUP={model:MODEL,transport:'chat',reasoningEffort:'medium',temperature:0.2,
 maxWriterOutput:CAPS.writer,maxReviewOutput:CAPS.review,maximumAttemptsPerStage:1};
const AXES=['identity','specificity','purchase_reason','scene_and_value','natural_japanese','source_accuracy'];
const UNKNOWN=()=>Object.fromEntries(AXES.map(axis=>[axis,'unmeasured']));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function attemptId(record,arm,stage){
 // Stable per study/input/arm/stage even if a request is re-serialized.
 // Reserve this exact ID through v2 to prevent a replay of the stage.
 const digest=hash([STUDY_ID,record.item.itemCode,record.sourceHash,arm,stage]);
 return digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-8'+digest.slice(17,20)+'-'+digest.slice(20,32);
}

function fixedInputs(index,records){
 if(!Array.isArray(index)||!Array.isArray(records)||index.length!==records.length
   ||new Set(records.map(x=>x.item.itemCode)).size!==index.length)throw Error('frozen_input_count_or_duplicate');
 const byCode=new Map(records.map(row=>[row.item.itemCode,row]));
 return index.map(row=>{
  const record=byCode.get(row.itemCode),i=record?.item;
  if(!i||record.category!==row.category||hash([i.itemName,i.itemCaption,i.itemPrice])!==row.inputSha256)
   throw Error('frozen_input_mismatch:'+row.itemCode);
  // The snapshot index predates catchcopy. Exclude it consistently from all
  // arms so the full effective input is covered by the fixed hash.
  return {category:row.category,item:{itemCode:i.itemCode,itemName:i.itemName,itemCaption:i.itemCaption,itemPrice:i.itemPrice},sourceHash:row.inputSha256};
 });
}
function evidenceFor(item){
 const diagnostics={};
 localZeroCall(item,'',diagnostics,{editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
 if(diagnostics.stage==='identity')return {};
 const {rule,literal}=diagnostics.identityCandidates||{};
 const identities=[diagnostics.identity,rule&&rule===literal?rule:null].filter(x=>x&&item.itemName.includes(x));
 for(const identity of new Set(identities)){
  const exact=sourceEvidenceHints(item,{partnerProductType:identity});
  const relations=inspectRelations(item,identity).slice(0,2).map(r=>({
   kind:r.kind,subject:r.subject,feature:r.feature,benefit:r.benefit,scene:r.scene,
   sourceSpans:r.evidence,publicationApproved:false
  }));
  if(exact.length||relations.length)return {
   ...(exact.length?{sourceEvidenceHints:exact}:{}),...(relations.length?{linkedSourceEvidence:relations}:{})
  };
 }
 return {};
}
function request(stage,item,{hints={},draft,machine}={}){
 const review=stage==='verify';
 const data=stageRequest(stage,item,review?{draft,machine}:{partnerKnowledge:false});
 const body=structuredRequestBody({...data,model:MODEL,transport:SETUP.transport,reasoningEffort:SETUP.reasoningEffort,
  maxOutputTokens:review?CAPS.review:CAPS.writer,
  userPayload:review?data.userPayload:{itemName:item.itemName,itemCaption:item.itemCaption,...hints}});
 return {body,requestHash:hash(body),reservation:estimate(body,body.max_completion_tokens)};
}
const minimumDraft={product:{what:'品',acts_on:'物',acts_on_quote:''},sentences:[{text:'品。',quotes:[],kinds:['spec']}]};

function prepareArm(record,arm){
 if(arm!=='B'&&arm!=='C')throw Error('invalid_comparison_arm');
 const {item}=record;
 const hints=arm==='C'?evidenceFor(item):{};
 const writer=request('generate',item,{hints});
 const hasEvidence=Object.keys(hints).length>0;
 const minimumReview=request('verify',item,{draft:minimumDraft,machine:{flags:[]}});
 const stop=arm==='C'&&!hasEvidence?'no_distinct_grounded_hints':
  writer.reservation>CAPS.perCall?'writer_over_reference_window':
   minimumReview.reservation>CAPS.perCall?'review_input_over_reference_window':null;
 return {arm,writer,stop,hasEvidence,minimumReviewReservation:minimumReview.reservation,
  attemptIds:{writer:attemptId(record,arm,'generate'),review:attemptId(record,arm,'verify')}};
}
function prepareReview(record,prepared,draft){
 if(prepared.stop)return {ok:false,reason:prepared.stop,request:null};
 if(!validSchema(draft,prepared.writer.body.response_format.json_schema.schema))
  return {ok:false,reason:'invalid_writer_schema',request:null};
 const machine=inspect(record.item,draft);
 if(!machine.ok)return {ok:false,reason:'mechanical_gate_blocked',failures:machine.failures,request:null};
 const review=request('verify',record.item,{draft,machine});
 if(review.reservation>CAPS.perCall)return {ok:false,reason:'review_over_reference_window',request:null};
 return {ok:true,request:review};
}
function observedMetrics(usage){
 return Number.isSafeInteger(usage?.input)&&usage.input>=0&&Number.isSafeInteger(usage?.output)&&usage.output>=0
  &&Number.isFinite(usage?.elapsedMs)&&usage.elapsedMs>=0?{input:usage.input,output:usage.output,elapsedMs:usage.elapsedMs,totalTokens:usage.input+usage.output}:null;
}
function assessStored(record,prepared,receipt){
 const blank={quality:UNKNOWN(),text:null,publication:'unmeasured',usage:null,latencyMs:null};
 if(!receipt)return {...blank,status:'unmeasured',reason:prepared.stop||'no_comparable_saved_response'};
 if(prepared.stop||receipt.arm!==prepared.arm||receipt.itemCode!==record.item.itemCode
   ||receipt.sourceHash!==record.sourceHash||receipt.model!==MODEL
   ||receipt.writerRequestHash!==prepared.writer.requestHash)
  return {...blank,status:'unmeasured',reason:'saved_response_conditions_do_not_match'};
 const draft=receipt.draft;
 const review=prepareReview(record,prepared,draft);
 const text=validSchema(draft,prepared.writer.body.response_format.json_schema.schema)
  ?draft.sentences.map(s=>s.text).join('\n\n'):null;
 if(!review.ok){
  const blocked=['invalid_writer_schema','mechanical_gate_blocked','review_over_reference_window'].includes(review.reason);
  return {...blank,status:'writer_replayed',text,publication:blocked?'blocked':'unmeasured',
   reason:review.reason,mechanicalFailures:review.failures??[],usage:{writer:observedMetrics(receipt.writerUsage),review:null}};
 }
 if(receipt.reviewRequestHash!==review.request.requestHash||receipt.reviewModel!==MODEL
   ||!validSchema(receipt.review,review.request.body.response_format.json_schema.schema))
  return {...blank,status:'writer_replayed',text,publication:'blocked',reason:'matching_separate_review_missing',
   usage:{writer:observedMetrics(receipt.writerUsage),review:null}};
 const decision=publication(record.item,draft,receipt.review);
 const writer=observedMetrics(receipt.writerUsage),reviewUsage=observedMetrics(receipt.reviewUsage);
 return {...blank,status:'replayed',text:decision.text||text,publication:decision.status,reason:null,
  publicationFailures:decision.reasons,usage:{writer,review:reviewUsage},
  latencyMs:writer&&reviewUsage?writer.elapsedMs+reviewUsage.elapsedMs:null};
}
function pinnedEvaluation(text,evaluation){
 if(!text||!evaluation||evaluation.textHash!==hash(text)||!['assistant','independent_human'].includes(evaluation.author))
  return {quality:UNKNOWN(),qualityReview:null};
 const allowed=new Set(['pass','fail','unmeasured']);
 const quality=Object.fromEntries(AXES.map(axis=>[axis,allowed.has(evaluation.axes?.[axis])?evaluation.axes[axis]:'unmeasured']));
 return {quality,qualityReview:{author:evaluation.author,reason:evaluation.reason??null}};
}
function costUpperBound(inputAndOutput,maxOutput,rates){
 if(!Number.isFinite(rates?.inputPerMillion)||rates.inputPerMillion<0||
   !Number.isFinite(rates?.outputPerMillion)||rates.outputPerMillion<0)return null;
 return ((inputAndOutput-maxOutput)*rates.inputPerMillion+
  maxOutput*Math.max(rates.inputPerMillion,rates.outputPerMillion))/1e6;
}
function prepareReport(index,inputs,{receipts=[],evaluations=[],rates}={}){
 const records=fixedInputs(index,inputs);
 const byKey=list=>{
  const result=new Map();
  for(const row of list){
   const key=row.itemCode+'|'+row.arm;
   if(result.has(key))throw Error('duplicate_comparison_record:'+key);
   result.set(key,row);
  }
  return result;
 };
 const saved=byKey(receipts),grades=byKey(evaluations);
 const rows=records.map(record=>{
  const local=generate(record.item);
  const {itemCode}=record.item;
  const grade=(arm,text)=>pinnedEvaluation(text,grades.get(itemCode+'|'+arm));
  const a={status:'offline_run',text:local?.text??null,implementation:local?.path??null,
   publication:local?'ready':'blocked',...grade('A',local?.text),usage:{totalTokens:0},latencyMs:null};
  const ai=Object.fromEntries(['B','C'].map(arm=>{
   const p=prepareArm(record,arm);
   const replay=assessStored(record,p,saved.get(itemCode+'|'+arm));
   const ceiling=p.stop?null:costUpperBound(p.writer.reservation+CAPS.perCall,CAPS.writer+CAPS.review,rates);
   return [arm,{...replay,...grade(arm,replay.text),plan:{stop:p.stop,writerRequestHash:p.writer.requestHash,attemptIds:p.attemptIds,
    writerReservation:p.writer.reservation,minimumReviewReservation:p.minimumReviewReservation,
    reviewReservationCeiling:CAPS.perCall,maxCalls:p.stop?0:2,pricedCeilingUsd:ceiling}}];
  }));
  return {itemCode,category:record.category,sourceHash:record.sourceHash,A:a,...ai};
 });
 const summarize=arm=>{
  const ai=arm!=='A';
  const armRows=rows.map(row=>row[arm]);
  const plans=ai?armRows.map(row=>row.plan).filter(plan=>!plan.stop):[];
  const grades=armRows.map(row=>Object.values(row.quality));
  return {total:armRows.length,texts:armRows.filter(row=>row.text!==null).length,
   publicationReady:armRows.filter(row=>row.publication==='ready').length,
   publicationBlocked:armRows.filter(row=>row.publication==='blocked').length,
   publicationUnmeasured:armRows.filter(row=>row.publication==='unmeasured').length,
   qualityPass:grades.filter(g=>g.every(x=>x==='pass')).length,
   qualityFail:grades.filter(g=>g.includes('fail')).length,
   qualityUnmeasured:grades.filter(g=>!g.includes('fail')&&g.includes('unmeasured')).length,
   ...(ai?{plannedWriterCalls:plans.length,writerReservations:plans.reduce((a,p)=>a+p.writerReservation,0),
    reviewReservationCeilings:plans.length*CAPS.perCall,pricedCeilingUsd:plans.some(p=>p.pricedCeilingUsd===null)?null:
     plans.reduce((a,p)=>a+p.pricedCeilingUsd,0)}:{})};
 };
 const summary=Object.fromEntries(['A','B','C'].map(arm=>[arm,summarize(arm)]));
 const paired=rows.filter(row=>!row.B.plan.stop&&!row.C.plan.stop);
 const planned=rows.flatMap(row=>[row.B.plan,row.C.plan]).filter(plan=>!plan.stop);
 return {studyId:STUDY_ID,setup:SETUP,referenceCeiling:CAPS.perCall,currentAvailableCapacity:null,liveAuthorized:false,
  summary,paired:{itemCodes:paired.map(r=>r.itemCode),
   maximumCalls:paired.length*4,reservation:paired.reduce((sum,r)=>sum+r.B.plan.writerReservation+r.C.plan.writerReservation+2*CAPS.perCall,0),
   pricedCeilingUsd:paired.some(r=>r.B.plan.pricedCeilingUsd===null||r.C.plan.pricedCeilingUsd===null)?null:
    paired.reduce((sum,r)=>sum+r.B.plan.pricedCeilingUsd+r.C.plan.pricedCeilingUsd,0)},
  totals:{maximumCalls:planned.length*2,plannedWriterCalls:planned.length,maximumReviewCalls:planned.length,
   writerReservations:planned.reduce((a,p)=>a+p.writerReservation,0),reviewReservationCeilings:planned.length*CAPS.perCall,
   pricedCeilingUsd:planned.some(p=>p.pricedCeilingUsd===null)?null:planned.reduce((a,p)=>a+p.pricedCeilingUsd,0)},
  rows};
}
module.exports={AXES,MODEL,CAPS,hash,fixedInputs,prepareArm,prepareReview,assessStored,prepareReport};
