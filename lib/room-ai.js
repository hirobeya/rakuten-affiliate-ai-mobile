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

function validateProductType(productType,itemName,itemCaption){
  const p=productType&&typeof productType==='object'?productType:{};
  const value=norm(p.value);
  const source=String(p.source||'');
  const evidence=norm(p.evidence);
  const validSource=source==='itemName'||source==='itemCaption';
  const evidenceValid=validSource&&evidenceExists(source,evidence,itemName,itemCaption);
  const numbersValid=numbersSupported(value,evidence);
  return {
    value,source,evidence,
    valid:Boolean(value&&evidenceValid&&numbersValid),
    evidenceValid,
    numbersValid
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
    eligibleForPost:valid&&source==='itemName'
  };
}

function normalizeHint(value){
  const x=norm(value);
  return x||null;
}

function validateAiExtraction(raw,input,{imageAvailable=false}={}){
  const itemName=norm(input?.itemName);
  const itemCaption=preprocessCaption(input?.itemCaption);
  const productType=validateProductType(raw?.productType,itemName,itemCaption);
  const features=Array.isArray(raw?.features)?raw.features.map(f=>validateFeature(f,itemName,itemCaption)):[];
  const invalidFeature=features.some(f=>!f.valid);
  const confidence=['high','medium','low'].includes(raw?.confidence)?raw.confidence:'low';
  const imageProductTypeHint=normalizeHint(raw?.imageProductTypeHint);
  const imageConflict=Boolean(imageAvailable&&productType.valid&&imageProductTypeHint&&compact(productType.value)!==compact(imageProductTypeHint));
  const reasons=[];
  if(confidence==='low') reasons.push('confidence_low');
  if(invalidFeature) reasons.push('feature_validation_failed');
  if(imageConflict) reasons.push('image_product_type_conflict');
  const mode=reasons.length?'fallback':'simple';
  return {
    mode,reasons,confidence,productType,features,
    unknowns:Array.isArray(raw?.unknowns)?raw.unknowns.map(norm).filter(Boolean).slice(0,12):[],
    imageAvailable:Boolean(imageAvailable),
    imageProductTypeHint,
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
  columns:['item_code text','input_hash text','model text','model_version text','prompt_version text','raw_ai_json jsonb','validation_rule_version text','created_at timestamptz'],
  note:'第1段階では実装しない。raw_ai_jsonを保存し、読み出しごとに現在の検証ルールを再実行する。'
};

const PHASE2_DESIGN_NOTE={
  implemented:false,
  supportedBy:'AIの自己申告は参照先の存在しかコード確認できないため、人の確認を必須とする。',
  captionFeatureRelease:'itemCaption由来featureは全体30〜50件の人確認から開始し、実測で見直す。'
};

module.exports={
  preprocessCaption,evidenceExists,numberUnitTokens,numbersSupported,
  validateProductType,validateFeature,validateAiExtraction,phase1Post,
  CACHE_TABLE_PROPOSAL,PHASE2_DESIGN_NOTE
};
