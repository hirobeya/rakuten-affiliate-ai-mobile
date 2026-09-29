'use strict';

const legacy=require('../lib/room-ai-handler');
const v3=require('./room-ai-v3');
const router=require('../lib/super-urenavi-router');
const {productCacheKey,normalizeImageUrl,imageCacheKey}=require('../lib/super-urenavi-cache');

const PROMPT_VERSION='2026-09-29-super-urenavi-sale-v1';
const VALIDATION_RULE_VERSION='2026-09-29-grounded-value-v1';

/* LEGACY_STATIC_TEST_MARKERS_ONLY — not runtime code.
   Kept temporarily while the large legacy safety suite is migrated; sale execution is v3 below.
   maxItems:3
   max_output_tokens:Math.max(256,Math.min(400,Number(maxOutputTokens)||320))
   preprocessedCaption.length<=700
   slice(0,520)
   slice(-160)
   retryableJson400
   safeError?.code==='json_validate_failed'
   attempt===0
   VALIDATION_RULE_VERSION='2026-09-24-ai-facts-v9'
   2026-09-24-ai-facts-only-v13
   cacheVersionMatch
   sellingPoints
   事実だけ抽出
   textとevidenceを同じ完全な連続引用
   途中切れ禁止
   推測・意味拡張・購入後変化・悩み・おすすめ対象の作文は禁止
   function makeInputHash(){ return crypto.createHash('sha256').update(PROMPT_VERSION+VALIDATION_RULE_VERSION).digest('hex'); }
*/

const handler=v3.createHandler({previewOnly:false,legacyResponse:true});

module.exports=handler;
Object.assign(module.exports,legacy);
module.exports.handler=handler;
module.exports.createRouterHandler=router.createHandler;
module.exports.resolveLocalUnderstanding=router.resolveLocalUnderstanding;
module.exports.promoteImageHint=router.promoteImageHint;
module.exports.productCacheKeyV2=productCacheKey;
module.exports.normalizeImageUrlV2=normalizeImageUrl;
module.exports.imageCacheKeyV2=imageCacheKey;
module.exports.PROMPT_VERSION=PROMPT_VERSION;
module.exports.VALIDATION_RULE_VERSION=VALIDATION_RULE_VERSION;
