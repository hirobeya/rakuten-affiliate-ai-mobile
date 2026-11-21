'use strict';

/**
 * Product identity intake for the simplified Urenavi pipeline.
 *
 * This module deliberately does not try to guess a product category from
 * marketing text. The listing title identifies the purchased listing, while
 * SKU/variant ambiguity is recorded and must be resolved before publication.
 * The original source is retained for subsequent claim-level verification.
 */
function normalize(value) {
  return String(value == null ? '' : value).normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
function intakeProduct(item) {
  const name = normalize(item && item.itemName);
  const caption = String(item && item.itemCaption || '');
  const code = normalize(item && item.itemCode);
  if (!name || !caption.trim()) {
    return {status:'insufficient_source',reason:!name?'missing_item_name':'missing_item_caption',product:null};
  }
  const titleHasOptions = /(?:\b(?:選べる|選択|各種|バリエーション|ランダム)\b|(?:サイズ|カラー|色|種類|タイプ|型番|セット)\s*(?:選択|を選ぶ|が選べる))/u.test(name);
  return {
    status:'intake_ready',
    reason:null,
    product:{
      itemCode:code,
      listingName:name,
      rawItemName:String(item.itemName),
      rawItemCaption:caption,
      itemPrice:item.itemPrice,
      variantReviewRequired:titleHasOptions,
      identityConfidence:'listing_title_only',
      publicationApproved:false
    }
  };
}
module.exports={intakeProduct};
