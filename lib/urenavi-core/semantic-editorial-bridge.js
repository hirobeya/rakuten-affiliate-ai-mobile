'use strict';
// Offline-only proof of how to hand a grounded buyer decision to the
// already-existing raw-source AI writer. No transport, keys, stores or UI.
const {prepare,hash,freeze}=require('../room-writer-raw/source');
const RawV2=require('../room-writer-raw/contract-v2');
const {plan:makePlan}=require('./buyer-decision-plan');
const POLICY=Object.freeze({publication:false,copyable:false,semanticApproved:false,sendEnabled:false,automaticRetries:0});
// Raw v2 already contains the full source/scope/safety/JSON rules.
// This supplement only changes the editorial decision-making emphasis.
const INSTRUCTIONS='購入理由候補は商品事実ではない。必ず原文全体と販売単位・条件を優先し、根拠が弱ければ採用しない。特徴を羅列せず、確認できた一つの選択理由を自然に伝える。体験・効果を創作しない。';

function estimate(request){
 const text=JSON.stringify(request),nonAscii=(text.match(/[^\x00-\x7f]/g)||[]).length;
 return Math.ceil((text.length-nonAscii)/4+nonAscii*1.4+500);
}
function hold(reason,extra={}){return freeze({...POLICY,status:'held',reason,...extra});}
function prepareSemanticComparison(item,{identity,mode='normal'}={}){
 if(!['normal','batch'].includes(mode))return hold('invalid_mode');
 let envelope,bundle;
 try{envelope=prepare(item);bundle=RawV2.build(envelope);}
 catch{return hold('invalid_source_or_raw_contract');}
 if(bundle.held)return hold(bundle.reason||'raw_contract_held');
 const decision=makePlan(item,{identity});
 if(decision.status!=='plan_for_review')return hold('buyer_decision_not_ready');
 // The bridge does not turn a single generic benefit into false certainty.
 if(decision.selectedDecision.readyForDraftComparison!==true)
  return hold('buyer_decision_insufficient_for_comparison',{sourceHash:envelope.sourceHash});
 if(decision.sourceHash!==hash(Object.fromEntries(['itemCode','itemName','itemCaption','catchcopy'].map(k=>[k,item[k]]))))
  return hold('decision_source_mismatch');
 for(const e of [...decision.selectedDecision.evidence,...decision.selectedDecision.cautions]){
  if(!['itemName','itemCaption','catchcopy'].includes(e.source)||item[e.source]?.slice(e.at,e.at+e.quote.length)!==e.quote)
   return hold('decision_quote_mismatch');
 }
 const input=JSON.parse(bundle.request.messages[1].content);
 // Keep raw productData bytes/values untouched; advice is a separate field.
 input.editorialDecisionAid={
  trust:'unverified_reviewer_guidance_only',
  sellingUnitVerified:false,
  sceneIsProductFact:false,
  identity:decision.identity,
  choiceQuestion:decision.selectedDecision.purchaseQuestion,
  readerSituation:decision.selectedDecision.hypotheticalScene,
  evidence:decision.selectedDecision.evidence.map(e=>({field:e.source,quote:e.quote})),
  cautions:decision.selectedDecision.cautions.map(e=>({field:e.source,quote:e.quote})),
  avoidInventedBenefits:true
 };
 const request={
  ...bundle.request,
  messages:[
   {...bundle.request.messages[0],content:bundle.request.messages[0].content+'\n'+INSTRUCTIONS},
   {...bundle.request.messages[1],content:JSON.stringify(input)}
  ]
 };
 const inputEstimate=estimate(request),reservation=inputEstimate+request.max_completion_tokens;
 if(reservation>8000)return hold('comparison_request_over_free_tpm',{inputEstimate,reservation,sourceHash:envelope.sourceHash});
 return freeze({
  ...POLICY,status:'offline_comparison_prepared_not_authorized',version:'semantic-editorial-bridge-v1',
  sourceHash:envelope.sourceHash,decisionHash:hash(decision.selectedDecision),
  oldRawRequestHash:bundle.requestHash,newRequestHash:hash(request),
  inputEstimate,reservation,model:request.model,
  promptNote:'source-first semantic editorial evaluation; no actual model response',
  request
 });
}
module.exports={prepareSemanticComparison};
