// Deployment retry after transient Vercel patchBuild failure.
const crypto = require('node:crypto');
const {MONTHLY_PRICE_JPY,validatesMonthlyPrice}=require('./urenavi-pricing');
const LIVE_PRO = { url:'https://buy.stripe.com/eVqeVd0mU12DeDKbslgfu02', link:'plink_1UHYegEYXoynxoEY4LNHHGn1', price:'price_1UHYeaEYXoynxoEYU9yTIPlk' };
const TEST_PRO = { url:'https://buy.stripe.com/test_9B63cv0mU3aL2V2aohgfu01', link:'plink_1UHYSrEYXoynxoEYBniSNulq', price:'price_1UHYOdEYXoynxoEYlgFOFjqB' };
// Read-only entitlement compatibility. These historical IDs are NEVER
// accepted as new checkout prices under the ¥1,480 single-plan contract.
const LEGACY_BASE_PRICE_ID={
 production:'price_1UAfsLEYXoynxoEYlxhQcJL9',
 test:'price_1UA4hdIjWIM1d80ULg9r4eSi'
};
function legacyBasePriceId(){
 return env('URENAVI_LEGACY_BASE_PRICE_ID',
  env('VERCEL_ENV')==='production'?LEGACY_BASE_PRICE_ID.production:LEGACY_BASE_PRICE_ID.test);
}
const DEVICE_COOKIE='urenavi_device_v1';
const DEVICE_MAX_AGE=180*24*60*60;
const env = (name, fallback='') => String(process.env[name] || fallback).trim();
const ISOLATED_CUSTOMER_DB='https://vyzpklomggsazwigxkfh.supabase.co';
const DEFAULT_DB_URL='https://upooxcugrplfmjnqpuxs.supabase.co';
const DEFAULT_PUBLISHABLE_KEY='sb_publishable_OBQUoiuGzy_YagoMeAnHYg_BTNfn8j5';

function isIsolatedRoomPreview(){
  return env('VERCEL_ENV')==='preview' &&
    env('VERCEL_GIT_COMMIT_REF')==='experiment/urenavi-groq-room-copy-20261122';
}

function authClientConfig({browser=false}={}){
  if(!isIsolatedRoomPreview()){
    if(browser) return {url:DEFAULT_DB_URL,publishableKey:DEFAULT_PUBLISHABLE_KEY};
    return {url:env('SUPABASE_URL',DEFAULT_DB_URL),publishableKey:env('SUPABASE_PUBLISHABLE_KEY',DEFAULT_PUBLISHABLE_KEY)};
  }
  const publishableKey=env('URENAVI_ISOLATED_SUPABASE_PUBLISHABLE_KEY');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey))
    throw new Error('Isolated Auth configuration missing');
  return {url:ISOLATED_CUSTOMER_DB,publishableKey};
}

function customerDbUrl(){
  return isIsolatedRoomPreview()?ISOLATED_CUSTOMER_DB:env('SUPABASE_URL',DEFAULT_DB_URL);
}

function customerDbKey(){
  const key=isIsolatedRoomPreview()?env('URENAVI_COMPARISON_REMOTE_SERVICE_KEY'):env('SUPABASE_SERVICE_ROLE_KEY');
  if(!key) throw new Error('Database configuration missing');
  return key;
}

