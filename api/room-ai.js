'use strict';

const legacy=require('../lib/room-ai-handler');
const v3=require('./room-ai-v3');
const router=require('../lib/super-urenavi-router');
const {productCacheKey,normalizeImageUrl,imageCacheKey}=require('../lib/super-urenavi-cache');

const PROMPT_VERSION='2026-09-29-super-urenavi-sale-v1';
const VALIDATION_RULE_VERSION='2026-09-29-grounded-value-v1';

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
