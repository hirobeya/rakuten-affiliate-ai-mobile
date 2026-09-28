'use strict';

function compact(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
const GENERIC_RE=/(商品ページの仕様|自分の使い方に合うか|選ぶ基準|チェックしておきたいポイント|使う場面や置き場所|どれを選ぶか迷ったら)/;
const VALUE_RE=/(しやす|しにく|手間|待た|迷|時短|省け|減ら|選べ|使い分け|持ち運|収納|調整|合わせ|まとめ|一台|1台|場面|とき|時に|人に|方に)/;
function refsGrounded(appeal,attributes=[]){const refs=Array.isArray(appeal?.attributeRefs)?appeal.attributeRefs:[];return refs.length>0&&refs.every(i=>Number.isInteger(i)&&attributes[i]?.quote);}
function assessCopyReadiness(validation={}){
 const attrs=Array.isArray(validation.attributes)?validation.attributes:[];
 const appeals=Array.isArray(validation.appeals)?validation.appeals:[];
 const hooks=Array.isArray(validation.hooks)?validation.hooks:[];
 const grounded=appeals.filter(a=>refsGrounded(a,attrs)&&a?.text&&!a?.unsafe);
 const strong=grounded.filter(a=>Number(a.strength)>=2&&VALUE_RE.test(compact([a.text,a.noHassle,a.scene].join(' '))));
 const specificHooks=hooks.filter(h=>h?.text&&!GENERIC_RE.test(compact(h.text)));
 const reasons=[];
 if(validation.valid!==true)reasons.push('identity_not_ready');
 if(attrs.length===0)reasons.push('no_grounded_attributes');
 if(strong.length===0)reasons.push('no_grounded_customer_value');
 if(specificHooks.length===0)reasons.push('no_product_specific_hook');
 const ready=reasons.length===0;
 return {ready,needsGroq:!ready,reasons,groundedAppealCount:grounded.length,strongAppealCount:strong.length,specificHookCount:specificHooks.length};
}
function assessGeneratedCopy({validation={},verifiedAppeals=[],variants=[]}={}){
 const readiness=assessCopyReadiness({...validation,appeals:verifiedAppeals.length?verifiedAppeals:validation.appeals});
 const texts=(variants||[]).map(v=>compact(v?.text)).filter(Boolean);
 const genericOnly=texts.length===0||texts.every(t=>GENERIC_RE.test(t));
 const hasValue=texts.some(t=>VALUE_RE.test(t));
 return {...readiness,copyReady:readiness.ready&&!genericOnly&&hasValue,genericOnly,hasValue};
}
module.exports={assessCopyReadiness,assessGeneratedCopy};
