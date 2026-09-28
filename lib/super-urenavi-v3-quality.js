'use strict';

const {compact,structuralAppealStrength}=require('./super-urenavi-v3-expression');

const GENERIC_RE=/(商品ページの仕様|自分の使い方に合うか|選ぶ基準|チェックしておきたいポイント|使う場面や置き場所|どれを選ぶか迷ったら)/;

function refsGrounded(appeal,attributes=[]){
  const refs=Array.isArray(appeal?.attributeRefs)?appeal.attributeRefs:[];
  return refs.length>0&&refs.every(i=>Number.isInteger(i)&&attributes[i]?.quote);
}

function assessCopyReadiness(validation={}){
  const attrs=Array.isArray(validation.attributes)?validation.attributes:[];
  const appeals=Array.isArray(validation.appeals)?validation.appeals:[];
  const hooks=Array.isArray(validation.hooks)?validation.hooks:[];
  const grounded=appeals.filter(a=>refsGrounded(a,attrs)&&a?.text&&!a?.unsafe);
  const strong=grounded.filter(a=>structuralAppealStrength(a,attrs));
  const specificHooks=hooks.filter(h=>h?.text&&!GENERIC_RE.test(compact(h.text)));
  const reasons=[];
  if(validation.valid!==true) reasons.push('identity_not_ready');
  if(attrs.length===0) reasons.push('no_grounded_attributes');
  if(strong.length===0) reasons.push('no_grounded_customer_value');
  if(specificHooks.length===0) reasons.push('no_product_specific_hook');
  const ready=reasons.length===0;
  return {
    ready,
    needsGroq:!ready,
    reasons,
    groundedAppealCount:grounded.length,
    strongAppealCount:strong.length,
    specificHookCount:specificHooks.length
  };
}

function assessGeneratedCopy({validation={},verifiedAppeals=[],variants=[]}={}){
  const attrs=Array.isArray(validation.attributes)?validation.attributes:[];
  const readiness=assessCopyReadiness({...validation,appeals:verifiedAppeals.length?verifiedAppeals:validation.appeals});
  const texts=(variants||[]).map(v=>compact(v?.text)).filter(Boolean);
  const genericOnly=texts.length===0||texts.every(t=>GENERIC_RE.test(t));
  const verifiedStrong=(verifiedAppeals||[]).filter(a=>
    a?.verification?.supported===true && refsGrounded(a,attrs) && structuralAppealStrength(a,attrs)
  );
  const hasVerifiedValue=verifiedStrong.length>0;
  return {
    ...readiness,
    copyReady:readiness.ready&&!genericOnly&&hasVerifiedValue&&texts.length>0,
    genericOnly,
    hasVerifiedValue,
    verifiedStrongAppealCount:verifiedStrong.length
  };
}

module.exports={assessCopyReadiness,assessGeneratedCopy};
