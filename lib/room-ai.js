'use strict';

const FactSafety=require('../public/fact-safety.js');
const {PROMO_RE,CLAIM_RE,isAllowedSpecFact}=FactSafety;
const NUMBER_UNIT_RE=/\d+(?:[.,]\d+)?\s*(?:mAh|Ah|Wh|W|V|cm|mm|kg|mg|g|ml|mL|L|個|枚|本|袋|組|台|段|色|ポート|時間|分)/gi;
const DERIVED_GENERIC_RE=/^(?:使いやすい|便利|おすすめ|選びやすい|商品ページ(?:を)?確認|チェックしたい|比較したい)[。！!]*$/;
const GENERIC_PRODUCT_TYPE_RE=/^(?:美顔|美容|ペット|犬用|猫用|メンズ|レディース|家電|グッズ|用品)$/i;

const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const compact=s=>norm(s).replace(/\s+/g,'').toLowerCase();

function preprocessCaption(raw){
  const text=String(raw||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]*>/g,'\n')
    .replace(/\r/g,'\n');
  const exclude=/(送料|配送|お支払|支払い|返品|交換|営業時間|お問い合わせ|店舗情報|ショップ案内|メルマガ|LINE登録|レビュー(?:を)?(?:お願い|投稿)|こちらの商品もおすすめ|関連商品|クーポン|SALE|セール|ポイント\d*倍|ランキング|受賞|https?:\/\/|www\.)/i;
  return text
    .split(/\n+|(?<=[。！？])/)
    .map(x=>norm(x))
    .filter(x=>x && !exclude.test(x))
    .join(' ')
    .slice(0,1200);
}

function sourceText(source,itemName,itemCaption){
  if(source==='itemName') return norm(itemName);
  if(source==='itemCaption') return norm(itemCaption);
  return '';
}

function evidenceExists(source,evidence,itemName,itemCaption){
  const hay=compact(sourceText(source,itemName,itemCaption));
  const needle=compact(evidence);
  return Boolean(hay && needle && hay.includes(needle));
}

function quoteBoundaryValid(source,text,itemName,itemCaption){
  const canonical=s=>norm(s).replace(/([。！？!?、，,.・\/／])\s+/g,'$1');
  const hay=canonical(sourceText(source,itemName,itemCaption));
  const needle=canonical(text);
  if(!hay||!needle) return false;
  const index=hay.indexOf(needle);
  if(index<0) return compact(hay)===compact(needle);
  const end=index+needle.length;
  if(end>=hay.length) return true;
  const next=hay[end];
  return /[\s。！？!?、，,.・\/／）)\]】〕〉》」』〗}]/.test(next);
}

function numberUnitTokens(text){
  return Array.from(norm(text).matchAll(NUMBER_UNIT_RE),m=>compact(m[0]));
}

function numbersSupported(text,evidence){
  const facts=numberUnitTokens(text);
  const ev=compact(evidence);
  return facts.every(x=>ev.includes(x));
}

