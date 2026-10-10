'use strict';

function acceptedAppeals(verifiedAppeals=[]){
  return [...verifiedAppeals]
    .filter(x=>x?.verification?.supported===true)
    .sort((a,b)=>(b.strength||0)-(a.strength||0) || (a.index||0)-(b.index||0));
}

function chooseTier(validation,verifiedAppeals){
  if(!validation?.valid) return 'invalid';
  if(acceptedAppeals(verifiedAppeals).length && (validation?.attributes||[]).length) return 'A';
  if((validation?.attributes||[]).length) return 'B';
  return 'C';
}

function composeVariants({item={},analysis={},maxVariants=3}={}){
  const validation=analysis.validation||analysis;
  const verifiedAppeals=analysis.verifiedAppeals||[];
  const tier=chooseTier(validation,verifiedAppeals);
  if(tier==='invalid') return {tier,variants:[],quality:{status:'blocked',reasons:['invalid_validation'],text:'',ledger:[]}};
  const copy=require('./grounded-purchase-copy').composePurchaseCopy({item,analysis});
  const variants=copy.status==='ready'?[{index:1,hookType:'scene',hook:copy.ledger[0].scene,text:copy.text}]:[];
  return {tier,variants,quality:copy};
}

module.exports={acceptedAppeals,chooseTier,composeVariants};
