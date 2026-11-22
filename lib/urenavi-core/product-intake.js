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
  const titleHasOptions = /(?:(?:選べる|選択|各種|バリエーション|ランダム)|(?:サイズ|カラー|色|種類|タイプ|型番|セット)\s*(?:選択|を選ぶ|が選べる))/u.test(name);
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
// Preserve the declaration's actual offsets. The title must corroborate
// every component, including when the merchant reorders title keywords.
function sourceDeclaredIdentity(item,passages){
 const intake=intakeProduct(item);
 if(!intake.product||intake.product.variantReviewRequired)return null;
 const [header,field]=passages;
 if(!header||field?.kind!=='section'||!['商品説明','商品詳細'].includes(field.quote)||field.start<=header.end)return null;
 const declaration=header.quote.match(/^商品名[：:]?\s+([^\s。！？]{4,28})(?=\s|$)/u);
 if(!declaration)return null;
 const name=declaration[1];
 if(intake.product.listingName.includes(name))return null;
 const segmenter=new Intl.Segmenter('ja',{granularity:'word'});
 const words=text=>[...segmenter.segment(text)].filter(x=>x.isWordLike).map(x=>x.segment);
 const titleWords=new Set(words(intake.product.listingName));
 const parts=words(name);
 if(/(?:交換用|替え部品|対応機種|専用ケース|専用カバー)/u.test(intake.product.listingName)
  ||parts.length<2||!parts.every(word=>titleWords.has(word)))return null;
 const start=header.start+header.quote.indexOf(name);
 return {source:'itemCaption',quote:name,start,end:start+name.length,header,descriptionStart:field.start};
}
module.exports={intakeProduct,sourceDeclaredIdentity};