function productTypeCoverage(value,evidence){
  const ignored=new Set([' ','　','の','用','向','け','型','式','・','-','ー','/','／','(',')','（','）','[',']','【','】']);
  const chars=[...norm(value).toLowerCase()].filter(ch=>!ignored.has(ch) && !/[.,:：;；'"!?！？]/.test(ch));
  const hay=compact(evidence);
  if(!chars.length||!hay) return 0;
  const supported=chars.filter(ch=>hay.includes(ch)).length;
  return supported/chars.length;
}

function validateProductType(productType,itemName,itemCaption){
  const p=productType&&typeof productType==='object'?productType:{};
  const value=norm(p.value);
  const source=String(p.source||'');
  const evidence=norm(p.evidence);
  const validSource=source==='itemName'||source==='itemCaption';
  const evidenceValid=validSource&&evidenceExists(source,evidence,itemName,itemCaption);
  const textEvidenceValid=validSource&&evidenceExists(source,value,itemName,itemCaption);
  const numbersValid=numbersSupported(value,evidence);
  const promoRisk=PROMO_RE.test(value);
  const claimRisk=CLAIM_RE.test(value);
  const evidencePromoRisk=PROMO_RE.test(evidence);
  const evidenceClaimRisk=CLAIM_RE.test(evidence);
  const coverage=productTypeCoverage(value,evidence);
  const meaningSupported=Boolean(value&&evidence&&coverage>=0.90);
  const genericProductTypeRisk=GENERIC_PRODUCT_TYPE_RE.test(value);
  const boundaryValid=quoteBoundaryValid(source,value,itemName,itemCaption);
  const productTypeParts=value.split(/\s+/).filter(Boolean);
  const productTypeStructureRisk=productTypeParts.length>2;
  const brandLikeProductTypeRisk=productTypeParts.length===2
    && /^[A-Za-z0-9.+-]+$/.test(productTypeParts[0])
    && /^[ァ-ヶー]{2,}$/.test(productTypeParts[1])
    && !/^(?:USB|PC|LED|HDMI|PD|Wi-?Fi|PowerBank)$/i.test(productTypeParts[0]);
  return {
    value,source,evidence,
    valid:Boolean(value&&evidenceValid&&textEvidenceValid&&boundaryValid&&numbersValid&&meaningSupported&&!promoRisk&&!claimRisk&&!genericProductTypeRisk&&!productTypeStructureRisk&&!brandLikeProductTypeRisk),
    evidenceValid,
    textEvidenceValid,
    numbersValid,
    meaningSupported,
    meaningCoverage:Number(coverage.toFixed(3)),
    genericProductTypeRisk,
    boundaryValid,
    productTypeStructureRisk,
    brandLikeProductTypeRisk,
    promoRisk,
    claimRisk,
    evidencePromoRisk,
    evidenceClaimRisk
  };
}

function validateFeature(feature,itemName,itemCaption){
  const f=feature&&typeof feature==='object'?feature:{};
  const text=norm(f.text);
  const source=String(f.source||'');
  const evidence=norm(f.evidence);
  const validSource=source==='itemName'||source==='itemCaption';
  const evidenceValid=validSource&&evidenceExists(source,evidence,itemName,itemCaption);
  const textEvidenceValid=validSource&&evidenceExists(source,text,itemName,itemCaption);
  const numbersValid=numbersSupported(text,evidence);
  const promoRisk=PROMO_RE.test(text);
  const claimRisk=CLAIM_RE.test(text);
  const evidencePromoRisk=PROMO_RE.test(evidence);
  const evidenceClaimRisk=CLAIM_RE.test(evidence);
  const genericRisk=DERIVED_GENERIC_RE.test(text);
  const tc=compact(text),ec=compact(evidence);
  const truncationRisk=Boolean(text.length>=44&&tc&&ec.startsWith(tc)&&ec.length>tc.length);
  const valid=Boolean(text&&evidenceValid&&textEvidenceValid&&numbersValid&&!promoRisk&&!claimRisk&&!genericRisk&&!truncationRisk);
  const specLike=isAllowedSpecFact(text);
  return {
    text,source,evidence,valid,evidenceValid,textEvidenceValid,numbersValid,promoRisk,claimRisk,evidencePromoRisk,evidenceClaimRisk,genericRisk,truncationRisk,specLike,
    eligibleForPost:valid&&specLike&&(source==='itemName'||source==='itemCaption')
  };
}

function validateSellingPoint(point,itemName,itemCaption){
  const p=point&&typeof point==='object'?point:{};
  const text=norm(p.text);
  const source=String(p.source||'');
  const evidence=norm(p.evidence);
  const validSource=source==='itemName'||source==='itemCaption';
  const evidenceValid=validSource&&evidenceExists(source,evidence,itemName,itemCaption);
  const numbersValid=numbersSupported(text,evidence);
  const promoRisk=PROMO_RE.test(text);
  const claimRisk=CLAIM_RE.test(text);
  const evidencePromoRisk=PROMO_RE.test(evidence);
  const evidenceClaimRisk=CLAIM_RE.test(evidence);
  const meaningCoverage=productTypeCoverage(text,evidence);
  const meaningSupported=Boolean(text&&evidence&&meaningCoverage>=0.70);
  const textEvidenceValid=validSource&&evidenceExists(source,text,itemName,itemCaption);
  const boundaryValid=quoteBoundaryValid(source,text,itemName,itemCaption);
  const completePhrase=Boolean(text)&&boundaryValid&&!/(?:[、,・\/]|を|が|に|へ|と|で|て|の|や|から|まで|対)$/.test(text);
  const tc=compact(text),ec=compact(evidence);
  const truncationRisk=Boolean(text&&textEvidenceValid&&!boundaryValid)||(text.length>64)||(evidence.length>96);
  const valid=Boolean(text&&evidenceValid&&textEvidenceValid&&completePhrase&&numbersValid&&meaningSupported&&!promoRisk&&!claimRisk&&!truncationRisk);
  const specLike=isAllowedSpecFact(text);
  return {
    text,source,evidence,valid,evidenceValid,textEvidenceValid,boundaryValid,completePhrase,numbersValid,meaningSupported,
    meaningCoverage:Number(meaningCoverage.toFixed(3)),promoRisk,claimRisk,evidencePromoRisk,evidenceClaimRisk,truncationRisk,specLike,
    eligibleForPost:valid&&specLike&&(source==='itemName'||source==='itemCaption')
  };
}


function normalizeHint(value){
  const x=norm(value);
  return x||null;
}

function longestCommonSubstring(a,b){
  const x=compact(a),y=compact(b);
  if(!x||!y) return '';
  let best='';
  const dp=new Array(y.length+1).fill(0);
  for(let i=1;i<=x.length;i++){
    for(let j=y.length;j>=1;j--){
      if(x[i-1]===y[j-1]){
        dp[j]=dp[j-1]+1;
        if(dp[j]>best.length) best=x.slice(i-dp[j],i);
      }else dp[j]=0;
    }
  }
  return best;
}

function imageTypeCompatible(productType,imageHint){
  const a=compact(productType),b=compact(imageHint);
  if(!a||!b) return true;
  if(a===b||a.includes(b)||b.includes(a)) return true;
  const core=longestCommonSubstring(a,b);
  return core.length>=3 || core==='手袋';
}

function validateAiExtraction(raw,input,{imageAvailable=false}={}){
  const itemName=norm(input?.itemName);
  const itemCaption=preprocessCaption(input?.itemCaption);
  const productType=validateProductType(raw?.productType,itemName,itemCaption);
  const features=Array.isArray(raw?.features)?raw.features.map(f=>validateFeature(f,itemName,itemCaption)):[];
  const sellingPoints=Array.isArray(raw?.sellingPoints)?raw.sellingPoints.map(p=>validateSellingPoint(p,itemName,itemCaption)):[];
  const invalidFeatures=features.filter(f=>!f.valid);
  const invalidCount=invalidFeatures.length;
  const featureCount=features.length;
  const invalidRatio=featureCount?invalidCount/featureCount:0;
  const criticalInvalidNumeric=invalidFeatures.some(f=>/[0-9０-９]/.test(String(f.text||'')+' '+String(f.evidence||'')));
  const criticalInvalidClaim=invalidFeatures.some(f=>f.claimRisk===true);
  const criticalInvalidFeature=criticalInvalidNumeric||criticalInvalidClaim;
  const confidence=['high','medium','low'].includes(raw?.confidence)?raw.confidence:'low';
  const imageProductTypeHint=normalizeHint(raw?.imageProductTypeHint);
  const imageCompatible=!imageAvailable||!productType.valid||!imageProductTypeHint||imageTypeCompatible(productType.value,imageProductTypeHint);
  const imageConflict=!imageCompatible;
  const reasons=[];
  const hardProductFailure=!productType.valid||confidence!=='high'||imageConflict;
  if(!productType.valid) reasons.push('product_type_validation_failed');
  if(confidence==='medium') reasons.push('confidence_medium');
  if(confidence==='low') reasons.push('confidence_low');
  if(imageConflict) reasons.push('image_product_type_conflict');
  let mode='simple';
  if(hardProductFailure){
    mode='fallback';
  }else if(invalidCount){
    const validFeatureCount=features.filter(f=>f.valid).length;
    if(criticalInvalidNumeric){
      reasons.push('critical_invalid_numeric_feature');
      mode='fallback';
    }else if(criticalInvalidClaim&&validFeatureCount>=1&&invalidRatio<0.5){
      reasons.push('invalid_claim_features_dropped');
      mode='simple_partial';
    }else if(criticalInvalidClaim){
      reasons.push('critical_invalid_claim_feature');
      mode='fallback';
    }else if(invalidRatio>=0.5){
      reasons.push('feature_validation_failed');
      mode='fallback';
    }else{
      reasons.push('invalid_features_dropped');
      mode='simple_partial';
    }
  }
  return {
    mode,reasons,confidence,mediumHandling:'fallback_fixed',productType,features,sellingPoints,
    featureValidation:{count:featureCount,invalidCount,invalidRatio:Number(invalidRatio.toFixed(3)),criticalInvalidNumeric,criticalInvalidClaim,partialAllowed:mode==='simple_partial'},
    unknowns:Array.isArray(raw?.unknowns)?raw.unknowns.map(norm).filter(Boolean).slice(0,12):[],
    imageAvailable:Boolean(imageAvailable),
    imageProductTypeHint,
    imageCompatible,
    imageConflict,
    caption: itemCaption
  };
}

function phase1Post({title,features=[],price=0}){
  const safeTitle=norm(title)||'商品名を確認してください';
  const eligible=features.filter(x=>x?.eligibleForPost).map(x=>norm(x.text)).filter(Boolean);
  const lines=[safeTitle];
  if(eligible.length){
    lines.push('','商品の特徴👇',...eligible.slice(0,5).map(x=>'✔ '+x));
  }
  lines.push('',`価格：${new Intl.NumberFormat('ja-JP').format(Number(price)||0)}円`,'','※アフィリエイト広告を利用しています');
  return lines.join('\n').slice(0,500);
}

const CACHE_TABLE_PROPOSAL={
  name:'urenavi_ai_room_cache',
  ttlDays:90,
  columns:['input_hash text primary key','item_code text','item_name text','image_url text','model text','prompt_version text','raw_ai_json jsonb','validation_rule_version text','image_available boolean','created_at timestamptz'],
  note:'raw_ai_jsonを90日以内だけ再利用し、読み出しごとに現在の検証ルールを再実行する。'
};

const PHASE2_DESIGN_NOTE={
  implemented:false,
  supportedBy:'AIの自己申告は参照先の存在しかコード確認できないため、人の確認を必須とする。',
  captionFeatureRelease:'itemCaption由来featureは全体30〜50件の人確認から開始し、実測で見直す。'
};

module.exports={
  preprocessCaption,evidenceExists,numberUnitTokens,numbersSupported,
  productTypeCoverage,quoteBoundaryValid,validateProductType,validateFeature,validateSellingPoint,validateAiExtraction,phase1Post,
  longestCommonSubstring,imageTypeCompatible,
  CACHE_TABLE_PROPOSAL,PHASE2_DESIGN_NOTE
};
