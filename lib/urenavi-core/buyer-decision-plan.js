'use strict';
// A strict offline intermediate model: what is known vs what is only a
// plausible buyer priority. Not a copy generator and never a publication gate.
const {preview:sourceGrounding}=require('./grounded-local-recovery');
const {getDecisionKnowledge}=require('../product-decision-knowledge');
const {hash}=require('../room-writer-raw/source');

const POLICY=Object.freeze({publication:false,copyable:false,semanticApproved:false});
const AXIS={
 removable:{decision:'しまうときに取っ手を外せること',use:'片付け方を考える場面',group:'storage',weight:3},
 stackable:{decision:'重ねてしまえること',use:'収納方法を比較するとき',group:'storage',weight:4},
 heat:{decision:'IH・ガス火の対応範囲',use:'対応熱源を確認するとき',group:'compatibility',weight:3},
 care:{decision:'手洗いで手入れできること',use:'使用後のお手入れを考えるとき',group:'care',weight:3},
 caution:{decision:'洗濯機使用時のほつれリスク',use:'洗い方を決めるとき',group:'care',weight:4,limit:true},
 integrated:{decision:'充電ケーブルが内蔵されていること',use:'外出時のケーブル構成を選ぶとき',group:'charging',weight:4},
 remaining:{decision:'残量表示の有無',use:'充電残量の確認方法を比べるとき',group:'charging',weight:3},
 use:{decision:'収納場所や使用用途に合うこと',use:'置く場所と用途を考えるとき',group:'use',weight:3},
 dualuse:{decision:'収納以外の使用用途があること',use:'使い道を比較するとき',group:'use',weight:4},
 colors:{decision:'色の選択肢',use:'色を選ぶとき',group:'choice',weight:1}
};

function candidateGroups(evidence){
 const groups=new Map();
 for(const fact of evidence){
  const a=AXIS[fact.axis];
  if(!a)continue;
  if(!groups.has(a.group))groups.set(a.group,[]);
  groups.get(a.group).push({axis:fact.axis,quote:fact.quote,source:fact.source,at:fact.at,decision:a.decision,use:a.use,limit:!!a.limit,weight:a.weight});
 }
 return [...groups].map(([group,items])=>{
  const advantages=items.filter(i=>!i.limit),constraints=items.filter(i=>i.limit);
  const value=advantages.reduce((n,x)=>n+x.weight,0);
  const diversity=new Set(advantages.map(x=>x.axis)).size;
  return {group,items,advantages,constraints,score:value+(diversity>1?3:0),
    relationStatus:advantages.length>1?'multi_feature_grounded':'single_feature_only'};
 }).filter(x=>x.advantages.length>0).sort((a,b)=>b.score-a.score||a.group.localeCompare(b.group));
}
function plan(item,{identity}={}){
 const source=sourceGrounding(item,{identity});
 if(source?.status!=='proposed_requires_independent_review')
  return {...POLICY,status:'held',reason:source?.reason||'grounding_not_ready'};
 const facts=source.evidence;
 if(!facts.every(e=>item[e.source]?.slice(e.at,e.at+e.quote.length)===e.quote))
  return {...POLICY,status:'held',reason:'quote_alignment_failed'};
 const groups=candidateGroups(facts);
 if(!groups.length)return {...POLICY,status:'held',reason:'no_buyer_decision_relation'};
 const winner=groups[0],knowledge=getDecisionKnowledge(source.identity);
 // Note: category knowledge is a reasoning aid only, not the seller's claim.
 const comparable=groups.slice(1).map(g=>({group:g.group,score:g.score,reason:g.relationStatus}));
 return {
  ...POLICY,version:'buyer-decision-plan-v1',status:'plan_for_review',
  itemCode:source.itemCode,sourceHash:source.sourceHash,identity:source.identity,
  selectedDecision:{
   group:winner.group,
   purchaseQuestion:winner.advantages.map(a=>a.decision).join('・'),
   hypotheticalScene:winner.advantages[0].use,
   sceneIsSellerFact:false,
   reasoning:'複数の原文特徴が同じ選択目的に関係することを優先。原文外の成果は断定しない。',
   rankScore:winner.score,relationStatus:winner.relationStatus,
   evidence:winner.advantages.map(({axis,quote,source,at})=>({axis,quote,source,at})),
   cautions:winner.constraints.map(({axis,quote,source,at})=>({axis,quote,source,at}))
  },
  otherChoices:comparable,
  knowledge:{status:knowledge?'available':'missing',actsOn:knowledge?.actsOn||null,sourceOfTruth:false},
  proof:{sellerFeatureQuotesVerified:true,sellingUnitOwnershipVerified:false,
    actualConsumerBenefitVerified:false,editorialQualityVerified:false},
  unresolved:['variant_and_selling_unit','plausible_scene_not_fact','natural_language_quality']
 };
}
module.exports={plan,candidateGroups};
