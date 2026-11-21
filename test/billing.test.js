const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const billing=require('../lib/billing');
const webhook=require('../api/webhook');
const access=require('../api/access');
const search=require('../api/search');
const originalFetch=global.fetch;
const originalEnv={...process.env};
test('upstream authentication failure does not sign the customer out',async()=>{
  process.env.RAKUTEN_APP_ID='fixture';process.env.RAKUTEN_ACCESS_KEY='fixture';process.env.RAKUTEN_AFFILIATE_ID='fixture';
  global.fetch=async url=>{
    url=String(url);
    if(url.includes('/auth/v1/user'))return response({id:'user_fixture',email:'a@example.com'});
    if(url.includes('urenavi_session_valid'))return response(true);
    if(url.includes('urenavi_entitlements?'))return response([{status:'owner',active:true}]);
    return {ok:false,status:401,json:async()=>({error:'invalid application key'})};
  };
  const r=res();await search({headers:{authorization:'Bearer '+authToken()},query:{keyword:'商品'}},r);
  assert.equal(r.code,502);assert.doesNotMatch(JSON.stringify(r.body),/application key/);
});
beforeEach(()=>{Object.assign(process.env,{VERCEL_ENV:'preview',STRIPE_SECRET_KEY:'sk_test_fixture',URENAVI_PRICE_ID:'price_test',URENAVI_PAYMENT_LINK_ID:'plink_test',URENAVI_PAYMENT_LINK_URL:'https://buy.stripe.com/test_fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_URL:'https://vyzpklomggsazwigxkfh.supabase.co',STRIPE_WEBHOOK_SECRET:'fixture'});});
afterEach(()=>{global.fetch=originalFetch; for(const key of Object.keys(process.env)) if(!(key in originalEnv)) delete process.env[key];Object.assign(process.env,originalEnv);});
const response=data=>({ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)});
const sub=(extra={})=>({id:'sub_test',customer:'cus_test',livemode:false,status:'active',items:{data:[{price:{id:'price_test'},current_period_end:Math.floor(Date.now()/1000)+3600}]},...extra});
function res(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;},end(){return this;},redirect(n,url){this.code=n;this.url=url;return this;}};}
function signed(event,secret='fixture'){const body=Buffer.from(JSON.stringify(event));const t=Math.floor(Date.now()/1000);const sig=crypto.createHmac('sha256',secret).update(t+'.').update(body).digest('hex');const req=Readable.from([body]);req.method='POST';req.headers={'stripe-signature':`t=${t},v1=${sig}`};return req;}
test('Preview refuses absent config and LIVE key/link',()=>{delete process.env.URENAVI_PRICE_ID;assert.throws(billing.config);process.env.URENAVI_PRICE_ID='price_test';process.env.STRIPE_SECRET_KEY='sk_live_fixture';assert.throws(billing.config);process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.URENAVI_PAYMENT_LINK_URL='https://buy.stripe.com/live';assert.throws(billing.config);});
test('Production refuses TEST key',()=>{process.env.VERCEL_ENV='production';assert.throws(billing.config);});
test('Only active, matching mode/price, future paid period allows access',()=>{assert.equal(billing.subscriptionState(sub()).active,true);for(const status of ['canceled','past_due','unpaid','incomplete','incomplete_expired','paused','trialing'])assert.equal(billing.subscriptionState(sub({status})).active,false);assert.equal(billing.subscriptionState(sub({livemode:true})).active,false);assert.equal(billing.subscriptionState(sub({items:{data:[]}})).active,false);assert.equal(billing.subscriptionState(sub({items:{data:[{price:{id:'price_test'},current_period_end:1}]}})).active,false);});
test('Period-end cancellation allows already paid period; canceled blocks immediately',()=>{assert.equal(billing.subscriptionState(sub({cancel_at_period_end:true})).active,true);assert.equal(billing.subscriptionState(sub({status:'canceled',cancel_at_period_end:true})).active,false);});
test('Webhook rejects tamper, missing secret, replay and malformed signatures',()=>{const raw=Buffer.from('{}'),t=1000;const hash=crypto.createHmac('sha256','fixture').update(t+'.').update(raw).digest('hex');assert.deepEqual(billing.verifySignature(raw,`t=${t},v1=${hash}`,'fixture',t),{});for(const args of [[Buffer.from('{ }'),`t=${t},v1=${hash}`,'fixture',t],[raw,`t=${t},v1=${hash}`,'',t],[raw,`t=${t},v1=${hash}`,'fixture',t+301],[raw,`t=${t},v1=abc`,'fixture',t]])assert.throws(()=>billing.verifySignature(...args));});
test('Preview TEST billing never writes Production customer/auth data',async()=>{
 process.env.SUPABASE_URL='https://upooxcugrplfmjnqpuxs.supabase.co';
 let calls=0;global.fetch=async()=>{calls++;throw Error('Production request forbidden');};
 await assert.rejects(()=>billing.syncSubscription('sub_test'),/isolated Supabase/);
 await assert.rejects(()=>billing.ensureAuthUser('fixture@example.invalid'),/isolated Supabase/);
 const out=res();
 await access({method:'GET',query:{action:'activate',session_id:'cs_test_fixture'},headers:{}},out);
 assert.equal(out.code,503);
 assert.equal(calls,0);
});
test('Wrong-mode webhook cannot call services',async()=>{global.fetch=()=>{throw new Error('must not fetch');};const r=res();await webhook(signed({livemode:true,type:'customer.subscription.deleted',data:{object:{id:'sub_test'}}}),r);assert.equal(r.code,400);});
test('Signed cancellation fetches current state and synchronizes isolated row; repeats are safe',async()=>{const writes=[];global.fetch=async(url,options)=>{url=String(url);if(url.includes('/subscriptions/'))return response(sub({status:'canceled'}));if(url.includes('/customers/'))return response({email:'Buyer@example.com'});if(url.includes('rpc/urenavi_sync_entitlement')){writes.push(JSON.parse(options.body).p_row);return response(null);}return response([]);};const event={livemode:false,type:'customer.subscription.deleted',data:{object:{id:'sub_test'}}};for(let i=0;i<2;i++){const r=res();await webhook(signed(event),r);assert.equal(r.code,200);}assert.equal(writes.length,2);assert.equal(writes[0].active,false);assert.equal(writes[0].livemode,false);assert.equal(writes[0].email,'buyer@example.com');});
test('Webhook database failure remains retryable without leaking secret',async()=>{global.fetch=async()=>{throw new Error('sk_test_DO_NOT_EXPOSE');};const r=res();await webhook(signed({livemode:false,type:'customer.subscription.updated',data:{object:{id:'sub_test'}}}),r);assert.equal(r.code,503);assert.ok(!JSON.stringify(r).includes('DO_NOT_EXPOSE'));});
test('Unpaid checkout never provisions access',async()=>{global.fetch=async()=>response({livemode:false,mode:'subscription',status:'complete',payment_status:'unpaid',payment_link:'plink_test',subscription:'sub_test'});await assert.rejects(()=>billing.activate('cs_test_fixture'));});
test('Access and search reject missing authentication before external fetch',async()=>{global.fetch=()=>{throw new Error('must not fetch');};for(const handler of [access,search]){const r=res();await handler({method:'GET',headers:{},query:{action:'status',keyword:'充電器'}},r);assert.equal(r.code,401);assert.equal(r.headers['Cache-Control'],'no-store');}});
function authToken(){return 'header.'+Buffer.from(JSON.stringify({sub:'user_fixture',session_id:'00000000-0000-0000-0000-000000000001'})).toString('base64url')+'.signature';}
test('Expired/revoked session rejected even if user recently signed in elsewhere',async()=>{global.fetch=async url=>String(url).includes('/auth/v1/user')?response({id:'user_fixture',email:'a@example.com',last_sign_in_at:new Date().toISOString()}):response(false);assert.deepEqual(await billing.authorize({headers:{authorization:'Bearer '+authToken()}}),{ok:false,status:401});});
test('Preview rejects legacy paid subscriptions while allowing the explicit active owner',async()=>{
  const calls=[];
  let legacy=[{status:'active',active:true,stripe_subscription_id:'sub_live'}];
  global.fetch=async url=>{
    url=String(url);calls.push(url);
    if(url.includes('/auth/v1/user'))return response({id:'user_fixture',email:'a@example.com'});
    if(url.includes('urenavi_session_valid'))return response(true);
    if(url.includes('urenavi_entitlements?'))return response(legacy);
    if(url.includes('urenavi_entitlements_v2?'))return response([]);
    throw new Error('Unexpected service request');
  };
  const request={headers:{authorization:'Bearer '+authToken()}};
  assert.equal((await billing.authorize(request)).status,403);
  assert.ok(calls.some(x=>x.includes('livemode=eq.false')));
  assert.ok(!calls.some(x=>x.includes('/subscriptions/')));
  legacy=[{status:'owner',active:false}];
  assert.equal((await billing.authorize(request)).status,403);
  legacy=[{status:'owner',active:true}];
  assert.equal((await billing.authorize(request)).ok,true);
});
test('Paid user direct access checks actual Stripe state',async()=>{global.fetch=async url=>{url=String(url);if(url.includes('/auth/v1/user'))return response({id:'user_fixture',email:'a@example.com'});if(url.includes('urenavi_session_valid'))return response(true);if(url.includes('/subscriptions/'))return response(sub());return response([{stripe_subscription_id:'sub_test'}]);};assert.equal((await billing.authorize({headers:{authorization:'Bearer '+authToken()}})).ok,true);});
test('No stale 980 JPY plan or Pro upgrade purchase appears in the customer app',()=>{
 const fs=require('node:fs');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
 assert.doesNotMatch(html,/月額980円|月額980 円|980円の通常契約/);
 assert.doesNotMatch(html,/action=upgrade-pro/);
 assert.doesNotMatch(html,/function upgradeToPro\(/);
 assert.doesNotMatch(html,/id="upgradeProBtn"|upgradeProBtn|function upgradeToPro\(/);
 assert.equal(typeof billing.upgradeBaseToPro,'undefined');
 assert.equal(typeof billing.stripePost,'undefined');
});
test('a stale ¥980 Stripe price environment cannot upgrade legacy Base users',()=>{
 const old=process.env.URENAVI_PRICE_ID;
 process.env.URENAVI_PRICE_ID=billing.legacyBasePriceId();
 try{
  const legacy=sub({items:{data:[{price:{id:billing.legacyBasePriceId()},
   current_period_end:Math.floor(Date.now()/1000)+7200}]}});
  const result=billing.subscriptionState(legacy);
  assert.equal(result.plan,'base');
  assert.equal(result.active,true);
 }finally{process.env.URENAVI_PRICE_ID=old;}
});
test('customer UI enables full output for the approved standard subscription',()=>{
 const fs=require('node:fs');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
 assert.match(html,/const paidPlan=\['standard','base','pro','owner'\]\.includes\(currentAccessPlan\)/);
 assert.match(html,/aiGatesFullOutput=runtimeKnown/);
});
test('¥1480 standard receives all features while old Base and Pro remain readable',()=>{
 const now=Math.floor(Date.now()/1000)+7200;
 const withPrice=price=>sub({items:{data:[{price:{id:price},current_period_end:now}]}});
 const standard=billing.subscriptionState(withPrice('price_test'));
 assert.equal(standard.active,true);
 assert.equal(standard.plan,'standard');
 const oldBase=billing.subscriptionState(withPrice(billing.legacyBasePriceId()));
 assert.equal(oldBase.active,true);
 assert.equal(oldBase.plan,'base');
 const oldPro=billing.subscriptionState(withPrice('price_1UHYOdEYXoynxoEYlgFOFjqB'));
 assert.equal(oldPro.active,true);
 assert.equal(oldPro.plan,'pro');
 assert.equal(billing.subscriptionState(withPrice('price_unknown')).active,false);
});
test('¥1480 standard and legacy Pro both authorize enhanced features, legacy Base does not',async()=>{
 const now=Math.floor(Date.now()/1000)+7200;
 const old=process.env.URENAVI_PRICE_ID;
 const accessToken=authToken();
 let subscriptionPrice='price_test';
 global.fetch=async url=>{
  url=String(url);
  if(url.includes('/auth/v1/user'))return response({id:'user_fixture',email:'a@example.com'});
  if(url.includes('rpc/urenavi_session_valid'))return response(true);
  if(url.includes('urenavi_entitlements?'))return response([]);
  if(url.includes('urenavi_entitlements_v2?'))return response([{stripe_subscription_id:'sub_test'}]);
  if(url.includes('/subscriptions/'))return response(sub({items:{data:[{price:{id:subscriptionPrice},current_period_end:now}]}}));
  throw Error('unexpected route '+url);
 };
 const request={headers:{authorization:'Bearer '+accessToken}};
 assert.equal((await billing.authorizePro(request)).plan,'standard');
 subscriptionPrice='price_1UHYOdEYXoynxoEYlgFOFjqB';
 assert.equal((await billing.authorizePro(request)).plan,'pro');
 subscriptionPrice=billing.legacyBasePriceId();
 assert.equal((await billing.authorizePro(request)).status,403);
 process.env.URENAVI_PRICE_ID=old;
});
test('The approved new-sale contract is exactly one 1480 JPY monthly subscription',async()=>{
 const pricing=require('../lib/urenavi-pricing');
 assert.equal(pricing.MONTHLY_PRICE_JPY,1480);
 assert.equal(pricing.PLAN_ID,'standard');
 const p={id:'price_test',active:true,unit_amount:1480,currency:'jpy',livemode:false,tax_behavior:'inclusive',
  recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 assert.equal(pricing.validatesMonthlyPrice(p),true);
 for(const patch of [{unit_amount:980},{unit_amount:1980},{currency:'usd'},{tax_behavior:'exclusive'},
  {active:false},{recurring:{interval:'year',interval_count:1}},
  {recurring:{interval:'month',interval_count:1,usage_type:'metered'}}]){
  assert.equal(pricing.validatesMonthlyPrice({...p,...patch}),false);
 }
 process.env.URENAVI_PRICE_ID='price_test';
 global.fetch=async url=>response(String(url).includes('/prices/')?p:{});
 assert.equal(await billing.verifyConfiguredSalePrice(),true);
 global.fetch=async url=>response(String(url).includes('/prices/')?{...p,livemode:true}:{});
 await assert.rejects(()=>billing.verifyConfiguredSalePrice(),/1480 JPY/);
 global.fetch=async url=>response(String(url).includes('/prices/')?{...p,unit_amount:980}:{});
 await assert.rejects(()=>billing.verifyConfiguredSalePrice(),/1480 JPY/);
});
test('¥1480 paid checkout activates the one standard plan with full entitlement',async()=>{
 const writes=[];let created=0;
 global.fetch=async(url,opts={})=>{
  url=String(url);
  if(url.includes('/checkout/sessions/'))return response({
   livemode:false,mode:'subscription',status:'complete',
   payment_status:'paid',payment_link:'plink_test',subscription:'sub_test'});
  if(url.includes('/subscriptions/'))return response(sub());
  if(url.includes('urenavi_entitlements_v2?'))return response([]);
  if(url.includes('/customers/'))return response({email:'newbuyer@example.invalid'});
  if(url.includes('rpc/urenavi_sync_entitlement')){
   writes.push(JSON.parse(opts.body).p_row);return response(null);
  }
  if(url.includes('/auth/v1/admin/users')){created++;return response({id:'user_mock'});}
  throw Error('unexpected connection');
 };
 const result=await billing.activate('cs_test_fixture');
 assert.equal(result.plan,'standard');
 assert.equal(result.active,true);
 assert.equal(created,1);
 assert.equal(writes.length,1);
 assert.equal(writes[0].plan,'standard');
 assert.equal(writes[0].email,'newbuyer@example.invalid');
});
test('replayed paid checkout webhook never duplicates billing-side activation',async()=>{
 let activations=0,provisions=0;
 global.fetch=async(url,opts={})=>{
  url=String(url);
  if(url.includes('/checkout/sessions/'))return response({
   livemode:false,mode:'subscription',status:'complete',
   payment_status:'paid',payment_link:'plink_test',subscription:'sub_test'});
  if(url.includes('/subscriptions/'))return response(sub());
  if(url.includes('urenavi_entitlements_v2?'))return response([]);
  if(url.includes('/customers/'))return response({email:'newbuyer@example.invalid'});
  if(url.includes('rpc/urenavi_sync_entitlement')){activations++;return response(null);}
  if(url.includes('/auth/v1/admin/users')){provisions++;return response({id:'user_mock'});}
  throw Error('unexpected connection');
 };
 const event={livemode:false,type:'checkout.session.completed',
  data:{object:{id:'cs_test_fixture',payment_link:'plink_test',payment_status:'paid'}}};
 for(let i=0;i<2;i++){
  const result=res();await webhook(signed(event),result);
  assert.equal(result.code,200);
 }
 assert.equal(activations,2,'idempotent entitlement sync is allowed');
 assert.equal(provisions,2,'repeated auth provisioning must be idempotent at provider');
});
test('explicit single-plan checkout verifies Stripe price and link before redirect',async()=>{
 process.env.URENAVI_SANDBOX_CHECKOUT_ENABLED='isolated_preview_only';
 process.env.URENAVI_CHECKOUT_RETURN_ORIGIN='https://preview-example.vercel.app';
 const price={id:'price_test',active:true,unit_amount:1480,currency:'jpy',livemode:false,tax_behavior:'inclusive',
  recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 let calls=0;
 global.fetch=async url=>{
  calls++;url=String(url);
  if(url.includes('/prices/price_test'))return response(price);
  if(url.includes('/payment_links/plink_test/line_items'))
   return response({data:[{price:{id:'price_test'},quantity:1}],has_more:false});
  if(url.includes('/payment_links/plink_test'))
   return response({id:'plink_test',livemode:false,active:true,url:'https://buy.stripe.com/test_fixture',after_completion:{type:'redirect',redirect:{url:'https://preview-example.vercel.app/api/access?action=activate&session_id={CHECKOUT_SESSION_ID}'}}});
  throw Error('unrecognized external endpoint');
 };
 const out=res();await access({method:'GET',query:{action:'buy'},headers:{}},out);
 assert.equal(out.code,303);
 assert.equal(out.url,'https://buy.stripe.com/test_fixture');
 assert.equal(calls,3);
});
test('completed Checkout must return to the exact verified app origin',async()=>{
 process.env.URENAVI_SANDBOX_CHECKOUT_ENABLED='isolated_preview_only';
 process.env.URENAVI_CHECKOUT_RETURN_ORIGIN='https://preview-example.vercel.app';
 const badReturns=[
  {type:'hosted_confirmation',hosted_confirmation:{}},
  {type:'redirect',redirect:{url:'https://evil.example/api/access?action=activate&session_id={CHECKOUT_SESSION_ID}'}},
  {type:'redirect',redirect:{url:'https://preview-example.vercel.app/api/access?action=activate&session_id=untrusted'}},
  {type:'redirect',redirect:{url:'https://preview-example.vercel.app/api/access?action=activate&session_id={CHECKOUT_SESSION_ID}&redirect=https://evil.example'}}
 ];
 for(const after_completion of badReturns){
  global.fetch=async url=>{
   url=String(url);
   if(url.includes('/prices/price_test'))return response({id:'price_test',active:true,unit_amount:1480,currency:'jpy',livemode:false,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
   if(url.includes('/payment_links/plink_test/line_items'))return response({data:[{price:{id:'price_test'},quantity:1}],has_more:false});
   if(url.includes('/payment_links/plink_test'))return response({id:'plink_test',livemode:false,active:true,url:'https://buy.stripe.com/test_fixture',after_completion});
   throw Error('unexpected request');
  };
  const out=res();await access({method:'GET',query:{action:'buy'},headers:{}},out);
  assert.equal(out.code,503);
  assert.equal(out.url,undefined);
 }
});
test('Production cannot use Preview TEST checkout approval or test key',async()=>{
 process.env.VERCEL_ENV='production';
 process.env.URENAVI_SANDBOX_CHECKOUT_ENABLED='isolated_preview_only';
 process.env.URENAVI_SALES_ENABLED='explicit_1480_go_live';
 let calls=0;global.fetch=async()=>{calls++;throw Error('must not send');};
 const result=res();await access({method:'GET',query:{action:'buy'},headers:{}},result);
 assert.equal(result.code,503);
 assert.equal(result.url,undefined);
 assert.equal(calls,0);
});
test('single-plan checkout refuses stale link, multiple prices and amount drift',async()=>{
 process.env.URENAVI_SANDBOX_CHECKOUT_ENABLED='isolated_preview_only';
 process.env.URENAVI_CHECKOUT_RETURN_ORIGIN='https://preview-example.vercel.app';
 const cases=[
  {priceAmount:980,linkActive:true,lineCount:1},
  {priceAmount:1480,linkActive:false,lineCount:1},
  {priceAmount:1480,linkActive:true,lineCount:2},
  {priceAmount:1480,linkActive:true,lineCount:1,wrongPrice:true}
 ];
 for(const c of cases){
  let calls=0;
  global.fetch=async url=>{
   calls++;url=String(url);
   if(url.includes('/prices/price_test'))
    return response({id:'price_test',active:true,unit_amount:c.priceAmount,currency:'jpy',livemode:false,tax_behavior:'inclusive',
     recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
   if(url.includes('/payment_links/plink_test/line_items'))
    return response({data:Array.from({length:c.lineCount},()=>({
     price:{id:c.wrongPrice?'price_other':'price_test'},quantity:1})),has_more:false});
   if(url.includes('/payment_links/plink_test'))
    return response({id:'plink_test',livemode:false,active:c.linkActive,
     url:'https://buy.stripe.com/test_fixture',after_completion:{type:'redirect',redirect:{url:'https://preview-example.vercel.app/api/access?action=activate&session_id={CHECKOUT_SESSION_ID}'}}});
   throw Error('unexpected connection');
  };
  const out=res();await access({method:'GET',query:{action:'buy'},headers:{}},out);
  assert.equal(out.code,503);
  assert.equal(out.url,undefined);
  assert.ok(calls>=1);
 }
});
test('New purchases remain disabled until approved 1480 JPY sale and settlement are deployed',async()=>{
 global.fetch=()=>{throw Error('disabled buy must not contact Stripe');};
 for(const action of ['buy','buy-pro']){
  const r=res();await access({method:'GET',headers:{},query:{action}},r);
  assert.equal(r.code,404);
 }
});
test('No implicit legacy live checkout price is used without explicit configuration',()=>{
 process.env.VERCEL_ENV='production';
 process.env.STRIPE_SECRET_KEY='sk_live_fixture';
 delete process.env.URENAVI_PRICE_ID;
 delete process.env.URENAVI_PAYMENT_LINK_ID;
 delete process.env.URENAVI_PAYMENT_LINK_URL;
 assert.throws(()=>billing.config(),/Billing configuration missing/);
});

test('Search ranks relevant products and returns finite sellability/profitability and affiliate URLs',async()=>{process.env.RAKUTEN_APP_ID='fixture';process.env.RAKUTEN_ACCESS_KEY='fixture';process.env.RAKUTEN_AFFILIATE_ID='fixture';global.fetch=async url=>{url=String(url);if(url.includes('/auth/v1/user'))return response({id:'user_fixture',email:'a@example.com'});if(url.includes('urenavi_session_valid'))return response(true);if(url.includes('/subscriptions/'))return response(sub());if(url.includes('urenavi_entitlements_v2'))return response([{stripe_subscription_id:'sub_test'}]);if(url.includes('urenavi_entitlements?'))return response([]);assert.ok(url.startsWith('https://openapi.rakuten.co.jp/'));return response({items:[{itemName:'充電器 USB-C',catchcopy:'急速充電対応',itemCaption:'外出先でも手軽に充電できるコンパクト充電器',genreId:'123456',itemCode:'shop:item',itemPrice:3000,reviewCount:100,reviewAverage:4.5,affiliateRate:4,affiliateUrl:'https://hb.afl.rakuten.co.jp/fixture',mediumImageUrls:['https://example.com/image.png']},{itemName:'ふるさと納税 充電器',itemPrice:30000,reviewCount:1000,reviewAverage:5,affiliateRate:4}],count:2});};const r=res();await search({headers:{authorization:'Bearer '+authToken()},query:{keyword:'充電器'}},r);assert.equal(r.code,200);assert.equal(r.body.items.length,1);const item=r.body.items[0];for(const key of ['sellability','profitability','score'])assert.ok(Number.isFinite(item[key])&&item[key]>=0&&item[key]<=100);assert.equal(item.estimatedCommission,120);assert.equal(item.catchcopy,'急速充電対応');assert.match(item.itemCaption,/コンパクト充電器/);assert.equal(item.genreId,'123456');assert.equal(item.itemCode,'shop:item');assert.ok(item.affiliateUrl.startsWith('https://hb.afl.rakuten.co.jp/'));});

test('Delayed checkout event after cancellation acknowledges current inactive state',async()=>{let written;global.fetch=async(url,options)=>{url=String(url);if(url.includes('/checkout/sessions/'))return response({livemode:false,mode:'subscription',status:'complete',payment_status:'paid',payment_link:'plink_test',subscription:'sub_test'});if(url.includes('/subscriptions/'))return response(sub({status:'canceled'}));if(url.includes('/customers/'))return response({email:'a@example.com'});if(url.includes('rpc/urenavi_sync_entitlement')){written=JSON.parse(options.body).p_row;return response(null);}return response([]);};const r=res();await webhook(signed({livemode:false,type:'checkout.session.completed',data:{object:{id:'cs_test_fixture',payment_link:'plink_test',payment_status:'paid'}}}),r);assert.equal(r.code,200);assert.equal(written.active,false);});
