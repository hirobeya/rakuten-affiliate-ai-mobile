'use strict';

const TARGET='https://rakuten-affiliate-ai-mobile-8zq6dyetp-hirobeya-6572.vercel.app';
const SHARE='n8Q99WHwRzr7YpXcjzUx72OP6qMbCLaQ';
const HANDOFF='be3ef143442ecf5961fc03a88e28b0197cdfa25656a90511cabf0aa58e190fd3';
const TOKEN='verify-ac501-post-20260925';

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({message:'not found'});
  if(req.method!=='GET'||String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'not found'});
  try{
    const auth=await fetch(TARGET+'/api/access?action=handoff-status&code='+HANDOFF+'&_vercel_share='+SHARE,{redirect:'manual'});
    const authText=await auth.text();
    const setCookie=auth.headers.get('set-cookie')||'';
    const cookie=setCookie.split(';')[0];
    if(auth.status!==200||!cookie){
      return res.status(502).json({stage:'handoff',status:auth.status,hasCookie:Boolean(cookie),body:authText});
    }
    const body={
      itemCode:'runtime-check',
      itemName:'モバイルバッテリー USB-C対応 本革',
      itemCaption:'',
      itemPrice:2980,
      imageUrl:''
    };
    const ai=await fetch(TARGET+'/api/room-ai?_vercel_share='+SHARE,{
      method:'POST',
      headers:{'content-type':'application/json','cookie':cookie},
      body:JSON.stringify(body)
    });
    const txt=await ai.text();
    let parsed=null; try{parsed=JSON.parse(txt)}catch{}
    return res.status(200).json({
      handoffStatus:auth.status,
      roomAiStatus:ai.status,
      roomAiOk:ai.ok,
      validationMode:parsed?.validation?.mode||null,
      validationRuleVersion:parsed?.validationRuleVersion||null,
      promptVersion:parsed?.promptVersion||null,
      responseOk:parsed?.ok===true,
      message:parsed?.message||null
    });
  }catch(e){
    return res.status(500).json({message:String(e?.message||e)});
  }
};