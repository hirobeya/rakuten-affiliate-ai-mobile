'use strict';

const {createHandler}=require('./room-ai-v3');

const handler=createHandler({
  authorize:async()=>({ok:true,plan:'owner',user:{email:'preview-evaluator'}})
});

module.exports=async function(req,res){
  if(String(process.env.VERCEL_ENV||'')!=='preview') return res.status(404).json({message:'Not found'});
  return handler(req,res);
};
