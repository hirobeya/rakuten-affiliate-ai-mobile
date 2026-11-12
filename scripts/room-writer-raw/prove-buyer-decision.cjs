'use strict';
// Offline, repeatable evidence proof. Uses committed seller source captures only.
// Never connects to Groq, Vercel production, billing, DB or external services.
const path=require('node:path');
const {plan}=require('../../lib/urenavi-core/buyer-decision-plan');
const {generate}=require('../../lib/urenavi-core/last-resort');

const base=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products');
const selected=[3,4,5,6];
const rows=selected.map(i=>{
 const item=require(path.join(base,String(i).padStart(2,'0')+'.json')).source;
 const old=generate(item,{experimentalNarrativeDraft:true});
 const result=plan(item,{identity:old.narrativeDraft?.identity});
 return {itemCode:item.itemCode,identity:result.identity,status:result.status,
  planStrength:result.selectedDecision?.planStrength,
  readyForDraftComparison:result.selectedDecision?.readyForDraftComparison,
  decision:result.selectedDecision?.purchaseQuestion,
  hypotheticalScene:result.selectedDecision?.hypotheticalScene,
  evidence:result.selectedDecision?.evidence,
  cautions:result.selectedDecision?.cautions,
  knowledgeStatus:result.knowledge?.status,
  sourceVerified:result.proof?.sellerFeatureQuotesVerified,
  sellingUnitVerified:result.proof?.sellingUnitOwnershipVerified,
  publication:result.publication,copyable:result.copyable};
});
process.stdout.write(JSON.stringify({experiment:'buyer-decision-plan-v1',providerCalls:0,rows},null,2)+'\n');
if(rows.length!==4||rows.some(r=>r.status!=='plan_for_review'||r.publication||r.copyable))process.exitCode=1;
