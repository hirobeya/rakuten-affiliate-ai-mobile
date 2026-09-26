'use strict';

const {authorize}=require('../lib/billing');

function json(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
}

module.exports=async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{message:'Method not allowed'});
  const runtimeEnv=String(process.env.VERCEL_ENV||'');
  if(!['preview','production'].includes(runtimeEnv)) return json(res,404,{message:'Not found'});
  try{
    const auth=await authorize(req);
    if(!auth?.ok) return json(res,403,{message:'access_required'});
    if(runtimeEnv==='preview'&&auth.plan!=='owner') return json(res,403,{message:'owner_preview_only'});
    if(runtimeEnv==='production'&&!['base','pro','owner'].includes(String(auth.plan||''))) return json(res,403,{message:'paid_plan_required'});

    const body=req.body&&typeof req.body==='object'?req.body:{};
    const route=String(body.route||'').trim();
    if(!['local','cache','text','image'].includes(route)) return json(res,400,{message:'invalid_route'});
    const itemCode=String(body.itemCode||'').trim().slice(0,300);
    const reason=String(body.reason||'').trim().slice(0,120);
    const source=String(body.source||'app').trim().slice(0,40);
    const payload={
      route,
      groqCalls:route==='image'?2:(route==='text'?1:0),
      source,
      reason:reason||null,
      itemCode:itemCode||null
    };
    console.log('urenavi ai route',JSON.stringify(payload));
    return json(res,200,{ok:true,route:payload});
  }catch(error){
    console.error('ai route log failed',String(error?.message||'unknown'));
    return json(res,500,{message:'route_log_failed'});
  }
};
