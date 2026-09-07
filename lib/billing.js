const crypto = require('node:crypto');
const LIVE = { url:'https://buy.stripe.com/dRm14nd9G7r1eDK2VPgfu00', link:'plink_1UB10QEYXoynxoEYCG0ONQkC', price:'price_1UAfsLEYXoynxoEYlxhQcJL9' };
const env = (name, fallback='') => String(process.env[name] || fallback).trim();
function config() {
  const live = env('VERCEL_ENV') === 'production';
  const key = env('STRIPE_SECRET_KEY');
  if (!new RegExp(`^[sr]k_${live ? 'live' : 'test'}_`).test(key)) throw new Error('Stripe environment mismatch');
  const price = env('URENAVI_PRICE_ID', live ? LIVE.price : '');
  const link = env('URENAVI_PAYMENT_LINK_ID', live ? LIVE.link : '');
  const url = env('URENAVI_PAYMENT_LINK_URL', live ? LIVE.url : '');
  if (!price || !link || !url) throw new Error('Billing configuration missing');
  const parsed = new URL(url);
  if (parsed.origin !== 'https://buy.stripe.com' || (!live && !parsed.pathname.startsWith('/test_'))) throw new Error('Payment link environment mismatch');
  return { live, key, price, link, url };
}
async function stripeGet(path) {
  const c = config();
  const r = await fetch('https://api.stripe.com/v1' + path, {headers:{Authorization:`Bearer ${c.key}`, 'Stripe-Version':'2026-08-26.dahlia'},signal:AbortSignal.timeout(12000)});
  if (!r.ok) throw new Error(`Stripe request failed (${r.status})`);
  return r.json();
}
async function db(path, options={}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Database configuration missing');
  const base = env('SUPABASE_URL','https://upooxcugrplfmjnqpuxs.supabase.co');
  const r = await fetch(base + '/rest/v1/' + path,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(12000)});
  if (!r.ok) throw new Error(`Database request failed (${r.status})`);
  return r.status === 204 ? null : r.json();
}
const id = x => typeof x === 'string' ? x : x?.id;
function subscriptionState(sub) {
  const c = config();
  const items = sub.items?.data?.filter(x => id(x.price) === c.price) || [];
  const end = Math.min(...items.map(x=>Number(x.current_period_end || sub.current_period_end || 0)));
  const active = sub.livemode === c.live && items.length > 0 && sub.status === 'active' && Number.isFinite(end) && end*1000 > Date.now();
  return {active, current_period_end:Number.isFinite(end) && end > 0 ? new Date(end*1000).toISOString() : null};
}
async function syncSubscription(subscriptionId) {
  const observed = new Date().toISOString();
  const sub = await stripeGet('/subscriptions/' + encodeURIComponent(subscriptionId));
  const c = config();
  if (sub.livemode !== c.live) throw new Error('Subscription environment mismatch');
  const existing = await db('urenavi_entitlements_v2?stripe_subscription_id=eq.'+encodeURIComponent(sub.id)+'&livemode=eq.'+c.live+'&select=email');
  if (!sub.items?.data?.some(x => id(x.price) === c.price) && !existing.length) return null;
  const customer = await stripeGet('/customers/' + encodeURIComponent(id(sub.customer)));
  const email = String(existing[0]?.email || customer.email || '').trim().toLowerCase();
  if (!email) throw new Error('Customer email missing');
  const row = {email,livemode:c.live,stripe_customer_id:id(sub.customer),stripe_subscription_id:sub.id,status:sub.status,...subscriptionState(sub),updated_at:observed};
  await db('rpc/urenavi_sync_entitlement',{method:'POST',body:JSON.stringify({p_row:row})});
  return row;
}
async function ensureAuthUser(email) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(env('SUPABASE_URL','https://upooxcugrplfmjnqpuxs.supabase.co')+'/auth/v1/admin/users',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({email,email_confirm:true}),signal:AbortSignal.timeout(12000)});
  if (r.ok) return;
  const data = await r.json().catch(()=>({}));
  if (data.code === 'email_exists' || data.error_code === 'email_exists') return;
  throw new Error(`User provisioning failed (${r.status})`);
}
async function activate(sessionId, {requireActive=true}={}) {
  if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId)) throw new Error('Invalid checkout session');
  const session = await stripeGet('/checkout/sessions/'+encodeURIComponent(sessionId));
  const c = config();
  if (session.livemode !== c.live || session.mode !== 'subscription' || session.status !== 'complete' || session.payment_status !== 'paid' || id(session.payment_link) !== c.link || !id(session.subscription)) throw new Error('Purchase not eligible');
  const row = await syncSubscription(id(session.subscription));
  if (!row) throw new Error('Subscription not eligible');
  if (requireActive && !row.active) throw new Error('Subscription inactive');
  if (row.active) await ensureAuthUser(row.email);
  return row;
}
async function authenticate(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer (\S+)$/)?.[1];
  if (!token) return {ok:false,status:401};
  const r = await fetch(env('SUPABASE_URL','https://upooxcugrplfmjnqpuxs.supabase.co')+'/auth/v1/user',{headers:{Authorization:`Bearer ${token}`,apikey:env('SUPABASE_PUBLISHABLE_KEY','sb_publishable_OBQUoiuGzy_YagoMeAnHYg_BTNfn8j5')},signal:AbortSignal.timeout(12000)});
  if (!r.ok) return {ok:false,status:401};
  const user = await r.json();
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()); } catch { return {ok:false,status:401}; }
  if (!user.id || !user.email || claims.sub !== user.id || !claims.session_id) return {ok:false,status:401};
  // Auth validated the JWT above; check the particular session, including logout and its 30-day age.
  const valid = await db('rpc/urenavi_session_valid',{method:'POST',body:JSON.stringify({p_session_id:claims.session_id,p_user_id:user.id})});
  if (!valid) return {ok:false,status:401};
  return {ok:true,user};
}
async function authorize(req) {
  const identity=await authenticate(req);
  if(!identity.ok) return identity;
  const {user}=identity;
  const c = config();
  const query = new URLSearchParams({email:'eq.'+user.email.toLowerCase(),livemode:'eq.'+c.live,select:'stripe_subscription_id'});
  let rows = await db('urenavi_entitlements_v2?'+query);
  if (c.live) {
    const old = await db('urenavi_entitlements?'+new URLSearchParams({email:'eq.'+user.email.toLowerCase(),select:'status,active,stripe_subscription_id'}));
    if (old.some(x=>x.status==='owner' && x.active===true)) return {ok:true,user};
    rows = rows.concat(old.filter(x=>x.stripe_subscription_id));
  }
  for (const subscriptionId of new Set(rows.map(x=>x.stripe_subscription_id))) {
    const sub = await stripeGet('/subscriptions/'+encodeURIComponent(subscriptionId));
    if (subscriptionState(sub).active) return {ok:true,user};
  }
  return {ok:false,status:403};
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
module.exports = {config,db,stripeGet,subscriptionState,syncSubscription,ensureAuthUser,activate,authenticate,authorize,verifySignature};