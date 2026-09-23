'use strict';

const PROMO_RE=/楽天(?:市場)?(?:総合)?(?:ランキング)?\s*1位|ランキング|受賞|\d+冠|ご好評です|大好評|当店人気|大人気|クーポン|SALE|セール|OFF|オフ|半額|最安|送料無料|ポイント\d*倍|P\d+倍/i;
const CLAIM_RE=/改善|予防|防止|安全|安心|無害|発火しない|燃えにくい|難燃|抗菌|除菌|殺菌|消臭|防臭|アレルギー|疲労|痛み|快眠|安眠|健康|小顔|引き締め|リフトアップ|治る|痩せる|若返/i;
const NUMBER_UNIT_RE=/\d+(?:[.,]\d+)?\s*(?:mAh|Ah|Wh|W|V|cm|mm|kg|mg|g|ml|mL|L|個|枚|本|袋|組|台|段|色|ポート|時間|分)/gi;

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
  const chars=[...norm(value)].filter(ch=>!ignored.has(ch) && !/[.,:：;；'"!?！？]/.test(ch));
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
  const numbersValid=numbersSupported(value,evidence);
  const promoRisk=PROMO_RE.test(value)||PROMO_RE.test(evidence);
  const claimRisk=CLAIM_RE.test(value)||CLAIM_RE.test(evidence);
  const coverage=productTypeCoverage(value,evidence);
  const meaningSupported=Boolean(value&&evidence&&coverage>=0.90);
  return {
    value,source,evidence,
    valid:Boolean(value&&evidenceValid&&numbersValid&&meaningSupported&&!promoRisk&&!claimRisk),
    evidenceValid,
    numbersValid,
    meaningSupported,
    meaningCoverage:Number(coverage.toFixed(3)),
    promoRisk,
    claimRisk
  };
}

function validateFeature(feature,itemName,itemCaption){
  const f=feature&&typeof feature==='object'?feature:{};
  const text=norm(f.text);
  const source=String(f.source||'');
  const evidence=norm(f.evidence);
  const validSource=source==='itemName'||source==='itemCaption';
  const evidenceValid=validSource&&evidenceExists(source,evidence,itemName,itemCaption);
  const numbersValid=numbersSupported(text,evidence);
  const promoRisk=PROMO_RE.test(text)||PROMO_RE.test(evidence);
  const claimRisk=CLAIM_RE.test(text)||CLAIM_RE.test(evidence);
  const valid=Boolean(text&&evidenceValid&&numbersValid&&!promoRisk&&!claimRisk);
  return {
    text,source,evidence,valid,evidenceValid,numbersValid,promoRisk,claimRisk,
    eligibleForPost:valid&&(source==='itemName'||source==='itemCaption')
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
    if(criticalInvalidFeature){
      reasons.push(criticalInvalidNumeric?'critical_invalid_numeric_feature':'critical_invalid_claim_feature');
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
    mode,reasons,confidence,mediumHandling:'fallback_fixed',productType,features,
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
  productTypeCoverage,validateProductType,validateFeature,validateAiExtraction,phase1Post,
  longestCommonSubstring,imageTypeCompatible,
  CACHE_TABLE_PROPOSAL,PHASE2_DESIGN_NOTE
};
