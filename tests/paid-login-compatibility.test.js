'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../lib/billing'),'utf8');
// Execute the real paid authorizer with only synthetic local responses.
function setup({plan='base',active=true,valid=true,authStatus=200,subMismatch=false,outage=false}={}){
 const uid='12345678-1234-4123-8123-123456789abc',email='customer@example.invalid',seen=[];
 const context={module:{exports:{}},require:name=>{assert.equal(name,'node:crypto');return require(name);},Buffer,URL,URLSearchParams,AbortSignal,Date,setTimeout,
  process:{env:{VERCEL_ENV:'preview',STRIPE_SECRET_KEY:'sk_test_synthetic',URENAVI_PRICE_ID:'price_base',URENAVI_PAYMENT_LINK_ID:'plink_synthetic',URENAVI_PAYMENT_LINK_URL:'https://buy.stripe.com/test_synthetic',URENAVI_PRO_PRICE_ID:'price_pro',SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'}},
  fetch:async(input,options={})=>{
   const url=new URL(input);seen.push(url.pathname);
   const response=(body,status=200)=>({ok:status===200,status,json:async()=>body,text:async()=>JSON.stringify(body)});
   if(url.pathname==='/auth/v1/user')return response({id:uid,email},authStatus);
   if(url.pathname==='/rest/v1/rpc/urenavi_session_valid'){
    assert.deepEqual(JSON.parse(options.body),{p_session_id:'synthetic-session',p_user_id:uid});return response(valid);
   }
   if(url.pathname.startsWith('/rest/v1/urenavi_entitlements')){
    assert.equal(url.searchParams.get('email'),'eq.'+email);
    if(outage)throw Error('synthetic entitlement outage');
    return response(url.pathname.endsWith('_v2')?[{stripe_subscription_id:'sub_synthetic'}]:[]);
   }
   if(url.pathname==='/v1/subscriptions/sub_synthetic')return response({livemode:false,status:active?'active':'canceled',items:{data:[{price:plan==='pro'?'price_pro':'price_base',current_period_end:Math.floor(Date.now()/1000)+3600}]}});
   throw Error('Unexpected offline route');
  }};
 vm.runInNewContext(source,context);
 const token='synthetic.'+Buffer.from(JSON.stringify({sub:subMismatch?'other-user':uid,session_id:'synthetic-session'})).toString('base64url')+'.synthetic';
 return {seen,run:()=>context.module.exports.authorize({headers:{authorization:'Bearer '+token},query:{email:'owner@example.invalid',user_id:'other-user'}})};
}
for(const plan of ['base','pro'])test('ordinary active '+plan+' customer is authorized without owner membership',async()=>{
 const x=setup({plan}),result=await x.run();assert.equal(result.ok,true);assert.equal(result.plan,plan);assert.equal(result.user.email,'customer@example.invalid');assert.ok(x.seen.includes('/v1/subscriptions/sub_synthetic'));
});
test('inactive subscription cannot obtain paid access',async()=>{const r=await setup({active:false}).run();assert.equal(r.ok,false);assert.equal(r.status,403);});
test('revoked session cannot reach subscription lookup',async()=>{const x=setup({valid:false}),r=await x.run();assert.equal(r.ok,false);assert.equal(r.status,401);assert.ok(!x.seen.some(p=>p.includes('entitlements')));});
test('invalid bearer cannot reach entitlement lookup',async()=>{const x=setup({authStatus:401}),r=await x.run();assert.equal(r.ok,false);assert.equal(r.status,401);assert.equal(x.seen.length,1);});
test('mismatched user identity cannot reach session or entitlement lookup',async()=>{const x=setup({subMismatch:true}),r=await x.run();assert.equal(r.ok,false);assert.equal(r.status,401);assert.equal(x.seen.length,1);});
test('entitlement outage remains an error and never grants paid access',async()=>{await assert.rejects(setup({outage:true}).run(),/synthetic entitlement outage/);});
