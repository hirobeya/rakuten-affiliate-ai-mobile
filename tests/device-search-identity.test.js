'use strict';
const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const billing=require('../lib/billing'),search=require('../api/search');
const originalFetch=global.fetch,originalEnv={...process.env};
const uid='12345678-1234-4123-8123-123456789abc',email='owner@example.test';
const user={id:uid,email,email_confirmed_at:'2026-01-01T00:00:00Z'};
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data,text:async()=>JSON.stringify(data)};}
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
function cookie(){const r=res();billing.setDeviceCookie(r,email);return r.headers['Set-Cookie'].split(';')[0];}
function jwt(){return ['fixture',Buffer.from(JSON.stringify({sub:uid,session_id:'session_fixture'})).toString('base64url'),'fixture'].join('.');}
function fixture({active=true,users=[user],adminStatus=200,allowed=true,bearerStatus=200}={}){
 const seen={admin:0,quota:[],rws:0,entitlement:0};
 global.fetch=async(url,options={})=>{
  const u=new URL(String(url));
  if(u.pathname==='/auth/v1/user')return response(user,bearerStatus);
  if(u.pathname==='/auth/v1/admin/users'){
   seen.admin++;assert.equal(u.searchParams.get('filter'),email);assert.equal(options.method||'GET','GET');
   return response({users},adminStatus);
  }
  if(u.pathname.endsWith('/rpc/urenavi_session_valid'))return response(true);
  if(u.pathname.endsWith('/urenavi_entitlements')){seen.entitlement++;return response(active?[{status:'owner',active:true}]:[]);}
  if(u.pathname.endsWith('/urenavi_entitlements_v2'))return response([]);
  if(u.pathname.endsWith('/rpc/urenavi_claim_search_daily')){seen.quota.push(JSON.parse(options.body).p_user_id);return response([{allowed}]);}
  seen.rws++;return response({items:[],count:0});
 };
 return seen;
}
beforeEach(()=>Object.assign(process.env,{VERCEL_ENV:'preview',STRIPE_SECRET_KEY:'sk_test_fixture',URENAVI_PRICE_ID:'price_test',URENAVI_PAYMENT_LINK_ID:'plink_test',URENAVI_PAYMENT_LINK_URL:'https://buy.stripe.com/test_fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',RAKUTEN_APP_ID:'fixture',RAKUTEN_ACCESS_KEY:'fixture',RAKUTEN_AFFILIATE_ID:'fixture'}));
afterEach(()=>{global.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv);});
test('approved paid device and verified bearer use the same real user ID and atomic search quota',async()=>{
 const seen=fixture();
 for(const headers of [{cookie:cookie(),authorization:'Bearer device-cookie','x-user-id':'client-supplied'},{authorization:'Bearer '+jwt()}]){
  const r=res();await search({headers,query:{keyword:'洗濯ネット',userId:'untrusted',email:'other@example.test'}},r);assert.equal(r.code,200);
 }
 assert.deepEqual(seen.quota,[uid,uid]);assert.equal(seen.admin,1);assert.equal(seen.rws,2);
});
test('missing or forged device cannot reach user lookup, quota, or product API',async()=>{
 const seen=fixture(),valid=cookie();
 for(const headers of [{authorization:'Bearer device-cookie'},{cookie:valid+'tamper',authorization:'Bearer device-cookie'},{}]){const r=res();await search({headers,query:{keyword:'洗濯ネット'}},r);assert.equal(r.code,401);}
 assert.equal(seen.admin,0);assert.deepEqual(seen.quota,[]);assert.equal(seen.rws,0);
});
test('device requires current paid entitlement and never creates free access',async()=>{
 const seen=fixture({active:false});const r=res();await search({headers:{cookie:cookie(),authorization:'Bearer device-cookie'},query:{keyword:'洗濯ネット'}},r);
 assert.equal(r.code,403);assert.equal(seen.admin,0);assert.deepEqual(seen.quota,[]);assert.equal(seen.rws,0);
});
test('free bearer remains entitlement-independent and an invalid bearer cannot use cookie fallback',async()=>{
 let seen=fixture({active:false}),r=res();await search({headers:{authorization:'Bearer '+jwt()},query:{keyword:'洗濯ネット'}},r);assert.equal(r.code,200);assert.equal(seen.entitlement,0);assert.equal(seen.admin,0);assert.deepEqual(seen.quota,[uid]);
 seen=fixture({bearerStatus:401});r=res();await search({headers:{authorization:'Bearer '+jwt(),cookie:cookie()},query:{keyword:'洗濯ネット'}},r);assert.equal(r.code,401);assert.equal(seen.admin,0);assert.deepEqual(seen.quota,[]);
});
test('expired remembered device cannot reach identity lookup or search',async()=>{
 const seen=fixture(),remembered=cookie(),oldNow=Date.now;
 try{Date.now=()=>oldNow()+181*24*60*60*1000;const r=res();await search({headers:{cookie:remembered,authorization:'Bearer device-cookie'},query:{keyword:'洗濯ネット'}},r);assert.equal(r.code,401);assert.equal(seen.admin,0);assert.deepEqual(seen.quota,[]);assert.equal(seen.rws,0);}
 finally{Date.now=oldNow;}
});
test('lookup must return one exact confirmed non-banned identity, not a related email or client ID',async()=>{
 for(const users of [[{...user,email:'other-'+email}],[user,{...user}],[{...user,id:'not-a-uuid'}],[{...user,email_confirmed_at:null}],[{...user,email_confirmed_at:'invalid'}],[{...user,banned_until:'2099-01-01T00:00:00Z'}],[{...user,banned_until:'invalid'}],[{...user,deleted_at:'2026-10-01'}]]){
  const seen=fixture({users});const r=res();await search({headers:{cookie:cookie(),authorization:'Bearer device-cookie'},query:{keyword:'洗濯ネット'}},r);assert.equal(r.code,401);assert.deepEqual(seen.quota,[]);assert.equal(seen.rws,0);
 }
});
test('lookup outage does not become an expired login, and quota exhaustion does not call product API',async()=>{
 let seen=fixture({adminStatus:503}),r=res();await search({headers:{cookie:cookie(),authorization:'Bearer device-cookie'},query:{keyword:'洗濯ネット'}},r);assert.equal(r.code,500);assert.deepEqual(seen.quota,[]);assert.equal(seen.rws,0);
 seen=fixture({allowed:false});r=res();await search({headers:{cookie:cookie(),authorization:'Bearer device-cookie'},query:{keyword:'洗濯ネット'}},r);assert.equal(r.code,429);assert.deepEqual(seen.quota,[uid]);assert.equal(seen.rws,0);
});
