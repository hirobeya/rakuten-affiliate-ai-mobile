'use strict';

// Calculation only. Quote certification and text approval remain separate;
// the plan does not reserve capacity or authorize provider transport.
function planLinkedSourceComparison({identity,relations,requiredTokens,rates,limits}={}){
 if(typeof identity!=='string'||!identity||!Array.isArray(relations)||!relations.length
   ||typeof requiredTokens!=='function')return {eligible:false,reason:'source_or_estimator_missing'};
 const reserve=requiredTokens(relations);
 if(!Number.isSafeInteger(reserve)||reserve<=0||!Number.isSafeInteger(limits?.remainingRequests)
   ||!Number.isSafeInteger(limits?.remainingTokens)||limits.remainingRequests<1||limits.remainingTokens<reserve)
  return {eligible:false,reason:'capacity_unverified_or_insufficient'};
 const input=rates?.inputPerMillion,output=rates?.outputPerMillion;
 if(!Number.isFinite(input)||input<0||!Number.isFinite(output)||output<0)
  return {eligible:false,reason:'price_unverified'};
 return {eligible:true,reservedTokens:reserve,requests:1,maxCost:reserve*Math.max(input,output)/1e6};
}
module.exports={planLinkedSourceComparison};
