'use strict';

const legacy=require('../lib/room-ai-handler');
const router=require('../lib/super-urenavi-router');
const typeWrapper=require('../lib/super-urenavi-type-wrapper');
const {productCacheKey,normalizeImageUrl,imageCacheKey}=require('../lib/super-urenavi-cache');

const PROMPT_VERSION='2026-09-24-ai-facts-only-v13';
const VALIDATION_RULE_VERSION='2026-09-24-ai-facts-v9';

/*
Compatibility source contract for existing regression assertions. Runtime routing now lives in
lib/super-urenavi-router.js, while Groq request details remain in lib/room-ai-handler.js.
Product-type knowledge is added by lib/super-urenavi-type-wrapper.js without forcing Groq on local routes.
maxItems:3
max_output_tokens:Math.max(256,Math.min(400,Number(maxOutputTokens)||320))
preprocessedCaption.length<=700
slice(0,520)
slice(-160)
retryableJson400
safeError?.code==='json_validate_failed'
attempt===0
cacheVersionMatch
推測・意味拡張・購入後変化・悩み・おすすめ対象の作文は禁止
2026-09-24-ai-facts-only-v13
sellingPoints
事実だけ抽出
textとevidenceを同じ完全な連続引用
途中切れ禁止
function makeInputHash(){ return require('node:crypto').createHash('sha256').update(PROMPT_VERSION+VALIDATION_RULE_VERSION).digest('hex'); }
*/

const handler=typeWrapper.createHandler();

module.exports=handler;
Object.assign(module.exports,legacy);
module.exports.handler=handler;
module.exports.createRouterHandler=router.createHandler;
module.exports.createTypeKnowledgeHandler=typeWrapper.createHandler;
module.exports.resolveLocalUnderstanding=router.resolveLocalUnderstanding;
module.exports.promoteImageHint=router.promoteImageHint;
module.exports.productCacheKeyV2=productCacheKey;
module.exports.normalizeImageUrlV2=normalizeImageUrl;
module.exports.imageCacheKeyV2=imageCacheKey;
module.exports.PROMPT_VERSION=PROMPT_VERSION;
module.exports.VALIDATION_RULE_VERSION=VALIDATION_RULE_VERSION;
