const {authenticate,config,db,stripeGet,syncSubscription,subscriptionState}=require('../lib/billing');
// Bearer-only authentication: ambient cookies cannot authorize a cancellation.
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({code:'method_not_allowed'});}
  try{
    const auth=await authenticate(req);
    if(!auth.ok)return res.status(auth.status).json({code:'authentication_required'});
    const c=config(),email=auth.user.email.trim().toLowerCase();
    let rows=await db('urenavi_entitlements_v2?'+new URLSearchParams({email:'eq.'+email,livemode:'eq.'+c.live,select:'stripe_subscription_id'}));
    if(c.live)rows=rows.concat(await db('urenavi_entitlements?'+new URLSearchParams({email:'eq.'+email,select:'stripe_subscription_id'})));
    const ids=[...new Set(rows.map(r=>r.stripe_subscription_id).filter(Boolean))];
    const present=sub=>({id:sub.id,status:sub.status,cancel_at_period_end:sub.cancel_at_period_end===true,...subscriptionState(sub)});
    if(req.method==='GET'){
      const subscriptions=[];
      for(const id of ids){const sub=await stripeGet('/subscriptions/'+encodeURIComponent(id));if(sub.livemode!==c.live)throw new Error('mode mismatch');subscriptions.push(present(sub));}
      return res.status(200).json({subscriptions});
    }
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({code:'json_required'});
    const {action,subscription_id}=req.body||{};
    if(action!=='cancel'||typeof subscription_id!=='string')return res.status(400).json({code:'invalid_request'});
    if(!ids.includes(subscription_id))return res.status(404).json({code:'subscription_not_found'});
    const path='/subscriptions/'+encodeURIComponent(subscription_id);
    let sub=await stripeGet(path);
    if(sub.livemode!==c.live)throw new Error('mode mismatch');
    if(sub.status!=='canceled'&&!sub.cancel_at_period_end){
      const r=await fetch('https://api.stripe.com/v1'+path,{method:'POST',headers:{Authorization:`Bearer ${c.key}`,'Stripe-Version':'2026-08-26.dahlia','Content-Type':'application/x-www-form-urlencoded'},body:'cancel_at_period_end=true',signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw new Error('Cancellation unavailable');
      sub=await r.json();
      if(sub.livemode!==c.live||(!sub.cancel_at_period_end&&sub.status!=='canceled'))throw new Error('Cancellation unconfirmed');
    }
    await syncSubscription(subscription_id);
    return res.status(200).json({subscription:present(sub)});
  }catch{return res.status(503).json({code:'service_unavailable',message:'契約状態を確認できませんでした。再読み込みして確認してください。'});}
};
