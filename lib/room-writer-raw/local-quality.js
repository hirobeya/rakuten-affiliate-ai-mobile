'use strict';
const {hash,freeze}=require('./source');
const VERSION='raw-local-quality-v1';
const AXES=['understanding','specificity','choice','audience_value','naturalness','grounded'];
function packet({source,sourceHash,local,mode}){
 const snapshot=structuredClone(local);
 return freeze({version:VERSION,source:structuredClone(source),sourceHash,local:snapshot,localHash:hash(snapshot),outputHash:hash(snapshot.result??null),mode,axes:[...AXES]});
}
function classify(receipt,p){
 const unknown=reason=>({status:'unverified',reason,sourceHash:p.sourceHash,outputHash:p.outputHash,localHash:p.localHash});
 if(!receipt||receipt.version!==VERSION||receipt.sourceHash!==p.sourceHash||receipt.outputHash!==p.outputHash||receipt.localHash!==p.localHash)return unknown('quality_evidence_missing_or_mismatched');
 if(typeof receipt.reviewerId!=='string'||!receipt.reviewerId.trim()||typeof receipt.reason!=='string'||!receipt.reason.trim()||!['existing_quality_gate','independent_review'].includes(receipt.method))return unknown('quality_evaluator_unidentified');
 if(!AXES.every(k=>receipt.axes&&Object.hasOwn(receipt.axes,k)&&[true,false,null].includes(receipt.axes[k])))return unknown('quality_axes_incomplete');
 if(receipt.status==='passed'&&p.local.result&&AXES.every(k=>receipt.axes[k]===true))return freeze({...receipt,status:'passed'});
 if(receipt.status==='failed'&&AXES.some(k=>receipt.axes[k]===false))return freeze({...receipt,status:'failed'});
 return unknown('quality_not_decided');
}
async function assess(p,evaluator){
 if(typeof evaluator!=='function')return classify(null,p);
 try{return classify(await evaluator(p),p);}catch{return {...classify(null,p),reason:'quality_evaluation_unavailable'};}
}
function cachePassed(cached,sourceHash){
 const q=cached?.quality;
 return typeof cached?.text==='string'&&cached.text.trim()&&q?.version===VERSION&&q.status==='passed'&&q.sourceHash===sourceHash&&q.outputHash===hash(cached.text)
  &&['existing_quality_gate','independent_review'].includes(q.method)&&typeof q.reviewerId==='string'&&q.reviewerId.trim()&&typeof q.reason==='string'&&q.reason.trim()&&AXES.every(k=>q.axes?.[k]===true);
}
module.exports={VERSION,AXES,packet,classify,assess,cachePassed};
