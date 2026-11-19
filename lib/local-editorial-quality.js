'use strict';
// Rejection-only editorial review for direct seller claims. This is not an
// automatic six-axis certification: human persuasiveness remains unverified.
// It stops generic reassurances, universal promises and brand assortment
// language from being presented as a specific buyer reason for the selling SKU.
const normalize=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function reviewSourceBenefit({quote='',identity=''}={}){
 const q=normalize(quote),id=normalize(identity);
 if(!q||!id)return {ok:false,reason:'missing_product_or_quote'};
 if(/(?:どんな場所にも|いつでも|必ず|絶対|確実に|どんな商品にも|何にでも|万全|100%|完全に)/.test(q))
  return {ok:false,reason:'unbounded_or_absolute_claim'};
 if(/(?:バリエーションも豊富|サイズバリエーション|シリーズ商品|他のサイズ|組み合わせもしやすい)/.test(q))
  return {ok:false,reason:'catalogue_or_vague_choice'};
 if(/^(?:さらに|しかも|そして|また(?:、|は))/.test(q))
  return {ok:false,reason:'dependent_or_fragmentary_lead'};
 // Words such as easy/convenient do not alone explain the actual use.
 // A concrete, quoted operation/outcome may accompany them.
 const soft=/(?:便利|簡単|扱いやす|取りやす|使いやす|心地よい|ぴったり|快適)/.test(q);
 const concrete=/(?:出し入れ|取り出し|取り外|収納|洗濯|お手入れ|調整|調節|注ぎ|水流|速度|フック|ファスナー|引き出し|洗う|着脱|水洗い|重ねて|包み込|擦れ|ねじれ|シワ|毛羽立ち|幅\d|約\d|\d+(?:cm|mm|枚|足|個|セット))/i.test(q);
 if(soft&&!concrete)return {ok:false,reason:'generic_comfort_without_mechanism'};
 return {ok:true,reason:'source_specificity_veto_pass_only',sixAxisCertified:false};
}
module.exports={reviewSourceBenefit};
