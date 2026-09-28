'use strict';

const base=require('./room-ai-v3');
const {createV3Groq,DEFAULT_MODEL}=require('../lib/super-urenavi-v3-groq');

const handler=base.createHandler({
  authorize:async()=>({ok:true,plan:'owner',user:{email:'preview-evaluator'}}),
  groq:createV3Groq({
    apiKey:String(process.env.GROQ_API_KEY||'').trim(),
    model:String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL,
    fetchImpl:async(...args)=>{
      const response=await fetch(...args);
      if(!response.ok){
        const body=await response.clone().text().catch(()=> '');
        console.error('v3 preview groq upstream',JSON.stringify({status:response.status,body:body.slice(0,1200)}));
      }
      return response;
    }
  })
});

module.exports=async function(req,res){
  if(String(process.env.VERCEL_ENV||'')!=='preview') return res.status(404).json({message:'Not found'});
  return handler(req,res);
};
