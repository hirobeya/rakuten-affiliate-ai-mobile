'use strict';
const {catalogueOnly,restatedReason}=require('../public/purchase-copy-quality');
const {guardUnsupportedBenefitCopy}=require('../public/fact-safety');

// The certified copy and its exact source spans remain authoritative. This
// rewrite removes a redundant object marker while retaining the same verb,
// degree, subject and all intervening qualifiers verbatim.
const REDUNDANT_CONTROL=/(量や速度)のコントロールを(?=(?:初心者でも)?(?:簡単に|細かく|自由に)?調整できます。)/g;
// Rejection-only Japanese surface check, independent of product category.
// A source-supported sentence can still be unreadable. Never 'repair' a
// malformed claim by dropping a qualifier or inventing a new predicate.
function hasMalformedTopicChain(copy){
 if(typeof copy!=='string')return true;
 const body=copy.split(/\n\n価格：|\n\n※アフィリエイト広告/)[0];
 return /は、(?:なお|また)[^。！？\n]{0,100}は、/u.test(body)
   || /(?:は、なお|は、また)[^。！？\n]{0,100}(?:。|$)/u.test(body);
}
function naturalize(copy){
 return copy.replace(REDUNDANT_CONTROL,'$1を');
}
function verifyNaturalization(certified,proposed){
 return typeof certified==='string'&&typeof proposed==='string'&&naturalize(certified)===proposed;
}
function naturalizedCopy(item,result){
 const certified=result.quality.text;
 const text=naturalize(certified);
 if(text===certified||!verifyNaturalization(certified,text)||catalogueOnly(text)
   ||restatedReason(text,{identity:result.productType?.specific,quote:result.local?.partner?.quote})
   ||guardUnsupportedBenefitCopy(item,text)!==text)return result;
 return {...result,quality:{...result.quality,text},variants:[{...result.variants[0],text}],
  rendering:{certifiedText:certified,rule:'remove_redundant_control_nominalization'}};
}
module.exports={naturalizedCopy,verifyNaturalization,hasMalformedTopicChain};