function config() {
  const live = env('VERCEL_ENV') === 'production';
  const key = env('STRIPE_SECRET_KEY');
  if (!new RegExp(`^[sr]k_${live ? 'live' : 'test'}_`).test(key)) throw new Error('Stripe environment mismatch');
  // No silent legacy Stripe price/link fallback. Sale is separately disabled
  // at /api/access until the 1480 JPY subscription price is verified.
  const price = env('URENAVI_PRICE_ID');
  const link = env('URENAVI_PAYMENT_LINK_ID');
  const url = env('URENAVI_PAYMENT_LINK_URL');
  if (!price || !link || !url) throw new Error('Billing configuration missing');
  const parsed = new URL(url);
  if (parsed.origin !== 'https://buy.stripe.com' || (!live && !parsed.pathname.startsWith('/test_'))) throw new Error('Payment link environment mismatch');
  return { live, key, price, link, url, monthlyPriceJpy:MONTHLY_PRICE_JPY };
}
function proConfig({required=false}={}) {
  const base=config();
  const fallback=base.live ? LIVE_PRO : TEST_PRO;
  const price=env('URENAVI_PRO_PRICE_ID',fallback.price);
  const link=env('URENAVI_PRO_PAYMENT_LINK_ID',fallback.link);
  const url=env('URENAVI_PRO_PAYMENT_LINK_URL',fallback.url);
  if(!price || !link || !url){
    if(required) throw new Error('Pro billing configuration missing');
    return null;
  }
  const parsed=new URL(url);
  if(parsed.origin!=='https://buy.stripe.com' || (!base.live && !parsed.pathname.startsWith('/test_'))) throw new Error('Pro payment link environment mismatch');
  return {...base,price,link,url};
}
async function stripeGet(path) {
  const c = config();
  const r = await fetch('https://api.stripe.com/v1' + path, {headers:{Authorization:`Bearer ${c.key}`, 'Stripe-Version':'2026-08-26.dahlia'},signal:AbortSignal.timeout(12000)});
  if (!r.ok) throw new Error(`Stripe request failed (${r.status})`);
  return r.json();
}
// Fail closed for future checkout: a Stripe Price ID alone does not prove
// the amount. This validation performs a read-only Stripe API call.
async function verifyConfiguredSalePrice(){
 const c=config();
 const price=await stripeGet('/prices/'+encodeURIComponent(c.price));
 if(price?.id!==c.price||price?.livemode!==c.live||!validatesMonthlyPrice(price))
  throw new Error('Configured Stripe price is not the approved 1480 JPY monthly plan');
 return true;
}
// Complete purchase verification: never trust just a Price ID or URL.
// The link must be active, belong to the same Stripe mode/account, and
// contain exactly one ¥1,480 monthly subscription price with quantity 1.
async function verifyConfiguredCheckout(){
 const c=config();
 await verifyConfiguredSalePrice();
 const link=await stripeGet('/payment_links/'+encodeURIComponent(c.link));
 if(!link||link.id!==c.link||link.livemode!==c.live||
    link.active!==true||link.url!==c.url)
  throw new Error('Configured payment link is not approved');
 // A paid session must return to the verified app activation endpoint.
 // A hosted confirmation-only link would strand purchasers without access.
 const configuredReturnOrigin=env('URENAVI_CHECKOUT_RETURN_ORIGIN');
 const redirect=String(link.after_completion?.redirect?.url||'');
 let verifiedReturn=false;
 try{
  const origin=new URL(configuredReturnOrigin);
  const target=new URL(redirect);
  verifiedReturn=origin.protocol==='https:'&&origin.origin===configuredReturnOrigin&&
   target.origin===origin.origin&&target.pathname==='/api/access'&&
   target.searchParams.get('action')==='activate'&&
   target.searchParams.get('session_id')==='{CHECKOUT_SESSION_ID}'&&
   [...target.searchParams.keys()].sort().join(',')==='action,session_id'&&
   !target.hash;
 }catch{}
 if(link.after_completion?.type!=='redirect'||!verifiedReturn)
  throw new Error('Configured payment link does not return to verified app activation');
 const lines=await stripeGet('/payment_links/'+encodeURIComponent(c.link)+'/line_items?limit=100');
 if(lines?.has_more||!Array.isArray(lines?.data)||lines.data.length!==1||
    (typeof lines.data[0]?.price==='string'?lines.data[0].price:lines.data[0]?.price?.id)!==c.price||
    lines.data[0]?.quantity!==1)
  throw new Error('Configured payment link items are not the single ¥1480 plan');
 return c.url;
}
async function db(path, options={}) {
  const key = customerDbKey();
  const base = customerDbUrl();
  const method=String(options.method||'GET').toUpperCase();
  const retryable=method==='GET' || path==='rpc/urenavi_session_valid';
  const request=async()=>{
    const r = await fetch(base + '/rest/v1/' + path,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(12000)});
    if (!r.ok) {
      const error=new Error(`Database request failed (${r.status})`);
      error.status=r.status;
      throw error;
    }
    if(r.status===204) return null;
    const text=await r.text();
    if(!text){
      if(method!=='GET' && /return=minimal/i.test(String(options.headers?.Prefer||''))) return null;
      throw new Error('Database returned an empty response');
    }
    try{return JSON.parse(text);}catch{throw new Error('Database returned invalid JSON');}
  };
  try{return await request();}catch(error){
    const status=Number(error?.status||0);
    const transient=status===408 || status===425 || status===429 || status>=500 || /empty response|invalid JSON/i.test(String(error?.message||''));
    if(!retryable || !transient) throw error;
    await new Promise(resolve=>setTimeout(resolve,250));
    return request();
  }
}
const id = x => typeof x === 'string' ? x : x?.id;
function subscriptionState(sub) {
  const c = config();
  const pc = proConfig();
  const all = sub.items?.data || [];
  // Never reclassify a historical 980-JPY Base price (or legacy Pro price)
  // as the new standard plan merely because an old environment variable
  // still points to it. This guards Preview rollout against privilege drift.
  const standardPriceIsNew=c.price!==legacyBasePriceId() && c.price!==pc?.price;
  const standardItems = standardPriceIsNew?all.filter(x=>id(x.price)===c.price):[];
  const proItems = pc ? all.filter(x=>id(x.price)===pc.price) : [];
  const baseItems = all.filter(x=>id(x.price)===legacyBasePriceId());
  const items = standardItems.length?standardItems:proItems.length?proItems:baseItems;
  const plan = standardItems.length?'standard':proItems.length?'pro':baseItems.length?'base':null;
  const end = Math.min(...items.map(x=>Number(x.current_period_end || sub.current_period_end || 0)));
  const active = sub.livemode === c.live && items.length > 0 && sub.status === 'active' && Number.isFinite(end) && end*1000 > Date.now();
  return {active,plan,current_period_end:Number.isFinite(end) && end > 0 ? new Date(end*1000).toISOString() : null};
}
// Preview Stripe TEST subscriptions must never provision customers or write
// entitlements into the real Production Supabase.
function requireSafeCustomerWriteDestination(){
 if(env('VERCEL_ENV')==='preview'){
  if(customerDbUrl().replace(/\/$/,'')!==ISOLATED_CUSTOMER_DB)
   throw new Error('Preview customer writes require the isolated Supabase');
  if(isIsolatedRoomPreview()) customerDbKey();
 }
}
async function syncSubscription(subscriptionId) {
  requireSafeCustomerWriteDestination();
  const observed = new Date().toISOString();
  const sub = await stripeGet('/subscriptions/' + encodeURIComponent(subscriptionId));
  const c = config();
  if (sub.livemode !== c.live) throw new Error('Subscription environment mismatch');
  const existing = await db('urenavi_entitlements_v2?stripe_subscription_id=eq.'+encodeURIComponent(sub.id)+'&livemode=eq.'+c.live+'&select=email');
  const pc=proConfig();
  const eligiblePrices=[c.price,pc?.price,legacyBasePriceId()].filter(Boolean);
  if (!sub.items?.data?.some(x => eligiblePrices.includes(id(x.price))) && !existing.length) return null;
  const customer = await stripeGet('/customers/' + encodeURIComponent(id(sub.customer)));
  const email = String(existing[0]?.email || customer.email || '').trim().toLowerCase();
  if (!email) throw new Error('Customer email missing');
  const row = {email,livemode:c.live,stripe_customer_id:id(sub.customer),stripe_subscription_id:sub.id,status:sub.status,...subscriptionState(sub),updated_at:observed};
  await db('rpc/urenavi_sync_entitlement',{method:'POST',body:JSON.stringify({p_row:row})});
  return row;
}
async function ensureAuthUser(email) {
  requireSafeCustomerWriteDestination();
  const key = customerDbKey();
  const r = await fetch(customerDbUrl()+'/auth/v1/admin/users',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({email,email_confirm:true}),signal:AbortSignal.timeout(12000)});
  if (r.ok) return;
  const data = await r.json().catch(()=>({}));
  if (data.code === 'email_exists' || data.error_code === 'email_exists') return;
  throw new Error(`User provisioning failed (${r.status})`);
}
async function activate(sessionId, {requireActive=true,plan='base'}={}) {
  requireSafeCustomerWriteDestination();
  if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId)) throw new Error('Invalid checkout session');
  const session = await stripeGet('/checkout/sessions/'+encodeURIComponent(sessionId));
  const c = plan==='pro' ? proConfig({required:true}) : config();
  if (session.livemode !== c.live || session.mode !== 'subscription' || session.status !== 'complete' || session.payment_status !== 'paid' || id(session.payment_link) !== c.link || !id(session.subscription)) throw new Error('Purchase not eligible');
  const row = await syncSubscription(id(session.subscription));
  if (!row) throw new Error('Subscription not eligible');
  if (requireActive && (!row.active || (plan==='pro' && row.plan!=='pro'))) throw new Error('Subscription inactive');
  if (row.active) await ensureAuthUser(row.email);
  return row;
}
function deviceSecret(){
  const seed=customerDbKey();
  return crypto.createHash('sha256').update('urenavi-device-v1|'+seed).digest();
}
function makeDeviceToken(email){
  const payload=Buffer.from(JSON.stringify({e:String(email).trim().toLowerCase(),l:config().live,x:Date.now()+DEVICE_MAX_AGE*1000})).toString('base64url');
  const sig=crypto.createHmac('sha256',deviceSecret()).update(payload).digest('base64url');
  return payload+'.'+sig;
}
function readDeviceToken(req){
  const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(DEVICE_COOKIE+'='));
  if(!raw) return null;
  const token=decodeURIComponent(raw.slice(DEVICE_COOKIE.length+1));
  const [payload,sig]=token.split('.');
  if(!payload||!sig) return null;
  const expected=crypto.createHmac('sha256',deviceSecret()).update(payload).digest();
  let given;
  try{given=Buffer.from(sig,'base64url');}catch{return null;}
  if(given.length!==expected.length || !crypto.timingSafeEqual(given,expected)) return null;
  let data;
  try{data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;}
  if(!data?.e || data.l!==config().live || !Number.isFinite(data.x) || data.x<=Date.now()) return null;
  return {email:String(data.e).toLowerCase()};
}
function setDeviceCookie(res,email){
  const token=makeDeviceToken(email);
  res.setHeader('Set-Cookie',`${DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${DEVICE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
}
function clearDeviceCookie(res){
  res.setHeader('Set-Cookie',`${DEVICE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}
async function authorizeEmail(email){
  const c=config();
  const normalized=String(email||'').trim().toLowerCase();
  if(!normalized) return {ok:false,status:401};

  // The owner may use Urenavi in both Preview and Production when the
  // legacy entitlement row explicitly marks the account as owner+active.
  // Everyone else must have an active subscription for the current
  // Stripe environment. A remembered device cookie never bypasses this check.
  const old=await db('urenavi_entitlements?'+new URLSearchParams({email:'eq.'+normalized,select:'status,active,stripe_subscription_id'}));
  if(old.some(x=>x.status==='owner'&&x.active===true)) return {ok:true,user:{email:normalized},plan:'owner'};

  const query=new URLSearchParams({email:'eq.'+normalized,livemode:'eq.'+c.live,select:'stripe_subscription_id'});
  let rows=await db('urenavi_entitlements_v2?'+query);
  if(c.live) rows=rows.concat(old.filter(x=>x.stripe_subscription_id));

  let bestPlan=null;
  for(const subscriptionId of new Set(rows.map(x=>x.stripe_subscription_id).filter(Boolean))){
    const sub=await stripeGet('/subscriptions/'+encodeURIComponent(subscriptionId));
    const state=subscriptionState(sub);
    if(!state.active) continue;
    if(state.plan==='standard') bestPlan='standard';
    else if(state.plan==='pro' && bestPlan!=='standard') bestPlan='pro';
    else if(!bestPlan && state.plan==='base') bestPlan='base';
  }
  if(bestPlan) return {ok:true,user:{email:normalized},plan:bestPlan};
  return {ok:false,status:403};
}
async function authorize(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer (\S+)$/)?.[1];
  if (token && token!=='device-cookie') {
    const {url,publishableKey}=authClientConfig();
    const r = await fetch(url+'/auth/v1/user',{headers:{Authorization:`Bearer ${token}`,apikey:publishableKey},signal:AbortSignal.timeout(12000)});
    if (r.ok) {
      const user = await r.json();
      let claims;
      try { claims = JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()); } catch { claims=null; }
      if (user.id && user.email && claims?.sub === user.id && claims.session_id) {
        const valid = await db('rpc/urenavi_session_valid',{method:'POST',body:JSON.stringify({p_session_id:claims.session_id,p_user_id:user.id})});
        if (valid) {
          const result=await authorizeEmail(user.email);
          if(result.ok) return {ok:true,user,plan:result.plan};
          if(result.status===403) return result;
        }
      }
    }
  }
  const device=readDeviceToken(req);
  if(device) return authorizeEmail(device.email);
  return {ok:false,status:401};
}
function verifySignature(raw, signature, secret, now=Math.floor(Date.now()/1000)) {
  if (!secret) throw new Error('Webhook secret missing');
  const parts = String(signature||'').split(',').map(x=>x.split('='));
  const t = Number(parts.find(x=>x[0]==='t')?.[1]);
  if (!Number.isInteger(t) || Math.abs(now-t)>300) throw new Error('Invalid signature');
  const expected = crypto.createHmac('sha256',secret).update(String(t)+'.').update(raw).digest();
  if (!parts.some(([k,v])=>k==='v1' && /^[a-f0-9]{64}$/i.test(v||'') && crypto.timingSafeEqual(expected,Buffer.from(v,'hex')))) throw new Error('Invalid signature');
  return JSON.parse(raw.toString('utf8'));
}
async function authorizeProEmail(email){
  const result=await authorizeEmail(email);
  if(!result.ok) return result;
  if(['owner','pro','standard'].includes(result.plan)) return result;
  return {ok:false,status:403};
}
async function authorizePro(req){
  const result=await authorize(req);
  if(!result.ok) return result;
  if(['owner','pro','standard'].includes(result.plan)) return result;
  return {ok:false,status:403};
}
module.exports = {config,authClientConfig,requireSafeCustomerWriteDestination,legacyBasePriceId,verifyConfiguredSalePrice,verifyConfiguredCheckout,proConfig,db,stripeGet,subscriptionState,syncSubscription,ensureAuthUser,activate,authorize,authorizePro,authorizeProEmail,setDeviceCookie,clearDeviceCookie,verifySignature};