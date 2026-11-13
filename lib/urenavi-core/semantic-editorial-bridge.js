'use strict';
// Offline-only proof of how to hand a grounded buyer decision to the
// already-existing raw-source AI writer. No transport, keys, stores or UI.
const {prepare,hash,freeze}=require('../room-writer-raw/source');
const RawV2=require('../room-writer-raw/contract-v2');
const {plan:makePlan}=require('./buyer-decision-plan');
const POLICY=Object.freeze({publication:false,copyable:false,semanticApproved:false,sendEnabled:false,automaticRetries:0});
const INSTRUCTIONS=[
 '編集者として商品原文を全体的に読み、販売単位と適用条件を先に判断する。下記の購入理由候補を結論として盲信せず、原文に照らして採否を決める。',
 '優先するのは原文が裏づける特徴から一つの具体的な選択理由を伝えること。単なる特徴一覧、「選ぶポイント」「商品説明には」などの機械的な結びを避ける。',
 'readerSituationは仮説であり、商品の効果・性能・対応用途の根拠ではない。使用場面を書くときは条件形にし、商品を使った体験や原文にない成果は作らない。',
 '関連商品、モデル別仕様、別売部品、数量条件、注意・否定・程度の解釈は原文を優先。曖昧な販売単位、対象や条件が解けなければ保留する。',
 '購入理由候補の特徴引用は参考にとどめ、必ず元の商品原文から最適な特徴を再評価し、既存スキーマどおり全事実の根拠を示す。元のStrict JSONスキーマは変更しない。'
].join('\n');
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
