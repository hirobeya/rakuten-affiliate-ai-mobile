'use strict';

module.exports=function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const environment=String(process.env.VERCEL_ENV||'');
  return res.status(200).json({
    preview:environment==='preview',
    aiGatesFullOutput:environment==='production'
  });
};
